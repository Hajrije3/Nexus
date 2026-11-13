/**
 * Text document sessions: the shared "open file in an editor" model used by
 * Notes and Code Studio.
 *
 * A session owns one file's editing lifecycle:
 *  - debounced autosave with an observable save state;
 *  - external edits (another app writes the file) reload the buffer when it
 *    has no unsaved changes — our own saves are recognised and ignored;
 *  - the session follows the file when it (or a parent folder) is moved;
 *  - deletion is reported so the UI can react.
 */
import type { VirtualFileSystem } from "./fs/vfs";
import type { EventBus, Unsubscribe } from "./events/bus";
import type { SystemEventMap } from "./events/types";
import { isDescendant } from "./fs/path";

export type SaveState = "saved" | "dirty" | "saving" | "error";

export interface DocumentCallbacks {
  onSaveState?(state: SaveState, error?: unknown): void;
  /** The file changed on disk and the buffer was clean: here is the new text. */
  onExternalChange?(text: string): void;
  onMoved?(path: string): void;
  onDeleted?(): void;
}

export class TextDocumentSession {
  private text = "";
  private savedText = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private state: SaveState = "saved";
  private disposed = false;
  private readonly unsubscribe: Unsubscribe[];
  /** When false, changes are only written by `flush()` (explicit save). */
  autosave = true;

  constructor(
    private readonly fs: Pick<VirtualFileSystem, "readText" | "writeFile">,
    private currentPath: string,
    events: EventBus<SystemEventMap>,
    private readonly callbacks: DocumentCallbacks = {},
    private readonly debounceMs = 600,
  ) {
    this.unsubscribe = [
      events.on("fs.modified", ({ path }) => path === this.currentPath && void this.checkExternal()),
      events.on("fs.moved", ({ from, to }) => {
        if (this.currentPath === from || isDescendant(from, this.currentPath)) {
          this.currentPath = to + this.currentPath.slice(from.length);
          callbacks.onMoved?.(this.currentPath);
        }
      }),
      events.on("fs.deleted", ({ path }) => {
        if (this.currentPath === path || isDescendant(path, this.currentPath)) {
          this.cancelTimer();
          callbacks.onDeleted?.();
        }
      }),
    ];
  }

  get path(): string {
    return this.currentPath;
  }

  get saveState(): SaveState {
    return this.state;
  }

  get isDirty(): boolean {
    return this.text !== this.savedText;
  }

  async load(): Promise<string> {
    this.text = this.savedText = await this.fs.readText(this.currentPath);
    this.setState("saved");
    return this.text;
  }

  /** Record an edit; schedules a save. */
  update(text: string): void {
    if (this.disposed || text === this.text) return;
    this.text = text;
    this.setState(this.isDirty ? "dirty" : "saved");
    this.cancelTimer();
    if (this.isDirty && this.autosave) this.timer = setTimeout(() => void this.save(), this.debounceMs);
  }

  /** Save now if there are unsaved changes (Ctrl+S, switching documents, closing). */
  async flush(): Promise<void> {
    this.cancelTimer();
    if (this.saving) await this.saving;
    if (this.isDirty) await this.save();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
    this.unsubscribe.forEach((off) => off());
  }

  private async save(): Promise<void> {
    this.timer = null;
    const snapshot = this.text;
    this.setState("saving");
    const op = (async () => {
      try {
        await this.fs.writeFile(this.currentPath, snapshot);
        this.savedText = snapshot;
        this.setState(this.isDirty ? "dirty" : "saved");
        // Edits made while saving need their own save.
        if (this.isDirty && this.autosave && !this.timer && !this.disposed) this.timer = setTimeout(() => void this.save(), this.debounceMs);
      } catch (error) {
        this.setState("error", error);
      }
    })();
    this.saving = op;
    await op;
    if (this.saving === op) this.saving = null;
  }

  private async checkExternal(): Promise<void> {
    if (this.disposed) return;
    let disk: string;
    try {
      disk = await this.fs.readText(this.currentPath);
    } catch {
      return;
    }
    if (disk === this.savedText) return; // our own save, or no real change
    if (this.isDirty) return; // keep the user's unsaved edits; their next save wins
    this.text = this.savedText = disk;
    this.callbacks.onExternalChange?.(disk);
  }

  private cancelTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(state: SaveState, error?: unknown): void {
    if (state === this.state && state !== "error") return;
    this.state = state;
    this.callbacks.onSaveState?.(state, error);
  }
}
