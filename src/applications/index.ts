import type { AppManifest } from "@/system/runtime/types";
import { welcomeManifest } from "./welcome/manifest";
import { activityMonitorManifest } from "./activity-monitor/manifest";
import { calculatorManifest } from "./calculator/manifest";

/**
 * Applications bundled with the system, registered at boot in this order.
 * Only manifests are imported here; each app's UI is a lazy chunk.
 */
export const builtinApps: readonly AppManifest[] = [welcomeManifest, activityMonitorManifest, calculatorManifest];
