"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ClipboardPaste, Eye, EyeOff, Copy, CopyPlus, Download, FilePlus, FolderOpen, FolderPlus, FolderX, Pencil, Scissors, SearchX, SquareTerminal, Trash2 } from "lucide-react";
import type { AppComponentProps } from "@/system/runtime/types";
import { useWindow } from "@/system/sdk/window";
import { useDirectory, useFileSystem, type FsStat } from "@/system/sdk/fs";
import { useSystemEvent } from "@/system/sdk/events";
import { launchApp, openPath, useAppsForFile } from "@/system/sdk/launch";
import { showContextMenu, tidyMenu, type MenuItem } from "@/system/sdk/context-menu";
import { oneOf, useAppPreference } from "@/system/sdk/storage";
import { basename, dirname, HOME, isDescendant, join, normalize, ROOT } from "@/system/fs/path";
import { pasteInto, setFileClipboard, useFileClipboard } from "@/system/clipboard";
import { ConfirmDialog, PromptDialog } from "@/ui/Dialog";
import { EmptyState, Spinner } from "@/ui/EmptyState";
import { Button } from "@/ui/Button";
import { cn } from "@/lib/utils";
import {
  canGoBack,
  canGoForward,
  createHistory,
  currentPath,
  emptySelection,
  filterEntries,
  goBack,
  goForward,
  moveFocus,
  navigate,
  pruneSelection,
  replaceCurrent,
  select,
  selectAll,
  sortEntries,
  type KindFilter,
  type Sort,
  type SortKey,
} from "./model";
import { DRAG_MIME, GridView, ListView } from "./ItemsView";
import { PreviewPane } from "./PreviewPane";
import { Sidebar, Toolbar } from "./parts";
import { downloadFile, nameProblem, uploadFiles } from "./io";

type Dialog =
  | { kind: "new-folder" }
  | { kind: "new-file" }
  | { kind: "rename"; entry: FsStat }
  | { kind: "delete"; entries: FsStat[] }
  | null;

const isBool = (v: unknown) => (typeof v === "boolean" ? v : null);

/** Recursive name search under the current folder, debounced, live-updating. */
function useSearch(root: string, query: string) {
  const fs = useFileSystem();
  const q = query.trim();
  const [state, setState] = useState<{ key: string; results: FsStat[] } | null>(null);
  const [version, setVersion] = useState(0);
  const key = `${root}\n${q}\n${version}`;
  const bump = () => q && setVersion((v) => v + 1);
  useSystemEvent("fs.created", bump);
  useSystemEvent("fs.deleted", bump);
  useSystemEvent("fs.moved", bump);

  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fs.search(q, { root, limit: 300 }).then((results) => !cancelled && setState({ key, results }));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fs, root, q, key]);

  if (!q) return { active: false, loading: false, results: [] as FsStat[] };
  return { active: true, loading: state?.key !== key && !state, results: state?.results ?? [] };
}

