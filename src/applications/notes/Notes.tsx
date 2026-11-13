"use client";

import { useEffect, useRef, useState } from "react";
import { Columns2, Eye, FileX, NotebookPen, PencilLine, Plus, Search, SearchX, Trash2 } from "lucide-react";
import type { AppComponentProps } from "@/system/runtime/types";
import { useWindow } from "@/system/sdk/window";
import { openDocument, paths, useFileSystem, type SaveState } from "@/system/sdk/fs";
import { useSystemEvent, emitSystemEvent } from "@/system/sdk/events";
import { useLaunchRequests } from "@/system/sdk/launch";
import { oneOf, useAppPreference } from "@/system/sdk/storage";
import { showContextMenu } from "@/system/sdk/context-menu";
import { uniqueName } from "@/system/fs/names";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/ui/Dialog";
import { EmptyState, Spinner } from "@/ui/EmptyState";
import { Button } from "@/ui/Button";
import { IconButton } from "@/ui/IconButton";
import { Markdown } from "@/ui/Markdown";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { fileNameForTitle, filterNotes, isNoteFile, NEW_NOTES_DIR, NOTES_ROOT, snippetOf, titleOf, type NoteSummary } from "./library";

const SEARCH_TEXT_LIMIT = 64 * 1024;
type Mode = "edit" | "split" | "preview";
const isString = (v: unknown) => (typeof v === "string" ? v : null);

