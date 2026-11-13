import type { AppManifest } from "@/system/runtime/types";

export const welcomeManifest: AppManifest = {
  id: "nexus.welcome",
  name: "Welcome",
  version: "1.0.0",
  description: "Getting started with NEXUS",
  icon: { glyph: "sparkles", tint: "#5562d6" },
  permissions: [],
  window: {
    defaultSize: { width: 620, height: 560 },
    minSize: { width: 420, height: 320 },
    resizable: true,
  },
  singleInstance: true,
  load: () => import("./Welcome"),
};
