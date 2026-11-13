/**
 * Shell executor: parses a command line and runs it against the virtual
 * filesystem. Pure TypeScript — the React terminal is just a view over this.
 */
import type { VirtualFileSystem } from "@/system/fs/vfs";
import { HOME, resolve } from "@/system/fs/path";
import { isFsError } from "@/system/fs/errors";
import { BUILTIN_COMMANDS } from "./commands";
import { expandVariables, globToRegExp, hasGlob, parse, ParseError, type Pipeline, type Word } from "./parser";
import type { CommandSpec, TerminalHost, Writer } from "./types";

export const MAX_HISTORY = 500;

export interface ShellOptions {
  cwd?: string;
  history?: readonly string[];
  commands?: readonly CommandSpec[];
}

/** Collects output in memory (pipes and redirection); styling is discarded. */
class BufferWriter implements Writer {
  text = "";
  write(text: string): void {
    this.text += text;
  }
}

export class Shell {
  cwd: string;
  readonly env: Record<string, string>;
  readonly history: string[];
  lastStatus = 0;
  readonly commands: ReadonlyMap<string, CommandSpec>;

  constructor(
    private readonly fs: VirtualFileSystem,
    private readonly host: TerminalHost,
    options: ShellOptions = {},
  ) {
    this.cwd = options.cwd ?? HOME;
    this.history = [...(options.history ?? [])];
    this.commands = new Map((options.commands ?? BUILTIN_COMMANDS).map((c) => [c.name, c]));
    this.env = { HOME, USER: "user", SHELL: "/system/nsh", PWD: this.cwd, TERM: "nexus" };
  }

  /** Record a line in history (skips blanks and immediate duplicates). */
  remember(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || this.history[this.history.length - 1] === trimmed) return;
    this.history.push(trimmed);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
  }

  /** Execute one command line. Returns the exit status of the last pipeline run. */
  async run(line: string, stdout: Writer, stderr: Writer): Promise<number> {
    let pipelines: Pipeline[];
    try {
      pipelines = parse(line);
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      stderr.write(`nsh: ${error.message}\n`, "error");
      return (this.lastStatus = 2);
    }

    for (const pipeline of pipelines) {
      if (pipeline.connector === "&&" && this.lastStatus !== 0) continue;
      if (pipeline.connector === "||" && this.lastStatus === 0) continue;
      this.lastStatus = await this.runPipeline(pipeline, stdout, stderr);
    }
    return this.lastStatus;
  }

  private async runPipeline(pipeline: Pipeline, stdout: Writer, stderr: Writer): Promise<number> {
    let input: string | null = null;
    let status = 0;

    for (const [i, command] of pipeline.commands.entries()) {
      const isLast = i === pipeline.commands.length - 1;
      const argv = await this.expandWords(command.words);
      const [name, ...args] = argv;
      const outRedirect = command.redirects.filter((r) => r.op !== "<").at(-1);
      const inRedirect = command.redirects.filter((r) => r.op === "<").at(-1);

      if (inRedirect) {
        const file = (await this.expandWords([inRedirect.target]))[0] ?? "";
        try {
          input = await this.fs.readText(resolve(this.cwd, file));
        } catch (e) {
          stderr.write(`nsh: ${file}: ${isFsError(e) ? e.description : String(e)}\n`, "error");
          return 1;
        }
      }

      const captured = !isLast || outRedirect ? new BufferWriter() : null;
      status = name === undefined ? 0 : await this.runCommand(name, args, input, captured ?? stdout, stderr, captured === null);
      input = captured && !outRedirect ? captured.text : null;

      if (outRedirect && captured) {
        const file = (await this.expandWords([outRedirect.target]))[0] ?? "";
        const path = resolve(this.cwd, file);
        try {
          const previous = outRedirect.op === ">>" ? await this.fs.readText(path).catch((e: unknown) => (isFsError(e, "ENOENT") ? "" : Promise.reject(e))) : "";
          await this.fs.writeFile(path, previous + captured.text);
        } catch (e) {
          stderr.write(`nsh: ${file}: ${isFsError(e) ? e.description : String(e)}\n`, "error");
          return 1;
        }
        // A redirected stage feeds nothing to the next stage, like a real shell.
        input = "";
      }
    }
    return status;
  }

  private async runCommand(name: string, args: string[], stdin: string | null, stdout: Writer, stderr: Writer, tty: boolean): Promise<number> {
    const spec = this.commands.get(name);
    if (!spec) {
      stderr.write(`nsh: command not found: ${name}\n`, "error");
      return 127;
    }
    try {
      return await spec.run({
        args,
        fs: this.fs,
        cwd: this.cwd,
        setCwd: (path) => {
          this.cwd = path;
          this.env.PWD = path;
        },
        env: this.env,
        stdin,
        stdout,
        stderr,
        stdoutIsTTY: tty,
        history: this.history,
        host: this.host,
        commands: this.commands,
      });
    } catch (error) {
      // A bug in one command must never take down the terminal.
      stderr.write(`${name}: ${error instanceof Error ? error.message : String(error)}\n`, "error");
      return 1;
    }
  }

  /** Variables, `~`, then globs — skipping unquoted words that expand to nothing. */
  async expandWords(words: readonly Word[]): Promise<string[]> {
    const vars = { ...this.env, "?": String(this.lastStatus) };
    const out: string[] = [];
    for (const word of words) {
      let chars = expandVariables(word, vars);
      if (chars[0]?.c === "~" && !chars[0].quoted && (chars.length === 1 || (chars[1]?.c === "/" && !chars[1].quoted))) {
        chars = [...[...HOME].map((c) => ({ c, quoted: true })), ...chars.slice(1)];
      }
      const text = chars.map((c) => c.c).join("");
      if (!text && word.length > 0 && !word.some((c) => c.quoted)) continue;
      out.push(...(hasGlob(chars) ? await this.glob(text) : [text]));
    }
    return out;
  }

  /** Expand a glob in the last path segment. No match → the pattern itself (POSIX default). */
  private async glob(pattern: string): Promise<string[]> {
    const slash = pattern.lastIndexOf("/");
    const dirPart = slash === -1 ? "" : pattern.slice(0, slash + 1);
    const namePart = pattern.slice(slash + 1);
    if (/[*?]/.test(dirPart)) return [pattern];
    try {
      const dir = resolve(this.cwd, dirPart || ".");
      const re = globToRegExp(namePart);
      const matches = (await this.fs.readdir(dir))
        .filter((e) => re.test(e.name) && (namePart.startsWith(".") || !e.name.startsWith(".")))
        .map((e) => dirPart + e.name)
        .sort();
      return matches.length ? matches : [pattern];
    } catch {
      return [pattern];
    }
  }
}

/** Prompt path: home collapsed to ~. */
export function promptPath(cwd: string): string {
  if (cwd === HOME) return "~";
  return cwd.startsWith(`${HOME}/`) ? `~${cwd.slice(HOME.length)}` : cwd;
}

