import type { AppManifest } from "@/system/runtime/types";

export const terminalManifest: AppManifest = {
  id: "nexus.terminal",
  name: "Terminal",
  version: "1.0.0",
  description: "Command line for the NEXUS filesystem",
  icon: { glyph: "terminal", tint: "#2b2e36" },
  permissions: ["fs:read", "fs:write"],
  window: {
    defaultSize: { width: 720, height: 440 },
    minSize: { width: 380, height: 220 },
    resizable: true,
  },
  singleInstance: false,
  load: () => import("./Terminal"),
};
