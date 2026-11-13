import type { AppManifest } from "@/system/runtime/types";

export const activityMonitorManifest: AppManifest = {
  id: "nexus.activity-monitor",
  name: "Activity Monitor",
  version: "1.0.0",
  description: "Inspect running applications and the window stack",
  icon: { glyph: "activity", tint: "#2c8f6f" },
  permissions: ["system:processes"],
  window: {
    defaultSize: { width: 640, height: 420 },
    minSize: { width: 460, height: 260 },
    resizable: true,
  },
  singleInstance: true,
  load: () => import("./ActivityMonitor"),
};
