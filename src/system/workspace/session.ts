/**
 * Workspace session persistence: which apps are running, their windows'
 * geometry/mode, stacking order and focus — so a reload puts the user back
 * exactly where they were.
 *
 * Snapshots are plain, versioned data. `parseSession` validates anything read
 * from storage, because stored data may be from an older build or corrupted.
 */
import type { WindowManagerState, WindowMode, Rect, WindowId } from "@/system/window-manager/types";
import type { AppInstance, LaunchArgs } from "@/system/runtime/types";
import type { Lifecycle, WindowSeed } from "@/system/runtime/lifecycle";

export const SESSION_KEY = "workspace.session";
const VERSION = 1;

export interface SessionWindow extends WindowSeed {
  /** Position in the stack, 0 = bottom. */
  z: number;
  focused: boolean;
}

export interface SessionInstance {
  appId: string;
  args: LaunchArgs;
  windows: SessionWindow[];
}

export interface SessionSnapshot {
  version: typeof VERSION;
  savedAt: number;
  instances: SessionInstance[];
}

export function captureSession(
  wm: Pick<WindowManagerState, "windows" | "stack" | "focusedId">,
  instances: readonly AppInstance[],
  now: number,
): SessionSnapshot {
  const ordered = [...instances].sort((a, b) => a.launchedAt - b.launchedAt);
  return {
    version: VERSION,
    savedAt: now,
    instances: ordered.flatMap((inst) => {
      const windows = inst.windowIds.flatMap((id): SessionWindow[] => {
        const w = wm.windows[id];
        if (!w) return [];
        return [
          {
            title: w.title,
            bounds: { ...w.bounds },
            mode: w.mode,
            minimized: w.minimized,
            z: wm.stack.indexOf(id),
            focused: wm.focusedId === id,
          },
        ];
      });
      return windows.length ? [{ appId: inst.appId, args: { ...inst.args }, windows }] : [];
    }),
  };
}

/* ───────────── Validation (stored data is untrusted) ───────────── */

const MODES: readonly WindowMode[] = ["normal", "maximized", "tiled-left", "tiled-right"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseRect(v: unknown): Rect | null {
  if (!isObj(v) || !isNum(v.x) || !isNum(v.y) || !isNum(v.width) || !isNum(v.height)) return null;
  if (v.width <= 0 || v.height <= 0) return null;
  return { x: v.x, y: v.y, width: v.width, height: v.height };
}

function parseArgs(v: unknown): LaunchArgs {
  if (!isObj(v)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") out[k] = val;
  }
  return out;
}

function parseWindow(v: unknown): SessionWindow | null {
  if (!isObj(v)) return null;
  const bounds = parseRect(v.bounds);
  if (!bounds || typeof v.title !== "string" || !MODES.includes(v.mode as WindowMode) || !isNum(v.z)) return null;
  return {
    title: v.title,
    bounds,
    mode: v.mode as WindowMode,
    minimized: v.minimized === true,
    z: v.z,
    focused: v.focused === true,
  };
}

export function parseSession(v: unknown): SessionSnapshot | null {
  if (!isObj(v) || v.version !== VERSION || !Array.isArray(v.instances)) return null;
  const instances = v.instances.flatMap((raw): SessionInstance[] => {
    if (!isObj(raw) || typeof raw.appId !== "string" || !Array.isArray(raw.windows)) return [];
    const windows = raw.windows.map(parseWindow).filter((w): w is SessionWindow => w !== null);
    return windows.length ? [{ appId: raw.appId, args: parseArgs(raw.args), windows }] : [];
  });
  return { version: VERSION, savedAt: isNum(v.savedAt) ? v.savedAt : 0, instances };
}

/* ───────────────────────────── Restore ───────────────────────────── */

export interface RestoreSummary {
  windows: number;
  /** Apps in the snapshot that are no longer installed. */
  skippedApps: string[];
}

export function restoreSession(
  snapshot: SessionSnapshot,
  deps: { lifecycle: Pick<Lifecycle, "restoreInstance">; restoreStack: (order: WindowId[], focused: WindowId | null) => void },
): RestoreSummary {
  const placed: { id: WindowId; z: number; focused: boolean }[] = [];
  const skipped = new Set<string>();

  for (const inst of snapshot.instances) {
    const result = deps.lifecycle.restoreInstance(inst.appId, inst.args, inst.windows);
    if (!result.ok) {
      skipped.add(inst.appId);
      continue;
    }
    result.windowIds.forEach((id, i) => {
      const w = inst.windows[i];
      if (w) placed.push({ id, z: w.z, focused: w.focused });
    });
  }

  const order = [...placed].sort((a, b) => a.z - b.z).map((p) => p.id);
  deps.restoreStack(order, placed.find((p) => p.focused)?.id ?? null);
  return { windows: placed.length, skippedApps: [...skipped] };
}
