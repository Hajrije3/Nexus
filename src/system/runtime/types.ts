import type { ComponentType } from "react";
import type { Size, WindowId } from "@/system/window-manager/types";

export type AppId = string;
export type InstanceId = `proc_${string}`;

/**
 * Capabilities an application must declare to use a system service.
 * Enforcement arrives with the permission manager in Phase 4; declaring them
 * now keeps manifests forward-compatible.
 */
export type Permission =
  | "fs:read"
  | "fs:write"
  | "notifications"
  | "system:processes"
  | "system:settings"
  | "network";

/**
 * Glyph names are resolved to icons by the desktop layer, keeping manifests
 * serialisable (required for marketplace/plugin manifests in Phase 4).
 */
export type AppGlyph =
  | "sparkles"
  | "activity"
  | "calculator"
  | "folder"
  | "terminal"
  | "code"
  | "notebook"
  | "settings"
  | "store";

export interface AppIconSpec {
  glyph: AppGlyph;
  /** Tile background, any CSS colour. */
  tint: string;
}

export interface WindowDefaults {
  defaultSize: Size;
  minSize: Size;
  resizable: boolean;
}

export type LaunchArgs = Readonly<Record<string, string | number | boolean>>;

export interface AppComponentProps {
  windowId: WindowId;
  instanceId: InstanceId;
  args: LaunchArgs;
}

export type AppComponent = ComponentType<AppComponentProps>;

/** Declares that an app can open certain files. */
export interface FileHandler {
  /** Lower-case extensions including the dot (".md"), or "*" for any. */
  extensions: readonly string[] | "*";
  /** Only offer this handler for text content. */
  textOnly?: boolean;
  /** Higher wins when choosing the default app for a file. */
  priority: number;
}

export interface AppManifest {
  /** Reverse-DNS identifier, e.g. `nexus.calculator`. */
  id: AppId;
  name: string;
  version: string;
  description: string;
  icon: AppIconSpec;
  permissions: readonly Permission[];
  window: WindowDefaults;
  /** Re-launching focuses the existing instance instead of spawning another. */
  singleInstance: boolean;
  /** File types this app can open (see `openPath`). */
  fileHandlers?: readonly FileHandler[];
  /** Lazy entry point; becomes its own code-split chunk. */
  load: () => Promise<{ default: AppComponent }>;
}

export interface AppInstance {
  instanceId: InstanceId;
  appId: AppId;
  windowIds: readonly WindowId[];
  launchedAt: number;
  args: LaunchArgs;
}

export type LaunchResult =
  | { ok: true; instanceId: InstanceId; windowId: WindowId; reused: boolean }
  | { ok: false; error: string };
