"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { Code2, FilePlus, FileWarning, FolderInput, FolderPlus, X } from "lucide-react";
import type { AppComponentProps } from "@/system/runtime/types";
import { useWindow } from "@/system/sdk/window";
import { openDocument, paths, useFileSystem, type FsStat, type SaveState } from "@/system/sdk/fs";
import { emitSystemEvent } from "@/system/sdk/events";
import { useLaunchRequests } from "@/system/sdk/launch";
import { useAppPreference } from "@/system/sdk/storage";
import { useEffectiveTheme } from "@/system/sdk/system";
import type { TextDocumentSession } from "@/system/documents";
import { isTextMime, mimeTypeFor } from "@/system/fs/mime";
import { createId, cn } from "@/lib/utils";
import { ConfirmDialog, PromptDialog, WindowDialog } from "@/ui/Dialog";
import { EmptyState, Spinner } from "@/ui/EmptyState";
import { Button } from "@/ui/Button";
import { FileIcon } from "@/ui/FileIcon";
import { IconButton } from "@/ui/IconButton";
import { nameProblem } from "@/system/fs/names";
import { FileTree } from "./FileTree";
import { languageFor, modelUri } from "./languages";
import { defineThemes, THEME } from "./monaco-setup";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface Workspace {
  root: string;
  tabs: string[];
  active: string | null;
  expanded: string[];
  autosave: boolean;
}

const DEFAULT_WORKSPACE: Workspace = { root: `${paths.HOME}/Projects`, tabs: [], active: null, expanded: [], autosave: true };

function parseWorkspace(v: unknown): Workspace | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    root: typeof r.root === "string" ? r.root : DEFAULT_WORKSPACE.root,
    tabs: strings(r.tabs),
    active: typeof r.active === "string" ? r.active : null,
    expanded: strings(r.expanded),
    autosave: typeof r.autosave === "boolean" ? r.autosave : true,
  };
}

interface Tab {
  key: string;
  path: string;
  deleted?: boolean;
}

type Dialog =
  | { kind: "new"; type: "file" | "folder"; dir: string }
  | { kind: "rename"; entry: FsStat }
  | { kind: "delete"; entry: FsStat }
  | { kind: "open-folder" }
  | { kind: "unsaved"; key: string; name: string }
  | null;

