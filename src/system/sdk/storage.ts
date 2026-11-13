/**
 * App SDK — small persistent preferences, namespaced per application
 * (`app.<appId>.<key>` in the system key-value store).
 *
 * For documents and user data, use the filesystem instead.
 */
import { useContext, useEffect, useState } from "react";
import { getServices } from "@/system/services";
import { WindowContext } from "./window";

export function useAppPreference<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => T | null,
): [value: T, setValue: (value: T) => void, loaded: boolean] {
  const appId = useContext(WindowContext)?.appId;
  if (!appId) throw new Error("useAppPreference() must be used inside an application window");
  const storageKey = `app.${appId}.${key}`;
  const [state, setState] = useState<{ value: T; loaded: boolean }>({ value: fallback, loaded: false });

  useEffect(() => {
    let cancelled = false;
    getServices()
      .kv.get(storageKey, validate)
      .then(
        (stored) => !cancelled && setState((s) => ({ value: stored ?? s.value, loaded: true })),
        () => !cancelled && setState((s) => ({ ...s, loaded: true })),
      );
    return () => {
      cancelled = true;
    };
    // `validate` is expected to be a stable module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const setValue = (value: T) => {
    setState({ value, loaded: true });
    getServices()
      .kv.set(storageKey, value)
      .catch((e: unknown) => console.error(`[nexus] failed to save ${storageKey}`, e));
  };

  return [state.value, setValue, state.loaded];
}

/** Validator helper for string unions. */
export const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): T | null =>
    typeof v === "string" && (values as string[]).includes(v) ? (v as T) : null;
