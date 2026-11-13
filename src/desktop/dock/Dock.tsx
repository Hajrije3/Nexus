"use client";

import { LayoutGrid, Plus, X } from "lucide-react";
import { useInstalledApps } from "@/system/runtime/registry";
import { lifecycle } from "@/system/runtime/lifecycle";
import { useProcesses } from "@/system/runtime/process-store";
import { useWindowManager } from "@/system/window-manager/store";
import type { AppManifest } from "@/system/runtime/types";
import { AppIcon } from "@/ui/AppIcon";
import { cn } from "@/lib/utils";
import { useShell } from "../shell-store";
import { openContextMenu } from "@/system/sdk/context-menu";
import { quitApp } from "../system-actions";

export function Dock() {
  const apps = useInstalledApps();
  const toggleLauncher = useShell((s) => s.toggleLauncher);

  return (
    <nav
      aria-label="Dock"
      className="absolute bottom-2 left-1/2 z-[6000] flex -translate-x-1/2 items-end gap-1.5 rounded-[18px] border border-line bg-chrome p-1.5 shadow-popover backdrop-blur-xl backdrop-saturate-150"
    >
      {apps.map((app) => (
        <DockItem key={app.id} app={app} />
      ))}
      <div className="mx-1 h-10 w-px self-center bg-line-strong" aria-hidden="true" />
      <DockButton label="Launcher" onClick={toggleLauncher}>
        <span className="grid size-11 place-items-center rounded-[11px] border border-line-strong bg-surface-raised text-muted">
          <LayoutGrid size={20} strokeWidth={1.75} />
        </span>
      </DockButton>
    </nav>
  );
}

function DockItem({ app }: { app: AppManifest }) {
  const running = useProcesses((s) => Object.values(s.instances).some((p) => p.appId === app.id));
  const active = useWindowManager((s) => (s.focusedId ? s.windows[s.focusedId]?.appId === app.id : false));


  return (
    <DockButton
      label={app.name}
      running={running}
      active={active}
      onClick={() => lifecycle.activateApp(app.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        openContextMenu({
          label: app.name,
          position: { x: r.left, y: r.top - 10 },
          above: true,
          items: [
            {
              label: "New Window",
              icon: Plus,
              disabled: app.singleInstance && running,
              onSelect: () => lifecycle.launchApp(app.id),
            },
            ...(running
              ? ([
                  { kind: "separator" },
                  { label: `Quit ${app.name}`, icon: X, danger: true, onSelect: () => quitApp(app.id) },
                ] as const)
              : []),
          ],
        });
      }}
    >
      <AppIcon icon={app.icon} size={44} />
    </DockButton>
  );
}

interface DockButtonProps {
  label: string;
  running?: boolean;
  active?: boolean;
  onClick(): void;
  onContextMenu?(e: React.MouseEvent<HTMLButtonElement>): void;
  children: React.ReactNode;
}

function DockButton({ label, running, active, onClick, onContextMenu, children }: DockButtonProps) {
  return (
    <button
      type="button"
      aria-label={running ? `${label} (running)` : label}
      data-dock-item={label}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="group relative flex flex-col items-center rounded-[12px] outline-offset-2"
    >
      <span className="transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-active:translate-y-0 group-active:scale-95">
        {children}
      </span>
      {/* Tooltip */}
      <span className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-md border border-line bg-surface-raised px-2 py-1 text-[11.5px] font-medium text-fg opacity-0 shadow-popover transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100">
        {label}
      </span>
      {/* Running indicator */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute -bottom-[5px] h-[3px] rounded-full transition-all duration-200",
          running ? (active ? "w-3 bg-fg/90" : "w-1 bg-fg/60") : "w-0 bg-transparent",
        )}
      />
    </button>
  );
}
