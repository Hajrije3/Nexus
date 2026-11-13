"use client";

import { useEffect, useState } from "react";
import { AppWindow, Check, HardDrive, Info, Palette, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AppComponentProps } from "@/system/runtime/types";
import { useInstalledApps } from "@/system/runtime/registry";
import { PERMISSION_INFO } from "@/system/runtime/permissions";
import { useLaunchRequests } from "@/system/sdk/launch";
import { useWindow } from "@/system/sdk/window";
import {
  eraseAllData,
  updateSettings,
  useEffectiveTheme,
  useSettings,
  useStorageInfo,
  type AccentId,
  type ThemePreference,
  type WallpaperId,
} from "@/system/sdk/system";
import { ACCENTS, WALLPAPERS } from "@/system/settings/settings";
import { SYSTEM_NAME, SYSTEM_VERSION } from "@/system/version";
import { ACCENT_SPECS, WALLPAPER_SPECS } from "@/ui/theme";
import { AppIcon } from "@/ui/AppIcon";
import { Button } from "@/ui/Button";
import { ConfirmDialog } from "@/ui/Dialog";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Switch } from "@/ui/Switch";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "applications", label: "Applications", icon: AppWindow },
  { id: "about", label: "About", icon: Info },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

type SectionId = (typeof SECTIONS)[number]["id"];
const isSection = (v: unknown): v is SectionId => SECTIONS.some((s) => s.id === v);