/** All notes under ~/Documents, kept current with filesystem events. */
function useNotesLibrary() {
  const fs = useFileSystem();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = (p: string) => (p === NOTES_ROOT || paths.isDescendant(NOTES_ROOT, p) || paths.isDescendant(p, NOTES_ROOT)) && setVersion((v) => v + 1);
  useSystemEvent("fs.created", (e) => refresh(e.path));
  useSystemEvent("fs.modified", (e) => refresh(e.path));
  useSystemEvent("fs.deleted", (e) => refresh(e.path));
  useSystemEvent("fs.moved", (e) => (refresh(e.from), refresh(e.to)));

  useEffect(() => {
    let cancelled = false;
    // Coalesce bursts of events (e.g. autosave + rename) into one scan.
    const t = setTimeout(async () => {
      try {
        await fs.mkdir(NOTES_ROOT, { recursive: true });
        const files = (await fs.walk(NOTES_ROOT)).filter((e) => e.type === "file" && isNoteFile(e.name));
        const summaries = await Promise.all(
          files.map(async (f): Promise<NoteSummary> => {
            const text = f.size <= SEARCH_TEXT_LIMIT ? await fs.readText(f.path).catch(() => "") : "";
            return { path: f.path, name: f.name, title: titleOf(f.name), snippet: snippetOf(text), modifiedAt: f.modifiedAt, searchText: text };
          }),
        );
        if (!cancelled) setNotes(summaries.sort((a, b) => b.modifiedAt - a.modifiedAt));
      } catch {
        if (!cancelled) setNotes([]);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fs, version]);

  return notes;
}

export default function Notes({ args }: AppComponentProps) {
  const fs = useFileSystem();
  const { setTitle } = useWindow();
  const notes = useNotesLibrary();
  const [query, setQuery] = useState("");
  const [lastOpened, setLastOpened, prefsLoaded] = useAppPreference("last", "", isString);
  const [requested, setRequested] = useState<string | null>(typeof args.path === "string" ? args.path : null);
  const [mode, setMode] = useAppPreference<Mode>("mode", "split", oneOf("edit", "split", "preview"));
  const [deleting, setDeleting] = useState<NoteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLaunchRequests((a) => typeof a.path === "string" && setRequested(a.path));

  // Which note is open: an explicit request, else the last opened, else the newest.
  const known = (p: string) => notes?.some((n) => n.path === p);
  const activePath = requested ?? (prefsLoaded && lastOpened && known(lastOpened) ? lastOpened : notes?.[0]?.path ?? null);
  const active = notes?.find((n) => n.path === activePath) ?? null;

  useEffect(() => setTitle(active ? `${active.title} — Notes` : "Notes"), [active, setTitle]);

  const select = (path: string) => {
    setRequested(path);
    setLastOpened(path);
  };

  const create = async () => {
    try {
      await fs.mkdir(NEW_NOTES_DIR, { recursive: true });
      const taken = new Set((await fs.readdir(NEW_NOTES_DIR)).map((e) => e.name));
      const path = paths.join(NEW_NOTES_DIR, uniqueName("Untitled.md", taken));
      await fs.writeFile(path, "");
      setQuery("");
      select(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const visible = notes ? filterNotes(notes, query) : [];

  return (
    <div className="flex h-full bg-surface">
      <aside aria-label="Notes" className="flex w-[248px] shrink-0 flex-col border-r border-line bg-surface-sunken">
        <div className="flex items-center gap-1.5 p-2">
          <div className="relative flex-1">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              aria-label="Search notes"
              spellCheck={false}
              className="h-7 w-full rounded-md border border-line bg-surface pl-7 pr-2 text-[12.5px] text-fg outline-none placeholder:text-subtle focus:border-accent"
            />
          </div>
          <IconButton label="New note" onClick={() => void create()}>
            <Plus size={16} />
          </IconButton>
        </div>
        <div className="nx-scroll min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" role="listbox" aria-label="All notes">
          {notes === null ? (
            <Spinner />
          ) : notes.length === 0 ? (
            <EmptyState icon={NotebookPen} title="No notes yet" description="Notes are saved as Markdown files in Documents." action={<Button onClick={() => void create()}><Plus size={13} /> New Note</Button>} />
          ) : visible.length === 0 ? (
            <EmptyState icon={SearchX} title="No matching notes" />
          ) : (
            visible.map((n) => (
              <button
                key={n.path}
                type="button"
                role="option"
                aria-selected={n.path === activePath}
                onClick={() => select(n.path)}
                onContextMenu={(e) =>
                  showContextMenu(e, n.title, [{ label: "Delete Note…", icon: Trash2, danger: true, onSelect: () => setDeleting(n) }])
                }
                className={cn(
                  "mb-0.5 block w-full rounded-md px-2.5 py-2 text-left transition-colors",
                  n.path === activePath ? "bg-accent-soft" : "hover:bg-hover",
                )}
              >
                <span className="block truncate text-[12.5px] font-medium text-fg">{n.title}</span>
                <span className="mt-0.5 flex gap-2 text-[11.5px] text-subtle">
                  <span className="shrink-0">{formatDate(n.modifiedAt)}</span>
                  <span className="truncate">{n.snippet || "No additional text"}</span>
                </span>
              </button>
            ))
          )}
        </div>
        {error && <p role="alert" className="border-t border-line px-3 py-2 text-[11.5px] text-danger">{error}</p>}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {activePath && notes !== null ? (
          <NoteEditor
            key={activePath}
            path={activePath}
            mode={mode}
            onMode={setMode}
            onMoved={select}
            onDelete={() => active && setDeleting(active)}
            outside={!paths.isDescendant(NOTES_ROOT, activePath)}
          />
        ) : notes === null ? (
          <Spinner />
        ) : (
          <EmptyState icon={NotebookPen} title="No note selected" description="Choose a note, or create a new one." />
        )}
      </main>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.title ?? ""}”?`}
        description="The note’s file will be permanently deleted."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          await fs.remove(deleting.path);
          if (deleting.path === activePath) setRequested(null);
        }}
      />
    </div>
  );
}

/* ─────────────────────────────── Editor ─────────────────────────────── */

interface NoteEditorProps {
  path: string;
  mode: Mode;
  onMode(mode: Mode): void;
  onMoved(path: string): void;
  onDelete(): void;
  /** The file lives outside ~/Documents (opened from Files). */
  outside: boolean;
}

function NoteEditor({ path, mode, onMode, onMoved, onDelete, outside }: NoteEditorProps) {
  const fs = useFileSystem();
  const [text, setText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [deleted, setDeleted] = useState(false);
  const [title, setTitleDraft] = useState(paths.basename(path).replace(/\.[^.]+$/, ""));
  const [renameError, setRenameError] = useState<string | null>(null);
  const docRef = useRef<ReturnType<typeof openDocument> | null>(null);

  useEffect(() => {
    const doc = openDocument(path, {
      onSaveState: setSaveState,
      onExternalChange: setText,
      onMoved,
      onDeleted: () => setDeleted(true),
    });
    docRef.current = doc;
    doc.load().then(
      (t) => {
        setText(t);
        emitSystemEvent("file.opened", { path, appId: "nexus.notes" });
      },
      (e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      // Persist pending edits before switching notes or closing the window.
      void doc.flush().finally(() => doc.dispose());
      docRef.current = null;
    };
    // The session follows renames itself, so it must not be recreated when `path` changes because of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (value: string) => {
    setText(value);
    docRef.current?.update(value);
  };

  const commitTitle = async () => {
    const doc = docRef.current;
    if (!doc) return;
    const current = doc.path;
    const ext = paths.extname(current) || ".md";
    const name = fileNameForTitle(title, ext);
    if (name === paths.basename(current)) return;
    try {
      await doc.flush();
      await fs.rename(current, paths.join(paths.dirname(current), name));
      setRenameError(null);
    } catch (e) {
      setRenameError(e instanceof Error && e.message.includes("exists") ? `A note named “${name}” already exists` : String(e));
      setTitleDraft(paths.basename(current).replace(/\.[^.]+$/, ""));
    }
  };

  if (loadError) return <EmptyState icon={FileX} tone="danger" title="This note couldn’t be opened" description={loadError} />;
  if (deleted) return <EmptyState icon={FileX} title="This note was deleted" description="It was removed by another app." />;
  if (text === null) return <Spinner />;

  const isMarkdown = paths.extname(path) !== ".txt";
  const effectiveMode: Mode = isMarkdown ? mode : "edit";

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          void docRef.current?.flush();
        }
      }}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <input
          value={title}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Note title"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-[-0.01em] text-fg outline-none"
        />
        <SaveIndicator state={saveState} />
        {isMarkdown && (
          <SegmentedControl<Mode>
            aria-label="Editor layout"
            size="sm"
            value={mode}
            onChange={onMode}
            options={[
              { value: "edit", label: <PencilLine size={13} />, ariaLabel: "Edit" },
              { value: "split", label: <Columns2 size={13} />, ariaLabel: "Split" },
              { value: "preview", label: <Eye size={13} />, ariaLabel: "Preview" },
            ]}
          />
        )}
        <IconButton label="Delete note" onClick={onDelete}>
          <Trash2 size={14} />
        </IconButton>
      </header>
      {(renameError || outside) && (
        <p className={cn("border-b border-line px-4 py-1.5 text-[11.5px]", renameError ? "text-danger" : "text-subtle")} role={renameError ? "alert" : undefined}>
          {renameError ?? `Editing ${paths.displayPath(path)} (outside Documents)`}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        {effectiveMode !== "preview" && (
          <textarea
            value={text}
            onChange={(e) => edit(e.target.value)}
            aria-label="Note text"
            placeholder="Start writing… Markdown is supported."
            spellCheck
            autoFocus={text === ""}
            className={cn(
              "nx-scroll min-w-0 flex-1 resize-none bg-surface px-6 py-5 font-mono text-[13px] leading-[1.75] text-fg outline-none placeholder:text-subtle",
              effectiveMode === "split" && "border-r border-line",
            )}
          />
        )}
        {effectiveMode !== "edit" && (
          <div className="nx-scroll min-w-0 flex-1 overflow-y-auto bg-surface px-7 py-5" aria-label="Preview">
            {text.trim() ? <Markdown source={text} /> : <p className="text-[13px] italic text-subtle">Nothing to preview yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const label = { saved: "Saved", dirty: "Edited", saving: "Saving…", error: "Couldn’t save" }[state];
  return (
    <span role="status" data-save-state={state} className={cn("shrink-0 text-[11.5px]", state === "error" ? "text-danger" : "text-subtle")}>
      {label}
    </span>
  );
}
