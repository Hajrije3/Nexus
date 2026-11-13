"use client";

import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, FilePlus, FolderPlus, HardDrive, House, LayoutGrid, List, PanelRight, Search, Upload, X, type LucideIcon } from "lucide-react";
import { HOME, segments, ROOT } from "@/system/fs/path";
import { FileIcon } from "@/ui/FileIcon";
import { IconButton } from "@/ui/IconButton";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { cn } from "@/lib/utils";
import type { KindFilter } from "./model";
import { DRAG_MIME } from "./ItemsView";

/* ─────────────────────────────── Sidebar ─────────────────────────────── */

const PLACES: { label: string; path: string; icon?: LucideIcon }[] = [
  { label: "Home", path: HOME, icon: House },
  { label: "Documents", path: `${HOME}/Documents` },
  { label: "Downloads", path: `${HOME}/Downloads` },
  { label: "Projects", path: `${HOME}/Projects` },
  { label: "Pictures", path: `${HOME}/Pictures` },
];

interface SidebarProps {
  current: string;
  onNavigate(path: string): void;
  onDropInto(e: React.DragEvent, path: string): void;
  dropTarget: string | null;
  setDropTarget(path: string | null): void;
}

export function Sidebar({ current, onNavigate, onDropInto, dropTarget, setDropTarget }: SidebarProps) {
  const item = (label: string, path: string, icon?: LucideIcon) => {
    const Icon = icon;
    const active = current === path;
    return (
      <button
        key={path}
        type="button"
        aria-current={active ? "location" : undefined}
        onClick={() => onNavigate(path)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME) && !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDropTarget(path);
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDropTarget(null);
          onDropInto(e, path);
        }}
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] transition-colors",
          active ? "bg-active font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
          dropTarget === path && "bg-accent-soft ring-1 ring-accent",
        )}
      >
        {Icon ? <Icon size={15} strokeWidth={1.75} className="shrink-0 text-accent" /> : <FileIcon name="" type="directory" size={15} />}
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <nav aria-label="Places" className="nx-scroll w-[164px] shrink-0 space-y-4 overflow-y-auto border-r border-line bg-surface-sunken p-2">
      <div>
        <p className="px-2 pb-1 text-[11px] font-medium text-subtle">Places</p>
        {PLACES.map((p) => item(p.label, p.path, p.icon))}
      </div>
      <div>
        <p className="px-2 pb-1 text-[11px] font-medium text-subtle">System</p>
        {item("Computer", ROOT, HardDrive)}
      </div>
    </nav>
  );
}

/* ───────────────────────────── Breadcrumbs ───────────────────────────── */

export function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate(path: string): void }) {
  const inHome = path === HOME || path.startsWith(`${HOME}/`);
  const base = inHome ? HOME : ROOT;
  const rest = segments(path.slice(base.length));
  const crumbs = [
    { label: inHome ? "Home" : "Computer", path: base },
    ...rest.map((seg, i) => ({ label: seg, path: `${base === ROOT ? "" : base}/${rest.slice(0, i + 1).join("/")}` })),
  ];

  return (
    <nav aria-label="Path" className="flex min-w-0 flex-1 items-center overflow-hidden">
      <ol className="flex min-w-0 items-center">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.path} className={cn("flex min-w-0 items-center", last ? "shrink" : "shrink-[4]")}>
              {i > 0 && <ChevronRight size={13} className="mx-0.5 shrink-0 text-subtle" aria-hidden="true" />}
              <button
                type="button"
                onClick={() => onNavigate(c.path)}
                aria-current={last ? "location" : undefined}
                className={cn(
                  "truncate rounded px-1.5 py-0.5 text-[12.5px] transition-colors hover:bg-hover",
                  last ? "font-medium text-fg" : "text-muted hover:text-fg",
                )}
              >
                {c.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ─────────────────────────────── Toolbar ─────────────────────────────── */

interface ToolbarProps {
  path: string;
  canBack: boolean;
  canForward: boolean;
  onBack(): void;
  onForward(): void;
  onUp(): void;
  onNavigate(path: string): void;
  query: string;
  onQuery(q: string): void;
  view: "grid" | "list";
  onView(v: "grid" | "list"): void;
  kind: KindFilter;
  onKind(k: KindFilter): void;
  showPreview: boolean;
  onTogglePreview(): void;
  onNewFolder(): void;
  onNewFile(): void;
  onUpload(): void;
}

export function Toolbar(p: ToolbarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2">
      <IconButton label="Back" disabled={!p.canBack} onClick={p.onBack}>
        <ArrowLeft size={15} />
      </IconButton>
      <IconButton label="Forward" disabled={!p.canForward} onClick={p.onForward}>
        <ArrowRight size={15} />
      </IconButton>
      <IconButton label="Enclosing folder" disabled={p.path === ROOT} onClick={p.onUp}>
        <ArrowUp size={15} />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-line" />
      <Breadcrumbs path={p.path} onNavigate={p.onNavigate} />

      <IconButton label="New folder" onClick={p.onNewFolder}>
        <FolderPlus size={15} />
      </IconButton>
      <IconButton label="New file" onClick={p.onNewFile}>
        <FilePlus size={15} />
      </IconButton>
      <IconButton label="Upload files from your computer" onClick={p.onUpload}>
        <Upload size={15} />
      </IconButton>
      <div className="mx-0.5 h-5 w-px bg-line" />

      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-subtle" />
        <input
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && p.onQuery("")}
          placeholder="Search"
          aria-label="Search in this folder and subfolders"
          spellCheck={false}
          className="h-7 w-36 rounded-md border border-line bg-surface-sunken pl-7 pr-6 text-[12.5px] text-fg outline-none placeholder:text-subtle focus:border-accent focus:w-44 transition-[width]"
        />
        {p.query && (
          <button type="button" aria-label="Clear search" onClick={() => p.onQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-subtle hover:text-fg">
            <X size={12} />
          </button>
        )}
      </div>
      <select
        aria-label="Show"
        value={p.kind}
        onChange={(e) => p.onKind(e.target.value as KindFilter)}
        className="h-7 rounded-md border border-line bg-surface-sunken px-1.5 text-[12px] text-muted outline-none focus:border-accent"
      >
        <option value="all">All kinds</option>
        <option value="folder">Folders</option>
        <option value="document">Documents</option>
        <option value="code">Code</option>
        <option value="data">Data</option>
        <option value="image">Images</option>
      </select>
      <SegmentedControl
        aria-label="View"
        size="sm"
        value={p.view}
        onChange={p.onView}
        options={[
          { value: "grid", label: <LayoutGrid size={13} />, ariaLabel: "Icons" },
          { value: "list", label: <List size={13} />, ariaLabel: "List" },
        ]}
      />
      <IconButton label={p.showPreview ? "Hide details" : "Show details"} active={p.showPreview} onClick={p.onTogglePreview}>
        <PanelRight size={15} />
      </IconButton>
    </div>
  );
}

