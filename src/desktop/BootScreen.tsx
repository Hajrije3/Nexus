import { NexusMark } from "@/ui/NexusMark";

export function BootScreen() {
  return (
    <div
      className="fixed inset-0 grid place-items-center bg-desk"
      role="status"
      aria-label="Starting NEXUS"
    >
      <div className="flex flex-col items-center gap-5">
        <NexusMark className="size-9 text-fg/90" />
        <div className="h-[3px] w-28 overflow-hidden rounded-full bg-line">
          <div className="h-full w-1/3 animate-[nx-boot_1.1s_ease-in-out_infinite] rounded-full bg-fg/60" />
        </div>
      </div>
      <style>{`@keyframes nx-boot{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
