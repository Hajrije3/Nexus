import type { VirtualFileSystem } from "@/system/fs/vfs";

/** Output styling hints. Dropped when output is piped or redirected. */
export type OutputStyle = "plain" | "error" | "muted" | "dir" | "exec" | "accent" | "success";

export interface Writer {
  write(text: string, style?: OutputStyle): void;
}

/** Side effects a command may request from the hosting terminal. */
export interface TerminalHost {
  close(): void;
  openPath(path: string, appId?: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface CommandContext {
  /** Arguments after expansion, excluding the command name. */
  args: string[];
  fs: VirtualFileSystem;
  cwd: string;
  setCwd(path: string): void;
  env: Record<string, string>;
  /** False when stdout is piped or redirected (commands may change format, like `ls`). */
  stdoutIsTTY: boolean;
  /** Text piped or redirected into this command, or null if none. */
  stdin: string | null;
  stdout: Writer;
  stderr: Writer;
  history: readonly string[];
  host: TerminalHost;
  /** All registered commands (for `help`). */
  commands: ReadonlyMap<string, CommandSpec>;
}

export interface CommandSpec {
  name: string;
  summary: string;
  usage: string;
  /** Returns the exit status: 0 success, 1 failure, 2 usage error. */
  run(ctx: CommandContext): Promise<number>;
}
