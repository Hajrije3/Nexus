import { File, FileCode2, FileImage, FileJson, FileText, Folder, FolderOpen, type LucideIcon } from "lucide-react";
import { fileKind, type FileKind } from "@/system/fs/kinds";
import { cn } from "@/lib/utils";

const ICONS: Record<FileKind, { icon: LucideIcon; className: string }> = {
  folder: { icon: Folder, className: "text-sky-400 fill-sky-400/25" },
  image: { icon: FileImage, className: "text-violet-400" },
  document: { icon: FileText, className: "text-muted" },
  code: { icon: FileCode2, className: "text-emerald-400" },
  data: { icon: FileJson, className: "text-amber-400" },
  other: { icon: File, className: "text-subtle" },
};

interface FileIconProps {
  name: string;
  type: "file" | "directory";
  size?: number;
  open?: boolean;
  className?: string;
}

export function FileIcon({ name, type, size = 16, open, className }: FileIconProps) {
  const spec = ICONS[fileKind(name, type)];
  const Icon = type === "directory" && open ? FolderOpen : spec.icon;
  return <Icon size={size} strokeWidth={1.5} className={cn("shrink-0", spec.className, className)} aria-hidden="true" />;
}
