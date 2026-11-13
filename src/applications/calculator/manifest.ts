import type { AppManifest } from "@/system/runtime/types";

export const calculatorManifest: AppManifest = {
  id: "nexus.calculator",
  name: "Calculator",
  version: "1.0.0",
  description: "Basic arithmetic with full keyboard support",
  icon: { glyph: "calculator", tint: "#c46a3d" },
  permissions: [],
  window: {
    defaultSize: { width: 280, height: 400 },
    minSize: { width: 280, height: 400 },
    resizable: false,
  },
  singleInstance: false,
  load: () => import("./Calculator"),
};
