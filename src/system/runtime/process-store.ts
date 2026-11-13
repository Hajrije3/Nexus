import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { WindowId } from "@/system/window-manager/types";
import type { AppInstance, InstanceId } from "./types";

export interface ProcessTableState {
  instances: Readonly<Record<InstanceId, AppInstance>>;
}

export function createProcessTable() {
  const store = createStore<ProcessTableState>()(() => ({ instances: {} }));

  const patch = (id: InstanceId, fn: (i: AppInstance) => AppInstance) => {
    const inst = store.getState().instances[id];
    if (!inst) return;
    store.setState((s) => ({ instances: { ...s.instances, [id]: fn(inst) } }));
  };

  return {
    store,
    add(instance: AppInstance): void {
      store.setState((s) => ({ instances: { ...s.instances, [instance.instanceId]: instance } }));
    },
    remove(id: InstanceId): void {
      store.setState((s) => {
        if (!s.instances[id]) return s;
        const { [id]: _removed, ...rest } = s.instances;
        return { instances: rest };
      });
    },
    get(id: InstanceId): AppInstance | undefined {
      return store.getState().instances[id];
    },
    list(): AppInstance[] {
      return Object.values(store.getState().instances);
    },
    attachWindow(id: InstanceId, windowId: WindowId): void {
      patch(id, (i) => ({ ...i, windowIds: [...i.windowIds, windowId] }));
    },
    detachWindow(id: InstanceId, windowId: WindowId): void {
      patch(id, (i) => ({ ...i, windowIds: i.windowIds.filter((w) => w !== windowId) }));
    },
  };
}

export type ProcessTable = ReturnType<typeof createProcessTable>;

export const processTable = createProcessTable();

export function useProcesses<T>(selector: (s: ProcessTableState) => T): T {
  return useStore(processTable.store, selector);
}
