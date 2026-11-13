import type { AppManifest } from "@/system/runtime/types";

export const notesManifest: AppManifest = {
  id: "nexus.notes",
  name: "Notes",
  version: "1.0.0",
  description: "Markdown notes, saved as files in Documents",
  icon: { glyph: "notebook", tint: "#c9952f" },
  permissions: ["fs:read", "fs:write"],
  window: {
    defaultSize: { width: 900, height: 580 },
    minSize: { width: 560, height: 340 },
    resizable: true,
  },
  singleInstance: true,
  fileHandlers: [{ extensions: [".md", ".txt"], priority: 10 }],
  load: () => import("./Notes"),
};
