"use client";

import { useEffect, useState } from "react";
import { Crosshair, X } from "lucide-react";
import type { AppInstance } from "@/system/runtime/types";
import { useProcesses } from "@/system/runtime/process-store";
import { useInstalledApps } from "@/system/runtime/registry";
import { lifecycle } from "@/system/runtime/lifecycle";
import { useWindowManager, windowManager } from "@/system/window-manager/store";
import type { WindowManagerState } from "@/system/window-manager/types";
import { useRecentEvents, type SystemEvent } from "@/system/sdk/events";
import { AppIcon } from "@/ui/AppIcon";
import { cn } from "@/lib/utils";

function formatUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function processState(p: AppInstance, wm: Pick<WindowManagerState, "windows" | "focusedId">): string {
  if (p.windowIds.some((id) => id === wm.focusedId)) return "Focused";
  if (p.windowIds.length > 0 && p.windowIds.every((id) => wm.windows[id]?.minimized)) return "Minimized";
  return "Running";
}

/** Live view of the process table and window stack, with focus / quit actions. */
export default function ActivityMonitor() {
  const instances = useProcesses((s) => s.instances);
  const windows = useWindowManager((s) => s.windows);
  const stack = useWindowManager((s) => s.stack);
  const focusedId = useWindowManager((s) => s.focusedId);
  const apps = useInstalledApps();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const appById = new Map(apps.map((a) => [a.id, a]));
  const processes = Object.values(instances).sort((a, b) => a.launchedAt - b.launchedAt);
  const topDown = [...stack].reverse();

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="nx-scroll min-h-0 flex-1 overflow-auto">
        <SectionHeader title="Processes" count={processes.length} />
        {processes.length === 0 ? (
          <Empty>No applications running.</Empty>
        ) : (
          <table className="w-full text-[12px] [&_td]:px-4 [&_th]:px-4">
            <thead>
              <tr className="text-left text-[11px] text-subtle">
                <Th className="pl-4">Application</Th>
                <Th>PID</Th>
                <Th className="text-right">Windows</Th>
                <Th>State</Th>
                <Th className="text-right">Uptime</Th>
                <Th className="w-20 pr-4" />
              </tr>
            </thead>
            <tbody>
              {processes.map((p) => {
                const app = appById.get(p.appId);
                const state = processState(p, { windows, focusedId });
                const lastWindow = p.windowIds[p.windowIds.length - 1];
                return (
                  <tr key={p.instanceId} className="group border-t border-line hover:bg-hover" data-pid={p.instanceId}>
                    <td className="py-1.5 pl-4">
                      <div className="flex items-center gap-2">
                        {app && <AppIcon icon={app.icon} size={18} />}
                        <span className="font-medium text-fg">{app?.name ?? p.appId}</span>
                      </div>
                    </td>
                    <td className="font-mono text-[11px] text-subtle" data-selectable>
                      {p.instanceId.slice(5, 13)}
                    </td>
                    <td className="text-right tabular-nums text-muted">{p.windowIds.length}</td>
                    <td>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5",
                          state === "Focused" ? "text-fg" : "text-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            state === "Focused" ? "bg-accent" : state === "Minimized" ? "bg-subtle" : "bg-emerald-500",
                          )}
                        />
                        {state}
                      </span>
                    </td>
                    <td className="text-right tabular-nums text-muted">{formatUptime(now - p.launchedAt)}</td>
                    <td className="pr-3">
                      <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <IconAction
                          label={`Focus ${app?.name ?? p.appId}`}
                          disabled={!lastWindow}
                          onClick={() => lastWindow && windowManager.getState().focus(lastWindow)}
                        >
                          <Crosshair size={13} />
                        </IconAction>
                        <IconAction
                          label={`Quit ${app?.name ?? p.appId}`}
                          danger
                          onClick={() => lifecycle.terminateInstance(p.instanceId)}
                        >
                          <X size={14} />
                        </IconAction>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <SectionHeader title="Window stack" count={topDown.length} hint="top → bottom" />
        {topDown.length === 0 ? (
          <Empty>No windows open.</Empty>
        ) : (
          <ol className="pb-3 text-[12px]">
            {topDown.map((id, i) => {
              const w = windows[id];
              if (!w) return null;
              const r = w.bounds;
              return (
                <li key={id} className="flex items-center gap-3 border-t border-line px-4 py-1.5">
                  <span className="w-5 text-right tabular-nums text-subtle">{topDown.length - i}</span>
                  <span className={cn("min-w-0 flex-1 truncate", id === focusedId ? "font-medium text-fg" : "text-muted")}>
                    {w.title}
                  </span>
                  <span className="text-[11px] text-subtle">{w.minimized ? "minimized" : w.mode}</span>
                  <span className="w-36 text-right font-mono text-[11px] text-subtle tabular-nums">
                    {r.width}×{r.height} @ {r.x},{r.y}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <EventLog />
      </div>
      <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line px-4 text-[11.5px] text-subtle">
        <span>{processes.length} processes</span>
        <span>{stack.length} windows</span>
        <span className="ml-auto truncate">
          Focused: <span className="text-muted">{focusedId ? windows[focusedId]?.title : "Desktop"}</span>
        </span>
      </footer>
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/** One-line summary of an event payload. */
function summarize(event: SystemEvent): string {
  const p = event.payload as Record<string, unknown>;
  if ("from" in p && "to" in p) return `${String(p.from)} → ${String(p.to)}`;
  if ("path" in p) return String(p.path);
  if ("appId" in p && p.appId) return String(p.appId);
  if ("windows" in p) return `${String(p.windows)} windows`;
  if ("reason" in p) return String(p.reason);
  return "";
}

/** Live tail of the system event bus, newest first. */
function EventLog() {
  const events = useRecentEvents(40);
  const newestFirst = [...events].reverse();
  return (
    <>
      <SectionHeader title="System events" count={events.length} hint="newest first" />
      {newestFirst.length === 0 ? (
        <Empty>No events yet.</Empty>
      ) : (
        <ol className="pb-3 font-mono text-[11px]" aria-label="System events">
          {newestFirst.map((e) => (
            <li key={e.seq} className="flex items-center gap-3 border-t border-line px-4 py-1" data-event-type={e.type}>
              <span className="w-16 shrink-0 tabular-nums text-subtle">{timeFmt.format(e.timestamp)}</span>
              <span className="w-36 shrink-0 text-accent">{e.type}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{summarize(e)}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function SectionHeader({ title, count, hint }: { title: string; count: number; hint?: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-surface/95 px-4 pb-2 pt-3 backdrop-blur">
      <h3 className="text-[12px] font-semibold text-fg">{title}</h3>
      <span className="text-[11px] tabular-nums text-subtle">{count}</span>
      {hint && <span className="ml-auto text-[11px] text-subtle">{hint}</span>}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("pb-1.5 font-medium", className)}>{children}</th>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-4 text-[12px] text-subtle">{children}</p>;
}

function IconAction({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-6 place-items-center rounded-[5px] text-muted transition-colors disabled:opacity-30",
        danger ? "hover:bg-danger/15 hover:text-danger" : "hover:bg-active hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
