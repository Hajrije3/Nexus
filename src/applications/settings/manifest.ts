import type { AppManifest } from "@/system/runtime/types";

export const settingsManifest: AppManifest = {
  id: "nexus.settings",
  name: "Settings",
  version: "1.0.0",
  description: "Appearance, storage and applications",
  icon: { glyph: "settings", tint: "#5d616c" },
  permissions: ["system:settings", "fs:read"],
  window: {
    defaultSize: { width: 780, height: 560 },
    minSize: { width: 560, height: 380 },
    resizable: true,
  },
  singleInstance: true,
  load: () => import("./Settings"),
};