export default function CodeStudio({ args }: AppComponentProps) {
  const fs = useFileSystem();
  const theme = useEffectiveTheme();
  const { setTitle } = useWindow();
  const [workspace, setWorkspace, loaded] = useAppPreference("workspace", DEFAULT_WORKSPACE, parseWorkspace);

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sessions = useRef(new Map<string, TextDocumentSession>());
  const tabPaths = useRef(new Map<string, string>());
  const monacoRef = useRef<Monaco | null>(null);
  const restored = useRef(false);

  const active = tabs.find((t) => t.key === activeKey) ?? null;
  const root = workspace.root;

  useEffect(() => setTitle(active ? `${paths.basename(active.path)} — Code Studio` : "Code Studio"), [active, setTitle]);

  /* ────────────────────────────── Tabs ────────────────────────────── */

  const getModel = (path: string) => monacoRef.current?.editor.getModel(monacoRef.current.Uri.parse(modelUri(path))) ?? null;

  const moveTab = (key: string, newPath: string) => {
    const oldPath = tabPaths.current.get(key);
    const monaco = monacoRef.current;
    const old = oldPath ? getModel(oldPath) : null;
    if (monaco && old && oldPath !== newPath) {
      // Model URIs are immutable: carry the buffer (including unsaved edits) to a new model.
      if (!getModel(newPath)) monaco.editor.createModel(old.getValue(), languageFor(newPath).id, monaco.Uri.parse(modelUri(newPath)));
      setTimeout(() => old.dispose(), 50);
    }
    tabPaths.current.set(key, newPath);
    setTabs((ts) => ts.map((t) => (t.key === key ? { ...t, path: newPath } : t)));
  };

  const openFile = async (path: string, { activate = true } = {}): Promise<void> => {
    const existing = [...tabPaths.current].find(([, p]) => p === path)?.[0];
    if (existing) {
      if (activate) setActiveKey(existing);
      return;
    }
    let stat: FsStat;
    try {
      stat = await fs.stat(path);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
      return;
    }
    if (stat.type === "directory") return;
    if (!isTextMime(mimeTypeFor(path))) return setNotice(`“${stat.name}” is a binary file and can’t be edited here.`);
    if (stat.size > MAX_FILE_BYTES) return setNotice(`“${stat.name}” is larger than 5 MB.`);

    const key = createId("tab");
    const session = openDocument(
      path,
      {
        onSaveState: (s) => setSaveStates((m) => ({ ...m, [key]: s })),
        onExternalChange: (text) => {
          const model = getModel(session.path);
          if (model && model.getValue() !== text) model.setValue(text);
          setInitial((m) => ({ ...m, [key]: text }));
        },
        onMoved: (p) => moveTab(key, p),
        onDeleted: () => setTabs((ts) => ts.map((t) => (t.key === key ? { ...t, deleted: true } : t))),
      },
      800,
    );
    session.autosave = workspace.autosave;
    try {
      const text = await session.load();
      sessions.current.set(key, session);
      tabPaths.current.set(key, path);
      setInitial((m) => ({ ...m, [key]: text }));
      setTabs((ts) => [...ts, { key, path }]);
      if (activate) setActiveKey(key);
      emitSystemEvent("file.opened", { path, appId: "nexus.code-studio" });
    } catch (e) {
      session.dispose();
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };

  const discardTab = (key: string) => {
    // tabPaths preserves tab order, so the neighbour is the next (or previous) key.
    const order = [...tabPaths.current.keys()];
    const i = order.indexOf(key);
    const neighbour = order[i + 1] ?? order[i - 1] ?? null;
    const path = tabPaths.current.get(key);
    sessions.current.get(key)?.dispose();
    sessions.current.delete(key);
    tabPaths.current.delete(key);
    if (path) setTimeout(() => getModel(path)?.dispose(), 50);
    setTabs((ts) => ts.filter((t) => t.key !== key));
    setActiveKey((current) => (current === key ? neighbour : current));
  };

  const closeTab = async (key: string) => {
    const session = sessions.current.get(key);
    const tab = tabs.find((t) => t.key === key);
    if (session?.isDirty && tab && !tab.deleted && !session.autosave) return setDialog({ kind: "unsaved", key, name: paths.basename(tab.path) });
    if (!tab?.deleted) await session?.flush();
    discardTab(key);
  };

  // Restore the previous workspace once preferences have loaded, then honour launch args.
  useEffect(() => {
    if (!loaded || restored.current) return;
    restored.current = true;
    setExpanded(new Set(workspace.expanded));
    void (async () => {
      for (const p of workspace.tabs) await openFile(p, { activate: false });
      const want = typeof args.path === "string" ? args.path : workspace.active;
      if (want) await openFile(want);
      else setActiveKey((k) => k ?? [...tabPaths.current.keys()][0] ?? null);
    })();
    // Runs once, after preferences load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useLaunchRequests((a) => typeof a.path === "string" && void openFile(a.path));

  // Persist the workspace (open tabs, active file, expanded folders).
  useEffect(() => {
    if (!restored.current) return;
    setWorkspace({ ...workspace, tabs: tabs.filter((t) => !t.deleted).map((t) => t.path), active: active?.path ?? null, expanded: [...expanded] });
    // `workspace` is what we're writing; including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, active?.path, expanded]);

  // Flush everything when the window closes.
  useEffect(() => {
    const map = sessions.current;
    return () => {
      for (const s of map.values()) void s.flush().finally(() => s.dispose());
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const setAutosave = (on: boolean) => {
    for (const s of sessions.current.values()) {
      s.autosave = on;
      if (on) void s.flush();
    }
    setWorkspace({ ...workspace, autosave: on });
  };

  /* ───────────────────────────── Editor ───────────────────────────── */

  const onMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editor.onDidChangeCursorPosition((e) => setCursor({ line: e.position.lineNumber, column: e.position.column }));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const key = [...tabPaths.current].find(([, p]) => modelUri(p) === editor.getModel()?.uri.toString())?.[0];
      if (key) void sessions.current.get(key)?.flush();
    });
  };

  const sameNames = new Map<string, number>();
  for (const t of tabs) sameNames.set(paths.basename(t.path), (sameNames.get(paths.basename(t.path)) ?? 0) + 1);

  const saveState = active ? (saveStates[active.key] ?? "saved") : null;

  return (
    <div className="flex h-full bg-surface">
      {/* Explorer */}
      <aside aria-label="Explorer" className="flex w-[220px] shrink-0 flex-col border-r border-line bg-surface-sunken">
        <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pl-3 pr-1">
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold uppercase tracking-wide text-subtle" title={root}>
            {paths.basename(root) || "/"}
          </span>
          <IconButton size="sm" label="New file" onClick={() => setDialog({ kind: "new", type: "file", dir: root })}>
            <FilePlus size={13} />
          </IconButton>
          <IconButton size="sm" label="New folder" onClick={() => setDialog({ kind: "new", type: "folder", dir: root })}>
            <FolderPlus size={13} />
          </IconButton>
          <IconButton size="sm" label="Open folder" onClick={() => setDialog({ kind: "open-folder" })}>
            <FolderInput size={13} />
          </IconButton>
        </div>
        <div className="nx-scroll min-h-0 flex-1 overflow-y-auto">
          {loaded ? (
            <FileTree
              root={root}
              expanded={expanded}
              activePath={active?.path ?? null}
              onToggle={(p) =>
                setExpanded((s) => {
                  const next = new Set(s);
                  if (next.has(p)) next.delete(p);
                  else next.add(p);
                  return next;
                })
              }
              onOpenFile={(p) => void openFile(p)}
              onNew={(type, dir) => setDialog({ kind: "new", type, dir })}
              onRename={(entry) => setDialog({ kind: "rename", entry })}
              onDelete={(entry) => setDialog({ kind: "delete", entry })}
            />
          ) : (
            <Spinner />
          )}
        </div>
      </aside>

      {/* Editor area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {tabs.length > 0 && (
          <div role="tablist" aria-label="Open files" className="nx-scroll flex h-9 shrink-0 overflow-x-auto border-b border-line bg-surface-sunken">
            {tabs.map((t) => {
              const name = paths.basename(t.path);
              const state = saveStates[t.key] ?? "saved";
              const selected = t.key === activeKey;
              return (
                <div
                  key={t.key}
                  role="tab"
                  aria-selected={selected}
                  title={t.path}
                  data-tab={name}
                  onClick={() => setActiveKey(t.key)}
                  onAuxClick={(e) => e.button === 1 && void closeTab(t.key)}
                  className={cn(
                    "group flex shrink-0 cursor-default items-center gap-1.5 border-r border-line pl-3 pr-1.5 text-[12.5px]",
                    selected ? "bg-surface text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <FileIcon name={name} type="file" size={13} />
                  <span className={cn("max-w-[160px] truncate", t.deleted && "text-danger line-through")}>{name}</span>
                  {(sameNames.get(name) ?? 0) > 1 && <span className="text-[11px] text-subtle">{paths.basename(paths.dirname(t.path))}</span>}
                  <button
                    type="button"
                    aria-label={`Close ${name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void closeTab(t.key);
                    }}
                    className="relative grid size-5 place-items-center rounded text-subtle hover:bg-active hover:text-fg"
                  >
                    {state === "dirty" || state === "saving" ? (
                      <>
                        <span className="size-2 rounded-full bg-fg/70 group-hover:hidden" aria-label="Unsaved changes" />
                        <X size={13} className="hidden group-hover:block" />
                      </>
                    ) : (
                      <X size={13} className={cn(!selected && "opacity-0 group-hover:opacity-100")} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          {active ? (
            <>
              {active.deleted && (
                <div role="alert" className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-[12px] text-fg">
                  <FileWarning size={14} className="text-danger" /> This file was deleted. The editor is read-only.
                </div>
              )}
              <Editor
                path={modelUri(active.path)}
                defaultValue={initial[active.key] ?? ""}
                language={languageFor(active.path).id}
                theme={theme === "dark" ? THEME.dark : THEME.light}
                beforeMount={defineThemes}
                onMount={onMount}
                onChange={(value) => sessions.current.get(active.key)?.update(value ?? "")}
                loading={<Spinner label="Loading editor" />}
                options={{
                  readOnly: !!active.deleted,
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  fontSize: 13,
                  lineHeight: 20,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  padding: { top: 10 },
                  smoothScrolling: true,
                  renderLineHighlight: "line",
                  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                }}
              />
            </>
          ) : (
            <EmptyState
              icon={Code2}
              title="No file open"
              description={`Open a file from the Explorer, or from Files with “Open with Code Studio”.`}
              action={
                <Button onClick={() => setDialog({ kind: "new", type: "file", dir: root })}>
                  <FilePlus size={13} /> New File
                </Button>
              }
            />
          )}
        </div>

        <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-surface-sunken px-3 text-[11px] text-subtle" aria-live="polite">
          {active ? (
            <>
              <span className="truncate">{paths.displayPath(active.path)}</span>
              <span className="ml-auto tabular-nums">
                Ln {cursor.line}, Col {cursor.column}
              </span>
              <span>{languageFor(active.path).label}</span>
              <span data-save-state={saveState} className={cn(saveState === "error" && "text-danger")}>
                {{ saved: "Saved", dirty: "Unsaved", saving: "Saving…", error: "Couldn’t save" }[saveState ?? "saved"]}
              </span>
            </>
          ) : (
            <span className="truncate">{paths.displayPath(root)}</span>
          )}
          {notice && <span className={cn("truncate text-danger", !active && "ml-auto")}>{notice}</span>}
          <button
            type="button"
            onClick={() => setAutosave(!workspace.autosave)}
            aria-pressed={workspace.autosave}
            className={cn("shrink-0 rounded px-1.5 hover:bg-hover hover:text-fg", !active && !notice && "ml-auto", workspace.autosave ? "text-muted" : "text-subtle")}
          >
            Autosave: {workspace.autosave ? "On" : "Off"}
          </button>
        </footer>
      </div>

      {/* Dialogs */}
      <PromptDialog
        open={dialog?.kind === "new"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "new" && dialog.type === "folder" ? "New Folder" : "New File"}
        label="Name"
        initialValue={dialog?.kind === "new" && dialog.type === "folder" ? "src" : "index.ts"}
        selectStem={dialog?.kind === "new" && dialog.type === "file"}
        confirmLabel="Create"
        validate={(name) => nameProblem(name, new Set())}
        onSubmit={async (name) => {
          if (dialog?.kind !== "new") return;
          const target = paths.join(dialog.dir, name);
          if (await fs.exists(target)) throw new Error(`“${name}” already exists`);
          if (dialog.type === "folder") await fs.mkdir(target);
          else {
            await fs.writeFile(target, "");
            await openFile(target);
          }
          if (dialog.dir !== root) setExpanded((s) => new Set(s).add(dialog.dir));
        }}
      />
      <PromptDialog
        open={dialog?.kind === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Rename"
        label="Name"
        initialValue={dialog?.kind === "rename" ? dialog.entry.name : ""}
        selectStem={dialog?.kind === "rename" && dialog.entry.type === "file"}
        confirmLabel="Rename"
        validate={(name) => nameProblem(name, new Set())}
        onSubmit={async (name) => {
          if (dialog?.kind !== "rename" || name === dialog.entry.name) return;
          await fs.rename(dialog.entry.path, paths.join(paths.dirname(dialog.entry.path), name));
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete “${dialog?.kind === "delete" ? dialog.entry.name : ""}”?`}
        description={dialog?.kind === "delete" && dialog.entry.type === "directory" ? "The folder and everything in it will be deleted." : "This can’t be undone."}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await fs.remove(dialog.entry.path, { recursive: true });
        }}
      />
      <PromptDialog
        open={dialog?.kind === "open-folder"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Open Folder"
        label="Folder path"
        initialValue={paths.displayPath(root)}
        confirmLabel="Open"
        validate={() => null}
        onSubmit={async (input) => {
          const target = paths.resolve(paths.HOME, input);
          const s = await fs.stat(target).catch(() => null);
          if (!s || s.type !== "directory") throw new Error(`“${input}” is not a folder`);
          setExpanded(new Set());
          setWorkspace({ ...workspace, root: s.path, expanded: [] });
        }}
      />
      <WindowDialog
        open={dialog?.kind === "unsaved"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Save changes to “${dialog?.kind === "unsaved" ? dialog.name : ""}”?`}
        description="Your changes will be lost if you don’t save them."
      >
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (dialog?.kind === "unsaved") discardTab(dialog.key);
              setDialog(null);
            }}
          >
            Don’t Save
          </Button>
          <Button
            variant="primary"
            autoFocus
            onClick={async () => {
              if (dialog?.kind !== "unsaved") return;
              await sessions.current.get(dialog.key)?.flush();
              discardTab(dialog.key);
              setDialog(null);
            }}
          >
            Save
          </Button>
        </div>
      </WindowDialog>
    </div>
  );
}
