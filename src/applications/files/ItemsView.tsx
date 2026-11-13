"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { FsStat } from "@/system/sdk/fs";
import { displayPath, dirname } from "@/system/fs/path";
import { kindLabel } from "@/system/fs/kinds";
import { FileIcon } from "@/ui/FileIcon";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SelectMode, Sort, SortKey } from "./model";

export const DRAG_MIME = "application/x-nexus-paths";

export interface ItemHandlers {
  onSelect(id: string, mode: SelectMode): void;
  onOpen(entry: FsStat): void;
  onContextMenu(e: React.MouseEvent, entry: FsStat): void;
  onDragStart(e: React.DragEvent, entry: FsStat): void;
  /** Drop onto a folder item. */
  onDropOnFolder(e: React.DragEvent, folder: FsStat): void;
}

interface ItemsViewProps extends ItemHandlers {
  entries: readonly FsStat[];
  selected: ReadonlySet<string>;
  focusId: string | null;
  cutPaths: ReadonlySet<string>;
  /** Show each entry's folder (search results). */
  showLocation: boolean;
  dropTarget: string | null;
  setDropTarget(id: string | null): void;
}

const modeFor = (e: React.MouseEvent): SelectMode => (e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "toggle" : "replace");

function itemProps(entry: FsStat, p: ItemsViewProps) {
  const isFolder = entry.type === "directory";
  return {
    "data-entry": entry.name,
    "data-id": entry.id,
    role: "option" as const,
    "aria-selected": p.selected.has(entry.id),
    draggable: true,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      p.onSelect(entry.id, modeFor(e));
    },
    onDoubleClick: () => p.onOpen(entry),
    onContextMenu: (e: React.MouseEvent) => p.onContextMenu(e, entry),
    onDragStart: (e: React.DragEvent) => p.onDragStart(e, entry),
    onDragOver: isFolder
      ? (e: React.DragEvent) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME) && !e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "move";
          p.setDropTarget(entry.id);
        }
      : undefined,
    onDragLeave: isFolder ? () => p.setDropTarget(null) : undefined,
    onDrop: isFolder
      ? (e: React.DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          p.setDropTarget(null);
          p.onDropOnFolder(e, entry);
        }
      : undefined,
  };
}

export function GridView(props: ItemsViewProps) {
  return (
    <div role="listbox" aria-label="Files" aria-multiselectable="true" data-view="grid" className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] content-start gap-1 p-3">
      {props.entries.map((entry) => (
        <GridItem key={entry.id} entry={entry} {...props} />
      ))}
    </div>
  );
}

function GridItem({ entry, ...p }: ItemsViewProps & { entry: FsStat }) {
  const item = itemProps(entry, p);
  const selected = p.selected.has(entry.id);
  return (
    <div
      {...item}
      className={cn(
        "flex cursor-default flex-col items-center gap-1.5 rounded-lg px-1.5 pb-2 pt-3 outline-none",
        selected ? "bg-accent-soft" : "hover:bg-hover",
        p.focusId === entry.id && "ring-1 ring-accent/50",
        p.dropTarget === entry.id && "bg-accent-soft ring-2 ring-accent",
        p.cutPaths.has(entry.path) && "opacity-50",
      )}
    >
      <FileIcon name={entry.name} type={entry.type} size={40} />
      <span
        className={cn(
          "line-clamp-2 w-full break-words rounded px-1 text-center text-[12px] leading-[1.3]",
          selected ? "text-fg" : "text-muted",
        )}
        title={entry.name}
      >
        {entry.name}
      </span>
      {p.showLocation && <span className="w-full truncate text-center text-[10.5px] text-subtle">{displayPath(dirname(entry.path))}</span>}
    </div>
  );
}

interface ListViewProps extends ItemsViewProps {
  sort: Sort;
  onSort(key: SortKey): void;
}

export function ListView(props: ListViewProps) {
  const { sort, onSort } = props;
  const header = (key: SortKey, label: string, className: string) => (
    <button
      type="button"
      onClick={() => onSort(key)}
      aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
      className={cn("flex items-center gap-1 truncate hover:text-fg", className, sort.key === key && "text-fg")}
    >
      {label}
      {sort.key === key && (sort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </button>
  );

  return (
    <div data-view="list" className="min-w-[520px]">
      <div className="sticky top-0 z-10 flex h-8 items-center gap-3 border-b border-line bg-surface/95 px-4 text-[11.5px] font-medium text-subtle backdrop-blur">
        {header("name", "Name", "flex-1 min-w-0")}
        {props.showLocation && <span className="w-40 truncate">Location</span>}
        {header("modified", "Modified", "w-36")}
        {header("size", "Size", "w-16 justify-end")}
        {header("kind", "Kind", "w-32")}
      </div>
      <div role="listbox" aria-label="Files" aria-multiselectable="true">
        {props.entries.map((entry) => (
          <ListRow key={entry.id} entry={entry} {...props} />
        ))}
      </div>
    </div>
  );
}

function ListRow({ entry, ...p }: ListViewProps & { entry: FsStat }) {
  const item = itemProps(entry, p);
  const selected = p.selected.has(entry.id);
  return (
    <div
      {...item}
      className={cn(
        "mx-1.5 flex h-7 cursor-default items-center gap-3 rounded-md px-2.5 text-[12.5px] outline-none",
        selected ? "bg-accent-soft text-fg" : "text-muted even:bg-hover/40 hover:bg-hover",
        p.focusId === entry.id && "ring-1 ring-accent/50",
        p.dropTarget === entry.id && "ring-2 ring-accent",
        p.cutPaths.has(entry.path) && "opacity-50",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <FileIcon name={entry.name} type={entry.type} size={15} />
        <span className={cn("truncate", selected && "text-fg")}>{entry.name}</span>
      </span>
      {p.showLocation && <span className="w-40 truncate text-subtle">{displayPath(dirname(entry.path))}</span>}
      <span className="w-36 truncate text-subtle">{formatDate(entry.modifiedAt)}</span>
      <span className="w-16 text-right tabular-nums text-subtle">{entry.type === "directory" ? "—" : formatBytes(entry.size)}</span>
      <span className="w-32 truncate text-subtle">{kindLabel(entry.name, entry.type)}</span>
    </div>
  );
}
