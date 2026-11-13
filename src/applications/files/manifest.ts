import type { AppManifest } from "@/system/runtime/types";

export const filesManifest: AppManifest = {
  id: "nexus.files",
  name: "Files",
  version: "1.0.0",
  description: "Browse, organise and preview your files",
  icon: { glyph: "folder", tint: "#2f7fd6" },
  permissions: ["fs:read", "fs:write"],
  window: {
    defaultSize: { width: 900, height: 560 },
    minSize: { width: 620, height: 340 },
    resizable: true,
  },
  singleInstance: false,
  load: () => import("./Files"),
};
