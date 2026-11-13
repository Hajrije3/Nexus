"use client";

import { useEffect, useState } from "react";
import type { FsStat } from "@/system/sdk/fs";
import { useFileSystem } from "@/system/sdk/fs";
import { useSystemEvent } from "@/system/sdk/events";
import { displayPath } from "@/system/fs/path";
import { fileKind, kindLabel } from "@/system/fs/kinds";
import { isTextMime } from "@/system/fs/mime";
import { FileIcon } from "@/ui/FileIcon";
import { formatBytes, formatDate } from "@/lib/format";

const TEXT_PREVIEW_MAX_BYTES = 256 * 1024;
const TEXT_PREVIEW_CHARS = 3000;

type Preview = { kind: "none" } | { kind: "text"; text: string } | { kind: "image"; url: string } | { kind: "error"; message: string };

/** Loads a lightweight preview of one file; reloads when the file changes. */
function usePreview(entry: FsStat | null): Preview {
  const fs = useFileSystem();
  const [state, setState] = useState<{ key: string; preview: Preview } | null>(null);
  const [version, setVersion] = useState(0);
  const key = entry ? `${entry.id}:${entry.modifiedAt}:${version}` : "";

  useSystemEvent("fs.modified", (e) => entry && e.path === entry.path && setVersion((v) => v + 1));

  useEffect(() => {
    if (!entry || entry.type === "directory") return;
    let cancelled = false;
    let url: string | null = null;
    const done = (preview: Preview) => !cancelled && setState({ key, preview });
    const kind = fileKind(entry.name, entry.type);

    if (kind === "image") {
      fs.readFile(entry.path).then(
        (data) => {
          url = URL.createObjectURL(new Blob([data], { type: entry.mimeType ?? "image/*" }));
          done({ kind: "image", url });
        },
        (e: unknown) => done({ kind: "error", message: String(e) }),
      );
    } else if (isTextMime(entry.mimeType) && entry.size <= TEXT_PREVIEW_MAX_BYTES) {
      fs.readText(entry.path).then(
        (text) => done({ kind: "text", text: text.slice(0, TEXT_PREVIEW_CHARS) }),
        (e: unknown) => done({ kind: "error", message: String(e) }),
      );
    } else {
      done({ kind: "none" });
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fs, entry, key]);

  return state && state.key === key ? state.preview : { kind: "none" };
}

interface PreviewPaneProps {
  selected: readonly FsStat[];
  folder: { name: string; count: number };
}

export function PreviewPane({ selected, folder }: PreviewPaneProps) {
  const single = selected.length === 1 ? selected[0]! : null;
  const preview = usePreview(single);

  return (
    <aside aria-label="Details" className="nx-scroll flex w-[240px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-sunken">
      {single ? (
        <>
          <div className="grid min-h-[150px] place-items-center border-b border-line p-4">
            {preview.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL from the virtual filesystem
              <img src={preview.url} alt={single.name} className="max-h-[180px] max-w-full rounded object-contain" />
            ) : preview.kind === "text" ? (
              <pre data-selectable className="nx-scroll max-h-[200px] w-full overflow-auto whitespace-pre-wrap break-words rounded border border-line bg-surface p-2 font-mono text-[10.5px] leading-relaxed text-muted">
                {preview.text || <span className="italic text-subtle">Empty file</span>}
              </pre>
            ) : (
              <FileIcon name={single.name} type={single.type} size={64} />
            )}
          </div>
          <dl className="space-y-2.5 p-4 text-[12px]">
            <p className="break-words text-[13px] font-medium text-fg" data-selectable>
              {single.name}
            </p>
            <Detail label="Kind" value={kindLabel(single.name, single.type)} />
            {single.type === "file" && <Detail label="Size" value={`${formatBytes(single.size)}`} />}
            <Detail label="Modified" value={formatDate(single.modifiedAt)} />
            <Detail label="Created" value={formatDate(single.createdAt)} />
            <Detail label="Where" value={displayPath(single.path)} selectable />
          </dl>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <FileIcon name="" type="directory" size={48} />
          {selected.length > 1 ? (
            <>
              <p className="text-[13px] font-medium text-fg">{selected.length} items selected</p>
              <p className="text-[12px] text-subtle">{formatBytes(selected.reduce((n, e) => n + e.size, 0))} in files</p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-medium text-fg">{folder.name}</p>
              <p className="text-[12px] text-subtle">
                {folder.count} {folder.count === 1 ? "item" : "items"}
              </p>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Detail({ label, value, selectable }: { label: string; value: string; selectable?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className="break-words text-muted" data-selectable={selectable || undefined}>
        {value}
      </dd>
    </div>
  );
}
