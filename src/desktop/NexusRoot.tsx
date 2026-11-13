"use client";

import dynamic from "next/dynamic";
import { BootScreen } from "./BootScreen";

/**
 * The desktop is client-only: its geometry depends on the viewport and its
 * state lives in browser storage, so there is nothing meaningful to
 * server-render beyond the boot screen.
 */
const Desktop = dynamic(() => import("./Desktop").then((m) => m.Desktop), {
  ssr: false,
  loading: () => <BootScreen />,
});

export function NexusRoot() {
  return <Desktop />;
}