export default function Files({ args }: AppComponentProps) {
  const fs = useFileSystem();
  const { setTitle } = useWindow();
  const [history, setHistory] = useState(() => createHistory(typeof args.path === "string" ? normalize(args.path) : HOME));
  const path = currentPath(history);
  const listing = useDirectory(path);

  const [view, setView] = useAppPreference("view", "grid", oneOf("grid", "list"));
  const [showPreview, setShowPreview] = useAppPreference("preview", true, isBool);
  const [showHidden, setShowHidden] = useAppPreference("hidden", false, isBool);
  const [sort, setSort] = useState<Sort>({ key: "name", dir: "asc" });
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const search = useSearch(path, query);
  const [selection, setSelection] = useState(emptySelection);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const clipboard = useFileClipboard((s) => s.entry);
  const viewRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const folderName = path === ROOT ? "Computer" : path === HOME ? "Home" : basename(path);
  useEffect(() => setTitle(folderName), [folderName, setTitle]);

  // Follow the open folder if it (or an ancestor) is moved or renamed elsewhere.
  useSystemEvent("fs.moved", ({ from, to }) => {
    if (path === from || isDescendant(from, path)) setHistory((h) => replaceCurrent(h, to + path.slice(from.length)));
  });

  // Notices fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const source = search.active ? search.results : listing.entries;
  const entries = sortEntries(filterEntries(source, kind, showHidden), sort);
  const order = entries.map((e) => e.id);
  const sel = pruneSelection(selection, order);
  const selected = entries.filter((e) => sel.ids.has(e.id));
  const siblings = new Set(listing.entries.map((e) => e.name));
  const cutPaths = new Set(clipboard?.mode === "cut" ? clipboard.paths : []);

  /* ───────────────────────────── Actions ───────────────────────────── */

  const report = (error: unknown) => setNotice({ text: error instanceof Error ? error.message : String(error), tone: "error" });

  const go = (next: string) => {
    setHistory((h) => navigate(h, next));
    setSelection(emptySelection);
    setQuery("");
  };

  const open = async (entry: FsStat, appId?: string) => {
    if (entry.type === "directory" && !appId) return go(entry.path);
    const r = await openPath(entry.path, appId);
    if (!r.ok) report(r.error);
  };

  const selectPath = async (p: string) => {
    try {
      const s = await fs.stat(p);
      setSelection({ ids: new Set([s.id]), anchor: s.id, focus: s.id });
    } catch {
      /* already gone */
    }
  };

  const copyOrCut = (mode: "copy" | "cut", items: FsStat[]) => {
    if (!items.length) return;
    setFileClipboard({ mode, paths: items.map((e) => e.path) });
    setNotice({ text: `${mode === "cut" ? "Cut" : "Copied"} ${items.length === 1 ? `“${items[0]!.name}”` : `${items.length} items`}`, tone: "info" });
  };

  const paste = async (into = path) => {
    if (!clipboard) return;
    const r = await pasteInto(fs, clipboard, into);
    if (r.errors.length) report(r.errors[0]!.message);
    if (into === path && r.pasted.length === 1) await selectPath(r.pasted[0]!);
  };

  const duplicate = async (items: FsStat[]) => {
    const groups = new Map<string, string[]>();
    for (const e of items) groups.set(dirname(e.path), [...(groups.get(dirname(e.path)) ?? []), e.path]);
    for (const [dir, paths] of groups) {
      const r = await pasteInto(fs, { mode: "copy", paths }, dir);
      if (r.errors.length) report(r.errors[0]!.message);
    }
  };

  const moveInto = async (paths: string[], dest: string) => {
    const valid = paths.filter((p) => dirname(p) !== dest);
    if (!valid.length) return;
    const r = await pasteInto(fs, { mode: "cut", paths: valid }, dest);
    if (r.errors.length) report(r.errors[0]!.message);
  };

  const upload = async (files: Iterable<File>, dest = path) => {
    const r = await uploadFiles(fs, files, dest);
    if (r.skipped.length) report(`Couldn’t add “${r.skipped[0]!.name}”: ${r.skipped[0]!.reason}`);
    else if (r.written.length) setNotice({ text: `Added ${r.written.length} ${r.written.length === 1 ? "file" : "files"}`, tone: "info" });
  };

  /** Handle a drop of internal paths or external files into `dest`. */
  const dropInto = (e: React.DragEvent, dest: string) => {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (raw) {
      const paths = JSON.parse(raw) as unknown;
      if (Array.isArray(paths)) void moveInto(paths.filter((p): p is string => typeof p === "string"), dest);
    } else if (e.dataTransfer.files.length) {
      void upload(Array.from(e.dataTransfer.files), dest);
    }
  };

  /* ─────────────────────────── Context menus ─────────────────────────── */

  const openWithApps = useAppsForFile(selected.length === 1 && selected[0]!.type === "file" ? selected[0]!.path : null);

  const itemMenu = (entry: FsStat): MenuItem[] => {
    const items = sel.ids.has(entry.id) ? selected : [entry];
    const one = items.length === 1 ? items[0]! : null;
    return tidyMenu([
      one && { label: "Open", icon: FolderOpen, onSelect: () => void open(one) },
      ...(one?.type === "file"
        ? openWithApps.slice(1).map((app): MenuItem => ({ label: `Open with ${app.name}`, icon: ArrowUpRight, onSelect: () => void open(one, app.id) }))
        : []),
      one?.type === "directory" && { label: "Open in Terminal", icon: SquareTerminal, onSelect: () => launchApp("nexus.terminal", { cwd: one.path }) },
      search.active && one && { label: "Show in Folder", icon: FolderOpen, onSelect: () => (go(dirname(one.path)), void selectPath(one.path)) },
      { kind: "separator" },
      { label: "Cut", icon: Scissors, shortcut: "Ctrl X", onSelect: () => copyOrCut("cut", items) },
      { label: "Copy", icon: Copy, shortcut: "Ctrl C", onSelect: () => copyOrCut("copy", items) },
      { label: "Duplicate", icon: CopyPlus, onSelect: () => void duplicate(items) },
      one && { label: "Rename…", icon: Pencil, shortcut: "F2", onSelect: () => setDialog({ kind: "rename", entry: one }) },
      one?.type === "file" && { label: "Download", icon: Download, onSelect: () => void downloadFile(fs, one.path, one.name).catch(report) },
      { kind: "separator" },
      { label: items.length > 1 ? `Delete ${items.length} Items…` : "Delete…", icon: Trash2, shortcut: "Del", danger: true, onSelect: () => setDialog({ kind: "delete", entries: items }) },
    ]);
  };

  const backgroundMenu = (): MenuItem[] =>
    tidyMenu([
      { label: "New Folder…", icon: FolderPlus, onSelect: () => setDialog({ kind: "new-folder" }) },
      { label: "New File…", icon: FilePlus, onSelect: () => setDialog({ kind: "new-file" }) },
      { kind: "separator" },
      { label: "Paste", icon: ClipboardPaste, shortcut: "Ctrl V", disabled: !clipboard, onSelect: () => void paste() },
      { kind: "separator" },
      { label: "Open in Terminal", icon: SquareTerminal, onSelect: () => launchApp("nexus.terminal", { cwd: path }) },
      { label: showHidden ? "Hide Hidden Files" : "Show Hidden Files", icon: showHidden ? EyeOff : Eye, onSelect: () => setShowHidden(!showHidden) },
    ]);

  /* ────────────────────────────── Keyboard ────────────────────────────── */

  const columns = () => {
    const grid = viewRef.current?.querySelector('[data-view="grid"]');
    return grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 1;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    const mod = e.ctrlKey || e.metaKey;
    const focused = entries.find((x) => x.id === sel.focus);
    const step = (delta: number) => {
      e.preventDefault();
      setSelection(moveFocus(sel, order, delta, e.shiftKey));
    };
    if (e.key === "ArrowRight" && view === "grid") step(1);
    else if (e.key === "ArrowLeft" && view === "grid") step(-1);
    else if (e.key === "ArrowDown") step(view === "grid" ? columns() : 1);
    else if (e.key === "ArrowUp" && e.altKey) {
      e.preventDefault();
      if (path !== ROOT) go(dirname(path));
    } else if (e.key === "ArrowUp") step(view === "grid" ? -columns() : -1);
    else if (e.key === "Enter" && focused) {
      e.preventDefault();
      void open(focused);
    } else if (e.key === "Backspace" && path !== ROOT) {
      e.preventDefault();
      go(dirname(path));
    } else if ((e.key === "Delete" || (e.key === "Backspace" && mod)) && selected.length) {
      e.preventDefault();
      setDialog({ kind: "delete", entries: selected });
    } else if (e.key === "F2" && selected.length === 1) {
      e.preventDefault();
      setDialog({ kind: "rename", entry: selected[0]! });
    } else if (e.key === "Escape") setSelection(emptySelection);
    else if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection(selectAll(order));
    } else if (mod && e.key.toLowerCase() === "c") copyOrCut("copy", selected);
    else if (mod && e.key.toLowerCase() === "x") copyOrCut("cut", selected);
    else if (mod && e.key.toLowerCase() === "v") void paste();
  };

  /* ─────────────────────────────── Render ─────────────────────────────── */

  const handlers = {
    onSelect: (id: string, mode: Parameters<typeof select>[3]) => setSelection(select(sel, order, id, mode)),
    onOpen: (entry: FsStat) => void open(entry),
    onContextMenu: (e: React.MouseEvent, entry: FsStat) => {
      if (!sel.ids.has(entry.id)) setSelection(select(sel, order, entry.id, "replace"));
      showContextMenu(e, entry.name, itemMenu(entry));
    },
    onDragStart: (e: React.DragEvent, entry: FsStat) => {
      const dragged = sel.ids.has(entry.id) ? selected : [entry];
      if (!sel.ids.has(entry.id)) setSelection(select(sel, order, entry.id, "replace"));
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragged.map((d) => d.path)));
      e.dataTransfer.effectAllowed = "move";
    },
    onDropOnFolder: (e: React.DragEvent, folder: FsStat) => dropInto(e, folder.path),
  };

  const viewProps = {
    ...handlers,
    entries,
    selected: sel.ids,
    focusId: sel.focus,
    cutPaths,
    showLocation: search.active,
    dropTarget,
    setDropTarget,
  };

  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  let body: React.ReactNode;
  if (listing.status === "error") {
    body = (
      <EmptyState
        icon={FolderX}
        tone="danger"
        title="This folder isn’t available"
        description={listing.error.message}
        action={
          <Button onClick={() => go(HOME)} variant="default">
            Go to Home
          </Button>
        }
      />
    );
  } else if (listing.status === "loading" || search.loading) {
    body = <Spinner />;
  } else if (entries.length === 0) {
    body = search.active ? (
      <EmptyState icon={SearchX} title={`No results for “${query.trim()}”`} description={`Searched ${folderName} and its subfolders.`} />
    ) : kind !== "all" ? (
      <EmptyState icon={SearchX} title="Nothing of this kind here" action={<Button onClick={() => setKind("all")}>Show all kinds</Button>} />
    ) : (
      <EmptyState
        icon={FolderOpen}
        title="This folder is empty"
        description="Create something new, or drop files from your computer here."
        action={
          <Button onClick={() => setDialog({ kind: "new-folder" })}>
            <FolderPlus size={13} /> New Folder
          </Button>
        }
      />
    );
  } else {
    body = view === "grid" ? <GridView {...viewProps} /> : <ListView {...viewProps} sort={sort} onSort={onSort} />;
  }

  return (
    <div className="flex h-full bg-surface" onKeyDown={onKeyDown}>
      <Sidebar current={path} onNavigate={go} onDropInto={dropInto} dropTarget={dropTarget} setDropTarget={setDropTarget} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          path={path}
          canBack={canGoBack(history)}
          canForward={canGoForward(history)}
          onBack={() => setHistory(goBack)}
          onForward={() => setHistory(goForward)}
          onUp={() => go(dirname(path))}
          onNavigate={go}
          query={query}
          onQuery={setQuery}
          view={view}
          onView={setView}
          kind={kind}
          onKind={setKind}
          showPreview={showPreview}
          onTogglePreview={() => setShowPreview(!showPreview)}
          onNewFolder={() => setDialog({ kind: "new-folder" })}
          onNewFile={() => setDialog({ kind: "new-file" })}
          onUpload={() => uploadRef.current?.click()}
        />
        <div className="flex min-h-0 flex-1">
          <div
            ref={viewRef}
            tabIndex={0}
            aria-label={`Contents of ${folderName}`}
            className={cn("nx-scroll min-w-0 flex-1 overflow-auto outline-none", dropTarget === "__view__" && "bg-accent-soft/40")}
            onClick={() => setSelection(emptySelection)}
            onContextMenu={(e) => showContextMenu(e, folderName, backgroundMenu())}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_MIME) && !e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "move";
              if (dropTarget !== "__view__") setDropTarget("__view__");
            }}
            onDragLeave={(e) => e.currentTarget === e.target && setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDropTarget(null);
              dropInto(e, path);
            }}
          >
            {body}
          </div>
          {showPreview && <PreviewPane selected={selected} folder={{ name: folderName, count: listing.entries.length }} />}
        </div>
        <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-[11.5px] text-subtle" aria-live="polite">
          <span>
            {entries.length} {entries.length === 1 ? "item" : "items"}
            {search.active && " found"}
          </span>
          {selected.length > 0 && <span>{selected.length} selected</span>}
          {notice && <span className={cn("ml-auto truncate", notice.tone === "error" ? "text-danger" : "text-muted")}>{notice.text}</span>}
        </footer>
      </div>

      <input
        ref={uploadRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(Array.from(e.target.files));
          e.target.value = "";
        }}
      />

      <PromptDialog
        open={dialog?.kind === "new-folder" || dialog?.kind === "new-file"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "new-file" ? "New File" : "New Folder"}
        label="Name"
        initialValue={dialog?.kind === "new-file" ? "untitled.txt" : "untitled folder"}
        selectStem={dialog?.kind === "new-file"}
        confirmLabel="Create"
        validate={(name) => nameProblem(name, siblings)}
        onSubmit={async (name) => {
          const target = join(path, name);
          if (dialog?.kind === "new-file") await fs.writeFile(target, "");
          else await fs.mkdir(target);
          await selectPath(target);
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
        validate={(name) => (dialog?.kind === "rename" ? nameProblem(name, new Set((search.active ? [] : listing.entries).map((e) => e.name)), dialog.entry.name) : null)}
        onSubmit={async (name) => {
          if (dialog?.kind !== "rename" || name === dialog.entry.name) return;
          await fs.rename(dialog.entry.path, join(dirname(dialog.entry.path), name));
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === "delete" && dialog.entries.length === 1 ? `Delete “${dialog.entries[0]!.name}”?` : `Delete ${dialog?.kind === "delete" ? dialog.entries.length : 0} items?`}
        description={
          dialog?.kind === "delete" && dialog.entries.some((e) => e.type === "directory")
            ? "Folders are deleted with everything inside them. This can’t be undone."
            : "This can’t be undone."
        }
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          for (const e of dialog.entries) {
            try {
              await fs.remove(e.path, { recursive: true });
            } catch (error) {
              report(error);
            }
          }
          setSelection(emptySelection);
        }}
      />
    </div>
  );
}
