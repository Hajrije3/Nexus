"use client";

import { TriangleAlert } from "lucide-react";
import { useSystemStatus } from "@/system/services";

/**
 * Visible only when storage fell back to memory: the user must know their
 * work won't survive a reload.
 */
export function StorageIndicator() {
  const storage = useSystemStatus((s) => s.storage);
  const reason = useSystemStatus((s) => s.storageReason);
  if (storage !== "memory") return null;

  return (
    <span
      role="status"
      title={`Browser storage is unavailable${reason ? ` (${reason})` : ""}. Files and windows will be lost when this page is closed.`}
      className="flex h-[22px] items-center gap-1.5 rounded-[5px] bg-danger/12 px-2 text-[11.5px] font-medium text-danger"
    >
      <TriangleAlert size={12} strokeWidth={2} />
      Not saving
    </span>
  );
}
