import type { AppManifest } from "@/system/runtime/types";
import { filesManifest } from "./files/manifest";
import { terminalManifest } from "./terminal/manifest";
import { codeStudioManifest } from "./code-studio/manifest";
import { notesManifest } from "./notes/manifest";
import { settingsManifest } from "./settings/manifest";
import { activityMonitorManifest } from "./activity-monitor/manifest";
import { calculatorManifest } from "./calculator/manifest";
import { welcomeManifest } from "./welcome/manifest";

/**
 * Applications bundled with the system, registered at boot in this order
 * (which is also the dock order). Only manifests are imported here; each
 * app's UI is a lazy chunk.
 */
export const builtinApps: readonly AppManifest[] = [
  filesManifest,
  terminalManifest,
  codeStudioManifest,
  notesManifest,
  settingsManifest,
  activityMonitorManifest,
  calculatorManifest,
  welcomeManifest,
];