export default function Settings({ args }: AppComponentProps) {
  const [section, setSection] = useState<SectionId>(isSection(args.section) ? args.section : "appearance");
  const { setTitle } = useWindow();

  useLaunchRequests((next) => isSection(next.section) && setSection(next.section));

  const label = SECTIONS.find((s) => s.id === section)?.label ?? "";
  useEffect(() => setTitle(`Settings — ${label}`), [label, setTitle]);

  return (
    <div className="flex h-full bg-surface">
      <nav aria-label="Settings sections" className="w-[176px] shrink-0 border-r border-line bg-surface-sunken p-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={section === s.id ? "page" : undefined}
            onClick={() => setSection(s.id)}
            className={cn(
              "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12.5px] transition-colors",
              section === s.id ? "bg-active font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
            )}
          >
            <s.icon size={15} strokeWidth={1.75} className={section === s.id ? "text-accent" : ""} />
            {s.label}
          </button>
        ))}
      </nav>
      <div className="nx-scroll min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[620px] px-7 py-6">
          <h1 className="mb-5 text-[17px] font-semibold tracking-[-0.01em] text-fg">{label}</h1>
          {section === "appearance" && <AppearanceSection />}
          {section === "storage" && <StorageSection />}
          {section === "applications" && <ApplicationsSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Appearance ────────────────────────────── */

function AppearanceSection() {
  const theme = useSettings((s) => s.theme);
  const accent = useSettings((s) => s.accent);
  const wallpaper = useSettings((s) => s.wallpaper);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const effective = useEffectiveTheme();

  return (
    <div className="space-y-6">
      <Group title="Theme">
        <Row label="Appearance" hint={theme === "system" ? `Following your device (${effective})` : undefined}>
          <SegmentedControl<ThemePreference>
            aria-label="Theme"
            value={theme}
            onChange={(v) => updateSettings({ theme: v })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Row>
        <Row label="Accent colour">
          <div role="radiogroup" aria-label="Accent colour" className="flex gap-2">
            {ACCENTS.map((id: AccentId) => {
              const selected = id === accent;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={ACCENT_SPECS[id].label}
                  title={ACCENT_SPECS[id].label}
                  onClick={() => updateSettings({ accent: id })}
                  className={cn(
                    "grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow",
                    selected ? "ring-2 ring-fg/60" : "hover:ring-2 hover:ring-line-strong",
                  )}
                  style={{ background: ACCENT_SPECS[id][effective].accent }}
                >
                  {selected && <Check size={12} strokeWidth={3} style={{ color: ACCENT_SPECS[id][effective].fg }} />}
                </button>
              );
            })}
          </div>
        </Row>
      </Group>

      <Group title="Wallpaper">
        <div role="radiogroup" aria-label="Wallpaper" className="grid grid-cols-3 gap-3 p-3">
          {WALLPAPERS.map((id: WallpaperId) => {
            const spec = WALLPAPER_SPECS[id];
            const selected = id === wallpaper;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => updateSettings({ wallpaper: id })}
                className="group space-y-1.5 text-left"
              >
                <span
                  className={cn(
                    "relative block aspect-[16/10] overflow-hidden rounded-lg border transition-shadow",
                    selected ? "border-transparent ring-2 ring-accent" : "border-line-strong group-hover:ring-2 group-hover:ring-line-strong",
                  )}
                  style={{ backgroundColor: spec.base[effective] }}
                >
                  {/* A true miniature: the full-size wallpaper, scaled down. */}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 block h-[900px] w-[1440px] origin-top-left scale-[0.125]"
                    style={{ backgroundColor: spec.base[effective], backgroundImage: spec.layers[effective] }}
                  />
                </span>
                <span className={cn("block text-[12px]", selected ? "font-medium text-fg" : "text-muted")}>{spec.label}</span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Motion">
        <Row label="Reduce motion" hint="Turn off window and interface animations" htmlFor="reduce-motion">
          <Switch id="reduce-motion" checked={reduceMotion} onCheckedChange={(v) => updateSettings({ reduceMotion: v })} />
        </Row>
      </Group>
    </div>
  );
}

/* ─────────────────────────────── Storage ─────────────────────────────── */

function StorageSection() {
  const info = useStorageInfo();
  const [confirming, setConfirming] = useState(false);
  const { usedBytes, quotaBytes } = info.estimate ?? { usedBytes: null, quotaBytes: null };
  const ratio = usedBytes !== null && quotaBytes ? Math.min(1, usedBytes / quotaBytes) : null;

  return (
    <div className="space-y-6">
      {!info.persistent && (
        <div role="alert" className="flex gap-3 rounded-lg border border-danger/30 bg-danger/8 p-3 text-[12.5px] text-fg">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="font-medium">Changes are not being saved</p>
            <p className="mt-0.5 text-muted">
              Your browser blocked persistent storage{info.degradedReason ? ` (${info.degradedReason})` : ""}. Everything will be lost
              when this page closes.
            </p>
          </div>
        </div>
      )}

      <Group title="Filesystem">
        <Row label="Files">{info.usage ? <Value>{info.usage.files.toLocaleString()}</Value> : <Value muted>…</Value>}</Row>
        <Row label="Folders">{info.usage ? <Value>{info.usage.directories.toLocaleString()}</Value> : <Value muted>…</Value>}</Row>
        <Row label="File contents">{info.usage ? <Value>{formatBytes(info.usage.bytes)}</Value> : <Value muted>…</Value>}</Row>
      </Group>

      <Group title="Browser storage">
        <Row label="Status">
          <Value>{info.persistent ? "Saved in this browser (IndexedDB)" : "Temporary (memory only)"}</Value>
        </Row>
        <div className="space-y-2 px-4 py-3">
          <div className="flex justify-between text-[12.5px]">
            <span className="text-fg">Used by NEXUS</span>
            <span className="tabular-nums text-muted">
              {usedBytes !== null ? formatBytes(usedBytes) : "Unknown"}
              {quotaBytes ? ` of ${formatBytes(quotaBytes)} available` : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-active" role="progressbar" aria-label="Storage used" aria-valuenow={ratio !== null ? Math.round(ratio * 100) : undefined} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(ratio ?? 0, 0.005) * 100}%` }} />
          </div>
        </div>
      </Group>

      <Group title="Reset">
        <Row label="Erase all data" hint="Delete every file, setting and saved window, then restart NEXUS">
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Erase…
          </Button>
        </Row>
      </Group>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Erase all NEXUS data?"
        description="All files in your home directory, your settings and your open windows will be permanently deleted. This can’t be undone."
        confirmLabel="Erase and restart"
        danger
        onConfirm={eraseAllData}
      />
    </div>
  );
}

/* ───────────────────────────── Applications ───────────────────────────── */

function ApplicationsSection() {
  const apps = useInstalledApps();
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-relaxed text-muted">
        Permissions are declared by each application. They are shown here for transparency; the permission manager that
        enforces them arrives with plugin support.
      </p>
      {apps.map((app) => (
        <section key={app.id} className="rounded-lg border border-line" aria-label={app.name}>
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <AppIcon icon={app.icon} size={32} />
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-medium text-fg">{app.name}</h3>
              <p className="truncate text-[11.5px] text-subtle">
                {app.id} · v{app.version}
              </p>
            </div>
          </header>
          {app.permissions.length === 0 ? (
            <p className="px-4 py-2.5 text-[12px] text-subtle">No special permissions</p>
          ) : (
            <ul className="divide-y divide-line">
              {app.permissions.map((p) => (
                <li key={p} className="flex items-center justify-between gap-4 px-4 py-2">
                  <span className="text-[12.5px] text-fg">{PERMISSION_INFO[p].label}</span>
                  <span className="text-right text-[11.5px] text-subtle">{PERMISSION_INFO[p].description}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/* ──────────────────────────────── About ──────────────────────────────── */

function AboutSection() {
  return (
    <Group title={SYSTEM_NAME}>
      <Row label="Version">
        <Value>{SYSTEM_VERSION}</Value>
      </Row>
      <Row label="Runs on">
        <Value>{typeof navigator !== "undefined" ? navigator.userAgent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] ?? "Web browser" : "Web browser"}</Value>
      </Row>
      <Row label="Data">
        <Value>Stored locally in this browser — nothing is sent to a server</Value>
      </Row>
    </Group>
  );
}

/* ─────────────────────────────── Layout ─────────────────────────────── */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-[11.5px] font-medium text-subtle">{title}</h2>
      <div className="divide-y divide-line rounded-lg border border-line bg-surface-raised/40">{children}</div>
    </section>
  );
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[12.5px] text-fg">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-[11.5px] text-subtle">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Value({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={cn("text-[12.5px] tabular-nums", muted ? "text-subtle" : "text-muted")}>{children}</span>;
}
