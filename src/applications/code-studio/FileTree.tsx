"use client";

import { ChevronRight, FilePlus, FolderOpen, FolderPlus, Pencil, SquareTerminal, Trash2 } from "lucide-react";
import { useDirectory, type FsStat } from "@/system/sdk/fs";
import { showContextMenu, tidyMenu } from "@/system/sdk/context-menu";
import { launchApp, openPath } from "@/system/sdk/launch";
import { FileIcon } from "@/ui/FileIcon";
import { cn } from "@/lib/utils";

export interface TreeActions {
  onOpenFile(path: string): void;
  onNew(kind: "file" | "folder", dir: string): void;
  onRename(entry: FsStat): void;
  onDelete(entry: FsStat): void;
}

interface FileTreeProps extends TreeActions {
  root: string;
  expanded: ReadonlySet<string>;
  onToggle(path: string): void;
  activePath: string | null;
}

/** Project explorer. Each expanded folder subscribes to its own live listing. */
export function FileTree(props: FileTreeProps) {
  return (
    <div role="tree" aria-label="Project files" className="py-1">
      <TreeLevel {...props} dir={props.root} depth={0} />
    </div>
  );
}

function TreeLevel({ dir, depth, ...props }: FileTreeProps & { dir: string; depth: number }) {
  const listing = useDirectory(dir);
  if (listing.status === "loading") return null;
  if (listing.status === "error") {
    return <p className="px-3 py-1 text-[11.5px] text-danger" style={{ paddingLeft: 12 + depth * 12 }}>{listing.error.message}</p>;
  }
  const entries = listing.entries.filter((e) => !e.name.startsWith("."));
  if (depth === 0 && entries.length === 0) return <p className="px-3 py-2 text-[12px] text-subtle">This folder is empty.</p>;

  return (
    <>
      {entries.map((entry) => {
        const isDir = entry.type === "directory";
        const open = isDir && props.expanded.has(entry.path);
        return (
          <div key={entry.id} role="treeitem" aria-expanded={isDir ? open : undefined} aria-selected={entry.path === props.activePath}>
            <button
              type="button"
              data-tree-path={entry.path}
              onClick={() => (isDir ? props.onToggle(entry.path) : props.onOpenFile(entry.path))}
              onContextMenu={(e) =>
                showContextMenu(
                  e,
                  entry.name,
                  tidyMenu([
                    isDir && { label: "New File…", icon: FilePlus, onSelect: () => props.onNew("file", entry.path) },
                    isDir && { label: "New Folder…", icon: FolderPlus, onSelect: () => props.onNew("folder", entry.path) },
                    isDir && { label: "Open in Terminal", icon: SquareTerminal, onSelect: () => launchApp("nexus.terminal", { cwd: entry.path }) },
                    !isDir && { label: "Reveal in Files", icon: FolderOpen, onSelect: () => void openPath(entry.path.slice(0, entry.path.lastIndexOf("/")) || "/") },
                    { kind: "separator" },
                    { label: "Rename…", icon: Pencil, onSelect: () => props.onRename(entry) },
                    { label: "Delete…", icon: Trash2, danger: true, onSelect: () => props.onDelete(entry) },
                  ]),
                )
              }
              className={cn(
                "flex h-[26px] w-full items-center gap-1.5 pr-2 text-left text-[12.5px] transition-colors",
                entry.path === props.activePath ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg",
              )}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              <ChevronRight size={12} className={cn("shrink-0 transition-transform", isDir ? "text-subtle" : "invisible", open && "rotate-90")} />
              <FileIcon name={entry.name} type={entry.type} size={14} open={open} />
              <span className="truncate">{entry.name}</span>
            </button>
            {open && (
              <div role="group">
                <TreeLevel {...props} dir={entry.path} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
