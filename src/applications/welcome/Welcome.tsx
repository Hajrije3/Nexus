"use client";

import { useInstalledApps } from "@/system/runtime/registry";
import { lifecycle } from "@/system/runtime/lifecycle";
import { AppIcon } from "@/ui/AppIcon";
import { Kbd, modKeyLabel } from "@/ui/Kbd";
import { NexusMark } from "@/ui/NexusMark";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["MOD", "K"], label: "Open launcher" },
  { keys: ["Alt", "`"], label: "Cycle windows" },
  { keys: ["Alt", "⇧", "↑"], label: "Maximize / restore" },
  { keys: ["Alt", "⇧", "←"], label: "Tile left" },
  { keys: ["Alt", "⇧", "→"], label: "Tile right" },
  { keys: ["Alt", "M"], label: "Minimize" },
  { keys: ["Alt", "W"], label: "Close window" },
];

const TIPS = [
  "Drag a window to the left or right edge to tile it, or to the top to maximize.",
  "Double-click a title bar to maximize. Right-click it for more window actions.",
  "Click an app in the dock to focus it; click again to minimize.",
];

export default function Welcome() {
  const apps = useInstalledApps().filter((a) => a.id !== "nexus.welcome");
  const mod = modKeyLabel();

  return (
    <div className="nx-scroll h-full overflow-y-auto bg-surface">
      <div className="mx-auto max-w-[560px] px-8 pb-8 pt-9">
        <NexusMark className="size-8 text-fg" />
        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-fg">Welcome to NEXUS</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          A desktop environment that runs entirely in your browser — windows, applications and system
          services, with nothing installed on your machine.
        </p>

        <h2 className="mt-8 text-[11.5px] font-medium text-subtle">Applications</h2>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => lifecycle.launchApp(app.id)}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised p-2.5 text-left transition-colors hover:border-line-strong hover:bg-hover"
            >
              <AppIcon icon={app.icon} size={32} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-fg">{app.name}</span>
                <span className="block truncate text-[11.5px] text-subtle">{app.description}</span>
              </span>
            </button>
          ))}
        </div>

        <h2 className="mt-8 text-[11.5px] font-medium text-subtle">Working with windows</h2>
        <ul className="mt-2.5 space-y-2">
          {TIPS.map((tip) => (
            <li key={tip} className="flex gap-2.5 text-[12.5px] leading-relaxed text-muted">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-subtle" />
              {tip}
            </li>
          ))}
        </ul>

        <h2 className="mt-8 text-[11.5px] font-medium text-subtle">Keyboard shortcuts</h2>
        <dl className="mt-2.5 divide-y divide-line rounded-lg border border-line">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between px-3 py-2">
              <dt className="text-[12.5px] text-muted">{s.label}</dt>
              <dd className="flex gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k === "MOD" ? mod : k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
