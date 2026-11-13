import { appRegistry } from "@/system/runtime/registry";
import { builtinApps } from "@/applications";

let booted = false;

/** Register built-in applications. Idempotent (safe under StrictMode / HMR). */
export function bootSystem(): void {
  if (booted) return;
  booted = true;
  for (const manifest of builtinApps) {
    if (!appRegistry.get(manifest.id)) appRegistry.register(manifest);
  }
}
