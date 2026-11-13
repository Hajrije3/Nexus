import type { Permission } from "./types";

/** Human-readable descriptions shown in Settings → Applications. */
export const PERMISSION_INFO: Record<Permission, { label: string; description: string }> = {
  "fs:read": { label: "Read files", description: "List and open files in your home directory" },
  "fs:write": { label: "Modify files", description: "Create, change, move and delete files" },
  notifications: { label: "Notifications", description: "Show notifications" },
  "system:processes": { label: "Running apps", description: "See and quit running applications" },
  "system:settings": { label: "System settings", description: "Change system-wide preferences and storage" },
  network: { label: "Network", description: "Connect to the internet" },
};
