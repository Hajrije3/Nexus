import { lazy, type LazyExoticComponent } from "react";
import { appRegistry } from "@/system/runtime/registry";
import type { AppComponent, AppId } from "@/system/runtime/types";

const cache = new Map<AppId, LazyExoticComponent<AppComponent>>();

/**
 * One lazy component per app id, so every window of an app shares the same
 * code-split chunk and React never sees a "new" component type between renders.
 */
export function getAppComponent(appId: AppId): LazyExoticComponent<AppComponent> {
  let component = cache.get(appId);
  if (!component) {
    component = lazy(async () => {
      const manifest = appRegistry.get(appId);
      if (!manifest) throw new Error(`Application "${appId}" is not installed.`);
      return manifest.load();
    });
    cache.set(appId, component);
  }
  return component;
}

/** Forget a cached loader (e.g. after a failed chunk load, to allow retry). */
export function evictAppComponent(appId: AppId): void {
  cache.delete(appId);
}
