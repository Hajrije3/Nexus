/**
 * App SDK — opening files and receiving launch requests.
 */
import { useContext } from "react";
import { getServices } from "@/system/services";
import { appRegistry, useInstalledApps } from "@/system/runtime/registry";
import { lifecycle } from "@/system/runtime/lifecycle";
import { appsForFile, openPath as openWithRuntime } from "@/system/runtime/open";
import type { AppId, AppManifest, LaunchArgs, LaunchResult } from "@/system/runtime/types";
import { useSystemEvent } from "./events";
import { WindowContext } from "./window";

/** Open a file or folder in its default app (or `appId`). */
export function openPath(path: string, appId?: AppId): Promise<LaunchResult> {
  return openWithRuntime(path, { fs: getServices().fs, registry: appRegistry, lifecycle }, appId ? { appId } : {});
}

/** Apps that can open `path`, best first (for "Open With" menus). */
export function useAppsForFile(path: string | null): AppManifest[] {
  const apps = useInstalledApps();
  return path ? appsForFile(path, apps) : [];
}

export function launchApp(appId: AppId, args: LaunchArgs = {}): LaunchResult {
  return lifecycle.launchApp(appId, args);
}

/**
 * Called when this (single-instance) app is launched again with new args —
 * e.g. the user opened another file from Files while the app was running.
 */
export function useLaunchRequests(handler: (args: LaunchArgs) => void): void {
  const ctx = useContext(WindowContext);
  const instanceId = ctx?.instanceId;
  useSystemEvent("app.relaunched", (payload) => {
    if (payload.instanceId === instanceId) handler(payload.args);
  });
}
