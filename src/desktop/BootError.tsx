"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/ui/Button";

/** Shown if the boot sequence itself fails (as opposed to a single app). */
export function BootError({ error }: { error: Error }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-desk p-6" role="alert">
      <div className="flex max-w-[400px] flex-col items-center gap-4 text-center">
        <div className="grid size-10 place-items-center rounded-full bg-danger/10 text-danger">
          <TriangleAlert size={18} strokeWidth={1.75} />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-[15px] font-semibold text-fg">NEXUS couldn’t start</h1>
          <p className="text-[12.5px] leading-relaxed text-muted" data-selectable>
            {error.message || "An unknown error occurred during startup."}
          </p>
        </div>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
