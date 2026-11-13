import type { AppManifest } from "@/system/runtime/types";

export const codeStudioManifest: AppManifest = {
  id: "nexus.code-studio",
  name: "Code Studio",
  version: "1.0.0",
  description: "Code editor with tabs, a project explorer and autosave",
  icon: { glyph: "code", tint: "#5b4fd1" },
  permissions: ["fs:read", "fs:write"],
  window: {
    defaultSize: { width: 1000, height: 640 },
    minSize: { width: 600, height: 360 },
    resizable: true,
  },
  singleInstance: true,
  // Opens any text file; Notes takes precedence for .md/.txt by default.
  fileHandlers: [{ extensions: "*", textOnly: true, priority: 5 }],
  load: () => import("./CodeStudio"),
};
