import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { AppId, AppManifest } from "./types";

interface RegistryState {
  apps: Readonly<Record<AppId, AppManifest>>;
  /** Registration order; drives default dock/launcher ordering. */
  order: readonly AppId[];
}

const MANIFEST_ID = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export class RegistryError extends Error {
  override name = "RegistryError";
}

export function createAppRegistry() {
  const store = createStore<RegistryState>()(() => ({ apps: {}, order: [] }));

  return {
    store,
    register(manifest: AppManifest): void {
      if (!MANIFEST_ID.test(manifest.id)) {
        throw new RegistryError(`Invalid app id "${manifest.id}" (expected reverse-DNS)`);
      }
      const { apps, order } = store.getState();
      if (apps[manifest.id]) {
        throw new RegistryError(`App "${manifest.id}" is already registered`);
      }
      store.setState({ apps: { ...apps, [manifest.id]: manifest }, order: [...order, manifest.id] });
    },
    unregister(id: AppId): void {
      const { apps, order } = store.getState();
      if (!apps[id]) return;
      const { [id]: _removed, ...rest } = apps;
      store.setState({ apps: rest, order: order.filter((o) => o !== id) });
    },
    get(id: AppId): AppManifest | undefined {
      return store.getState().apps[id];
    },
    list(): AppManifest[] {
      const { apps, order } = store.getState();
      return order.flatMap((id) => (apps[id] ? [apps[id]] : []));
    },
  };
}

export type AppRegistry = ReturnType<typeof createAppRegistry>;

export const appRegistry = createAppRegistry();

export function useAppManifest(id: AppId | undefined): AppManifest | undefined {
  return useStore(appRegistry.store, (s) => (id ? s.apps[id] : undefined));
}

/** Ordered list of installed apps; re-renders only when the registry changes. */
export function useInstalledApps(): AppManifest[] {
  const order = useStore(appRegistry.store, (s) => s.order);
  const apps = useStore(appRegistry.store, (s) => s.apps);
  return order.flatMap((id) => (apps[id] ? [apps[id]] : []));
}
