"use client";

import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CornerDownLeft, EyeOff, Search, X, type LucideIcon } from "lucide-react";
import { useInstalledApps } from "@/system/runtime/registry";
import { useProcesses } from "@/system/runtime/process-store";
import { lifecycle } from "@/system/runtime/lifecycle";
import { useWindowManager } from "@/system/window-manager/store";
import type { AppManifest } from "@/system/runtime/types";
import { AppIcon } from "@/ui/AppIcon";
import { Kbd } from "@/ui/Kbd";
import { cn } from "@/lib/utils";
import { useShell } from "../shell-store";
import { closeAllWindows, showDesktop } from "../system-actions";
import { rank } from "./search";

type Entry =
  | { kind: "app"; id: string; title: string; keywords: string[]; app: AppManifest }
  | { kind: "command"; id: string; title: string; keywords: string[]; icon: LucideIcon; run(): void };

export function Launcher() {
  const open = useShell((s) => s.launcherOpen);
  return open ? <LauncherPanel /> : null;
}

function LauncherPanel() {
  const setOpen = useShell((s) => s.setLauncherOpen);
  const apps = useInstalledApps();
  const runningIds = new Set(useProcesses(useShallow((s) => Object.values(s.instances).map((p) => p.appId))));
  const hasWindows = useWindowManager((s) => s.stack.length > 0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const entries: Entry[] = [
    ...apps.map(
      (app): Entry => ({ kind: "app", id: app.id, title: app.name, keywords: [app.description], app }),
    ),
    ...(hasWindows
      ? ([
          { kind: "command", id: "cmd.show-desktop", title: "Show Desktop", keywords: ["minimize", "hide"], icon: EyeOff, run: showDesktop },
          { kind: "command", id: "cmd.close-all", title: "Close All Windows", keywords: ["quit", "exit"], icon: X, run: closeAllWindows },
        ] satisfies Entry[])
      : []),
  ];

  const results = rank(entries, query);
  const active = Math.min(selected, Math.max(0, results.length - 1));

  const close = () => setOpen(false);
  const run = (entry: Entry | undefined) => {
    if (!entry) return;
    close();
    if (entry.kind === "app") lifecycle.launchApp(entry.app.id);
    else entry.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      setSelected(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    }
  };

  const appResults = results.filter((r) => r.kind === "app");
  const commands = results.filter((r) => r.kind === "command");

  const renderRow = (entry: Entry) => {
    const index = results.indexOf(entry);
    const isActive = index === active;
    return (
      <div
        key={entry.id}
        role="option"
        id={`launcher-${entry.id}`}
        aria-selected={isActive}
        data-index={index}
        onPointerMove={() => setSelected(index)}
        onClick={() => run(entry)}
        className={cn(
          "flex h-12 cursor-default items-center gap-3 rounded-lg px-2.5",
          isActive ? "bg-active" : "",
        )}
      >
        {entry.kind === "app" ? (
          <AppIcon icon={entry.app.icon} size={28} />
        ) : (
          <span className="grid size-7 place-items-center rounded-[7px] border border-line-strong bg-surface-sunken text-muted">
            <entry.icon size={14} strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] leading-[18px] font-medium text-fg">{entry.title}</div>
          {entry.kind === "app" && <div className="truncate text-[11.5px] text-subtle">{entry.app.description}</div>}
        </div>
        {entry.kind === "app" && runningIds.has(entry.app.id) && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent">Running</span>
        )}
        {isActive && <CornerDownLeft size={13} className="text-subtle" />}
      </div>
    );
  };

  return (
    <div
      className="nx-fade-in fixed inset-0 z-[8000] bg-black/35"
      onPointerDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Launcher"
        onKeyDown={onKeyDown}
        className="nx-pop-in absolute left-1/2 top-[18%] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-line-strong bg-surface-raised shadow-popover"
      >
        <div className="flex h-12 items-center gap-3 border-b border-line px-4">
          <Search size={16} strokeWidth={2} className="text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            placeholder="Search applications and commands…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="launcher-results"
            aria-activedescendant={results[active] ? `launcher-${results[active].id}` : undefined}
            spellCheck={false}
            autoComplete="off"
            className="h-full flex-1 bg-transparent text-[14.5px] text-fg outline-none placeholder:text-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} id="launcher-results" role="listbox" className="nx-scroll max-h-[360px] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-10 text-center">
              <p className="text-[13px] text-fg">No results for “{query.trim()}”</p>
              <p className="text-[12px] text-subtle">Try an application name or a command like “Show Desktop”.</p>
            </div>
          ) : (
            <>
              {appResults.length > 0 && <SectionLabel>Applications</SectionLabel>}
              {appResults.map(renderRow)}
              {commands.length > 0 && <SectionLabel>Commands</SectionLabel>}
              {commands.map(renderRow)}
            </>
          )}
        </div>

        <div className="flex h-9 items-center justify-end gap-4 border-t border-line px-4 text-[11.5px] text-subtle">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> open
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-subtle">{children}</div>;
}
