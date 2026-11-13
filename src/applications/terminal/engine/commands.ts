/**
 * Built-in commands. Each operates only on the virtual filesystem passed in
 * the context — never on the user's real machine.
 */
import { isFsError } from "@/system/fs/errors";
import { basename, HOME, join, resolve } from "@/system/fs/path";
import { kindLabel } from "@/system/fs/kinds";
import { SYSTEM_NAME, SYSTEM_VERSION } from "@/system/version";
import { formatBytes } from "@/lib/format";
import { globToRegExp } from "./parser";
import type { CommandContext, CommandSpec } from "./types";

/* ───────────────────────────── Helpers ───────────────────────────── */

interface ParsedFlags {
  flags: Set<string>;
  values: Map<string, string>;
  operands: string[];
}

/**
 * Minimal POSIX-style option parsing: combined short flags (`-la`), options
 * with values (`-n 5`, `-n5`), `--` to end options. `numericShorthand`
 * accepts `-5` as `-n 5` (head/tail).
 */
function parseFlags(
  args: readonly string[],
  allowed: string,
  withValue = "",
  numericShorthand = false,
): ParsedFlags | { error: string } {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const operands: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (!a.startsWith("-") || a === "-") {
      operands.push(a);
      continue;
    }
    if (numericShorthand && /^-\d+$/.test(a)) {
      values.set("n", a.slice(1));
      continue;
    }
    for (let j = 1; j < a.length; j++) {
      const f = a[j]!;
      if (withValue.includes(f)) {
        const value = a.slice(j + 1) || args[++i];
        if (value === undefined) return { error: `option requires an argument -- '${f}'` };
        values.set(f, value);
        break;
      }
      if (!allowed.includes(f)) return { error: `invalid option -- '${f}'` };
      flags.add(f);
    }
  }
  return { flags, values, operands };
}

function errText(error: unknown): string {
  if (isFsError(error)) return error.description;
  return error instanceof Error ? error.message : String(error);
}

function usageError(ctx: CommandContext, name: string, message: string, usage: string): number {
  ctx.stderr.write(`${name}: ${message}\nUsage: ${usage}\n`, "error");
  return 2;
}

function parsed(ctx: CommandContext, spec: CommandSpec, allowed: string, withValue = "", numeric = false): ParsedFlags | null {
  const r = parseFlags(ctx.args, allowed, withValue, numeric);
  if ("error" in r) {
    usageError(ctx, spec.name, r.error, spec.usage);
    return null;
  }
  return r;
}

const abs = (ctx: CommandContext, p: string) => resolve(ctx.cwd, p);

/** Read input from files (or stdin when none), reporting errors per file. */
async function readInputs(ctx: CommandContext, name: string, files: string[]): Promise<{ label: string | null; text: string }[] | null> {
  if (files.length === 0) return [{ label: null, text: ctx.stdin ?? "" }];
  const out: { label: string; text: string }[] = [];
  let failed = false;
  for (const f of files) {
    try {
      out.push({ label: f, text: await ctx.fs.readText(abs(ctx, f)) });
    } catch (e) {
      ctx.stderr.write(`${name}: ${f}: ${errText(e)}\n`, "error");
      failed = true;
    }
  }
  return failed && out.length === 0 ? null : out;
}

const lines = (text: string) => {
  const l = text.split("\n");
  if (l[l.length - 1] === "") l.pop();
  return l;
};

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

/* ───────────────────────────── Commands ───────────────────────────── */

const ls: CommandSpec = {
  name: "ls",
  summary: "List directory contents",
  usage: "ls [-a] [-l] [path…]",
  async run(ctx) {
    const p = parsed(ctx, this, "al1");
    if (!p) return 2;
    const targets = p.operands.length ? p.operands : ["."];
    const all = p.flags.has("a");
    const long = p.flags.has("l");
    const tty = ctx.stdoutIsTTY && !p.flags.has("1");
    let status = 0;

    for (const [i, target] of targets.entries()) {
      let stat;
      try {
        stat = await ctx.fs.stat(abs(ctx, target));
      } catch (e) {
        ctx.stderr.write(`ls: cannot access '${target}': ${errText(e)}\n`, "error");
        status = 2;
        continue;
      }
      const entries = stat.type === "directory" ? (await ctx.fs.readdir(stat.path)).filter((e) => all || !e.name.startsWith(".")) : [stat];
      if (targets.length > 1 && stat.type === "directory") ctx.stdout.write(`${i > 0 ? "\n" : ""}${target}:\n`);

      if (long) {
        const width = Math.max(1, ...entries.map((e) => (e.type === "file" ? formatBytes(e.size).length : 1)));
        for (const e of entries) {
          const size = (e.type === "file" ? formatBytes(e.size) : "-").padStart(width);
          ctx.stdout.write(`${e.type === "directory" ? "d" : "-"}  ${size}  ${shortDate.format(e.modifiedAt)}  `, "muted");
          ctx.stdout.write(`${e.name}\n`, e.type === "directory" ? "dir" : "plain");
        }
      } else if (tty) {
        entries.forEach((e, j) => {
          ctx.stdout.write(e.type === "directory" ? `${e.name}/` : e.name, e.type === "directory" ? "dir" : "plain");
          ctx.stdout.write(j < entries.length - 1 ? "  " : "\n");
        });
      } else {
        for (const e of entries) ctx.stdout.write(`${e.name}\n`);
      }
    }
    return status;
  },
};

const cd: CommandSpec = {
  name: "cd",
  summary: "Change the working directory",
  usage: "cd [dir | -]",
  async run(ctx) {
    const arg = ctx.args[0];
    if (ctx.args.length > 1) return usageError(ctx, "cd", "too many arguments", this.usage);
    const target = arg === undefined ? HOME : arg === "-" ? (ctx.env.OLDPWD ?? ctx.cwd) : abs(ctx, arg);
    try {
      const s = await ctx.fs.stat(target);
      if (s.type !== "directory") {
        ctx.stderr.write(`cd: ${arg}: Not a directory\n`, "error");
        return 1;
      }
      ctx.env.OLDPWD = ctx.cwd;
      ctx.setCwd(s.path);
      if (arg === "-") ctx.stdout.write(`${s.path}\n`);
      return 0;
    } catch (e) {
      ctx.stderr.write(`cd: ${arg}: ${errText(e)}\n`, "error");
      return 1;
    }
  },
};

const pwd: CommandSpec = {
  name: "pwd",
  summary: "Print the working directory",
  usage: "pwd",
  async run(ctx) {
    ctx.stdout.write(`${ctx.cwd}\n`);
    return 0;
  },
};

const mkdir: CommandSpec = {
  name: "mkdir",
  summary: "Create directories",
  usage: "mkdir [-p] dir…",
  async run(ctx) {
    const p = parsed(ctx, this, "p");
    if (!p) return 2;
    if (!p.operands.length) return usageError(ctx, "mkdir", "missing operand", this.usage);
    let status = 0;
    for (const d of p.operands) {
      try {
        await ctx.fs.mkdir(abs(ctx, d), { recursive: p.flags.has("p") });
      } catch (e) {
        ctx.stderr.write(`mkdir: cannot create directory '${d}': ${errText(e)}\n`, "error");
        status = 1;
      }
    }
    return status;
  },
};

const rmdir: CommandSpec = {
  name: "rmdir",
  summary: "Remove empty directories",
  usage: "rmdir dir…",
  async run(ctx) {
    if (!ctx.args.length) return usageError(ctx, "rmdir", "missing operand", this.usage);
    let status = 0;
    for (const d of ctx.args) {
      try {
        const s = await ctx.fs.stat(abs(ctx, d));
        if (s.type !== "directory") throw new Error("Not a directory");
        await ctx.fs.remove(s.path);
      } catch (e) {
        ctx.stderr.write(`rmdir: failed to remove '${d}': ${errText(e)}\n`, "error");
        status = 1;
      }
    }
    return status;
  },
};

const touch: CommandSpec = {
  name: "touch",
  summary: "Create files or update their timestamps",
  usage: "touch file…",
  async run(ctx) {
    if (!ctx.args.length) return usageError(ctx, "touch", "missing file operand", this.usage);
    let status = 0;
    for (const f of ctx.args) {
      try {
        await ctx.fs.touch(abs(ctx, f));
      } catch (e) {
        ctx.stderr.write(`touch: cannot touch '${f}': ${errText(e)}\n`, "error");
        status = 1;
      }
    }
    return status;
  },
};

const cat: CommandSpec = {
  name: "cat",
  summary: "Print file contents",
  usage: "cat [file…]",
  async run(ctx) {
    const inputs = await readInputs(ctx, "cat", ctx.args);
    if (!inputs) return 1;
    for (const i of inputs) ctx.stdout.write(i.text);
    return inputs.length < ctx.args.length ? 1 : 0;
  },
};

const rm: CommandSpec = {
  name: "rm",
  summary: "Remove files or directories",
  usage: "rm [-r] [-f] path…",
  async run(ctx) {
    const p = parsed(ctx, this, "rRf");
    if (!p) return 2;
    const recursive = p.flags.has("r") || p.flags.has("R");
    const force = p.flags.has("f");
    if (!p.operands.length) return force ? 0 : usageError(ctx, "rm", "missing operand", this.usage);
    let status = 0;
    for (const target of p.operands) {
      try {
        const s = await ctx.fs.stat(abs(ctx, target));
        if (s.type === "directory" && !recursive) {
          ctx.stderr.write(`rm: cannot remove '${target}': Is a directory\n`, "error");
          status = 1;
          continue;
        }
        await ctx.fs.remove(s.path, { recursive });
      } catch (e) {
        if (force && isFsError(e, "ENOENT")) continue;
        ctx.stderr.write(`rm: cannot remove '${target}': ${errText(e)}\n`, "error");
        status = 1;
      }
    }
    return status;
  },
};

/** Shared by mv/cp: resolve "src… dest" where dest may be an existing directory. */
async function transfer(ctx: CommandContext, name: "mv" | "cp", operands: string[], op: (from: string, to: string) => Promise<unknown>, guard?: (src: string, isDir: boolean) => string | null): Promise<number> {
  if (operands.length < 2) return usageError(ctx, name, operands.length ? `missing destination file operand after '${operands[0]}'` : "missing file operand", `${name} source… dest`);
  const sources = operands.slice(0, -1);
  const destArg = operands[operands.length - 1]!;
  const dest = abs(ctx, destArg);
  const destIsDir = await ctx.fs.stat(dest).then((s) => s.type === "directory", () => false);
  if (sources.length > 1 && !destIsDir) {
    ctx.stderr.write(`${name}: target '${destArg}' is not a directory\n`, "error");
    return 1;
  }
  let status = 0;
  for (const src of sources) {
    try {
      const s = await ctx.fs.stat(abs(ctx, src));
      const problem = guard?.(src, s.type === "directory");
      if (problem) {
        ctx.stderr.write(`${name}: ${problem}\n`, "error");
        status = 1;
        continue;
      }
      await op(s.path, destIsDir ? join(dest, basename(s.path)) : dest);
    } catch (e) {
      ctx.stderr.write(`${name}: cannot ${name === "mv" ? "move" : "copy"} '${src}': ${errText(e)}\n`, "error");
      status = 1;
    }
  }
  return status;
}

const mv: CommandSpec = {
  name: "mv",
  summary: "Move or rename files",
  usage: "mv source… dest",
  async run(ctx) {
    return transfer(ctx, "mv", ctx.args, (a, b) => ctx.fs.rename(a, b));
  },
};

const cp: CommandSpec = {
  name: "cp",
  summary: "Copy files and directories",
  usage: "cp [-r] source… dest",
  async run(ctx) {
    const p = parsed(ctx, this, "rR");
    if (!p) return 2;
    const recursive = p.flags.has("r") || p.flags.has("R");
    return transfer(ctx, "cp", p.operands, (a, b) => ctx.fs.copy(a, b), (src, isDir) =>
      isDir && !recursive ? `-r not specified; omitting directory '${src}'` : null,
    );
  },
};

const echo: CommandSpec = {
  name: "echo",
  summary: "Print text",
  usage: "echo [-n] [text…]",
  async run(ctx) {
    const noNewline = ctx.args[0] === "-n";
    ctx.stdout.write(`${(noNewline ? ctx.args.slice(1) : ctx.args).join(" ")}${noNewline ? "" : "\n"}`);
    return 0;
  },
};

const clear: CommandSpec = {
  name: "clear",
  summary: "Clear the screen",
  usage: "clear",
  async run(ctx) {
    // Like a real terminal, clearing is a control sequence on stdout (here: form feed).
    ctx.stdout.write("\f");
    return 0;
  },
};

const help: CommandSpec = {
  name: "help",
  summary: "List commands, or show usage for one",
  usage: "help [command]",
  async run(ctx) {
    const name = ctx.args[0];
    if (name) {
      const spec = ctx.commands.get(name);
      if (!spec) {
        ctx.stderr.write(`help: no help topics match '${name}'\n`, "error");
        return 1;
      }
      ctx.stdout.write(`${spec.name} — ${spec.summary}\n`, "accent");
      ctx.stdout.write(`Usage: ${spec.usage}\n`);
      return 0;
    }
    ctx.stdout.write("Commands operate on the NEXUS virtual filesystem.\n\n", "muted");
    const specs = [...ctx.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
    const width = Math.max(...specs.map((s) => s.name.length)) + 2;
    for (const s of specs) {
      ctx.stdout.write(s.name.padEnd(width), "exec");
      ctx.stdout.write(`${s.summary}\n`);
    }
    ctx.stdout.write("\nPipes (|), redirection (> >> <), ; && || and wildcards (*) are supported.\n", "muted");
    return 0;
  },
};

const history: CommandSpec = {
  name: "history",
  summary: "Show command history",
  usage: "history",
  async run(ctx) {
    const pad = String(ctx.history.length).length;
    ctx.history.forEach((h, i) => ctx.stdout.write(`${String(i + 1).padStart(pad)}  ${h}\n`));
    return 0;
  },
};

const tree: CommandSpec = {
  name: "tree",
  summary: "Show a directory as a tree",
  usage: "tree [-a] [dir]",
  async run(ctx) {
    const p = parsed(ctx, this, "a");
    if (!p) return 2;
    const target = p.operands[0] ?? ".";
    const all = p.flags.has("a");
    let dirs = 0;
    let files = 0;
    try {
      const root = await ctx.fs.stat(abs(ctx, target));
      ctx.stdout.write(`${target}\n`, "dir");
      const walk = async (path: string, prefix: string): Promise<void> => {
        const entries = (await ctx.fs.readdir(path)).filter((e) => all || !e.name.startsWith("."));
        for (const [i, e] of entries.entries()) {
          const last = i === entries.length - 1;
          ctx.stdout.write(`${prefix}${last ? "└── " : "├── "}`, "muted");
          ctx.stdout.write(`${e.name}\n`, e.type === "directory" ? "dir" : "plain");
          if (e.type === "directory") {
            dirs++;
            await walk(e.path, `${prefix}${last ? "    " : "│   "}`);
          } else files++;
        }
      };
      if (root.type === "directory") await walk(root.path, "");
      ctx.stdout.write(`\n${dirs} ${dirs === 1 ? "directory" : "directories"}, ${files} ${files === 1 ? "file" : "files"}\n`, "muted");
      return 0;
    } catch (e) {
      ctx.stderr.write(`tree: ${target}: ${errText(e)}\n`, "error");
      return 1;
    }
  },
};

const find: CommandSpec = {
  name: "find",
  summary: "Find files by name or type",
  usage: "find [path] [-name pattern] [-type f|d]",
  async run(ctx) {
    const args = [...ctx.args];
    const start = args[0] && !args[0].startsWith("-") ? args.shift()! : ".";
    let name: RegExp | null = null;
    let type: "file" | "directory" | null = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      const v = args[i + 1];
      if (a === "-name" && v !== undefined) {
        name = globToRegExp(v);
        i++;
      } else if (a === "-type" && (v === "f" || v === "d")) {
        type = v === "f" ? "file" : "directory";
        i++;
      } else return usageError(ctx, "find", `unknown predicate '${a}'`, this.usage);
    }
    try {
      const root = await ctx.fs.stat(abs(ctx, start));
      const prefix = start.replace(/\/+$/, "") || "/";
      const all = [root, ...(root.type === "directory" ? await ctx.fs.walk(root.path) : [])];
      for (const e of all) {
        if (type && e.type !== type) continue;
        if (name && !name.test(e.name)) continue;
        const rel = e.path.slice(root.path.length).replace(/^\//, "");
        ctx.stdout.write(`${rel ? (prefix === "/" ? `/${rel}` : `${prefix}/${rel}`) : prefix}\n`);
      }
      return 0;
    } catch (e) {
      ctx.stderr.write(`find: '${start}': ${errText(e)}\n`, "error");
      return 1;
    }
  },
};

const grep: CommandSpec = {
  name: "grep",
  summary: "Search text for a pattern",
  usage: "grep [-i] [-n] [-v] [-c] pattern [file…]",
  async run(ctx) {
    const p = parsed(ctx, this, "invc");
    if (!p) return 2;
    const [pattern, ...files] = p.operands;
    if (pattern === undefined) return usageError(ctx, "grep", "missing pattern", this.usage);
    let re: RegExp;
    try {
      re = new RegExp(pattern, p.flags.has("i") ? "i" : "");
    } catch {
      ctx.stderr.write(`grep: invalid pattern '${pattern}'\n`, "error");
      return 2;
    }
    const inputs = await readInputs(ctx, "grep", files);
    if (!inputs) return 2;
    let matched = 0;
    for (const input of inputs) {
      let count = 0;
      lines(input.text).forEach((line, i) => {
        if (re.test(line) === p.flags.has("v")) return;
        count++;
        if (p.flags.has("c")) return;
        if (inputs.length > 1 && input.label) ctx.stdout.write(`${input.label}:`, "accent");
        if (p.flags.has("n")) ctx.stdout.write(`${i + 1}:`, "muted");
        ctx.stdout.write(`${line}\n`);
      });
      if (p.flags.has("c")) ctx.stdout.write(`${inputs.length > 1 && input.label ? `${input.label}:` : ""}${count}\n`);
      matched += count;
    }
    return matched > 0 ? 0 : 1;
  },
};

const wc: CommandSpec = {
  name: "wc",
  summary: "Count lines, words and bytes",
  usage: "wc [-l] [-w] [-c] [file…]",
  async run(ctx) {
    const p = parsed(ctx, this, "lwc");
    if (!p) return 2;
    const inputs = await readInputs(ctx, "wc", p.operands);
    if (!inputs) return 1;
    const show = p.flags.size ? p.flags : new Set(["l", "w", "c"]);
    const totals = [0, 0, 0];
    const row = (counts: number[], label: string | null) => {
      const cols = (["l", "w", "c"] as const).flatMap((f, i) => (show.has(f) ? [String(counts[i]).padStart(7)] : []));
      ctx.stdout.write(`${cols.join(" ")}${label ? ` ${label}` : ""}\n`);
    };
    for (const i of inputs) {
      const counts = [lines(i.text).length, i.text.split(/\s+/).filter(Boolean).length, new TextEncoder().encode(i.text).byteLength];
      counts.forEach((c, k) => (totals[k]! += c));
      row(counts, i.label);
    }
    if (inputs.length > 1) row(totals, "total");
    return 0;
  },
};

function headTail(which: "head" | "tail"): CommandSpec {
  return {
    name: which,
    summary: which === "head" ? "Print the first lines of input" : "Print the last lines of input",
    usage: `${which} [-n count] [file…]`,
    async run(ctx) {
      const p = parsed(ctx, this, "", "n", true);
      if (!p) return 2;
      const n = Number(p.values.get("n") ?? 10);
      if (!Number.isInteger(n) || n < 0) return usageError(ctx, which, `invalid number of lines: '${p.values.get("n")}'`, this.usage);
      const inputs = await readInputs(ctx, which, p.operands);
      if (!inputs) return 1;
      inputs.forEach((input, i) => {
        if (inputs.length > 1) ctx.stdout.write(`${i ? "\n" : ""}==> ${input.label} <==\n`, "muted");
        const l = lines(input.text);
        const slice = which === "head" ? l.slice(0, n) : l.slice(Math.max(0, l.length - n));
        if (slice.length) ctx.stdout.write(`${slice.join("\n")}\n`);
      });
      return 0;
    },
  };
}

const open: CommandSpec = {
  name: "open",
  summary: "Open a file or folder in its application",
  usage: "open path [-a app-id]",
  async run(ctx) {
    const p = parsed(ctx, this, "", "a");
    if (!p) return 2;
    const target = p.operands[0];
    if (!target) return usageError(ctx, "open", "missing path", this.usage);
    const r = await ctx.host.openPath(abs(ctx, target), p.values.get("a"));
    if (!r.ok) {
      ctx.stderr.write(`open: ${r.error}\n`, "error");
      return 1;
    }
    return 0;
  },
};

const stat: CommandSpec = {
  name: "stat",
  summary: "Show file details",
  usage: "stat path…",
  async run(ctx) {
    if (!ctx.args.length) return usageError(ctx, "stat", "missing operand", this.usage);
    let status = 0;
    for (const target of ctx.args) {
      try {
        const s = await ctx.fs.stat(abs(ctx, target));
        const rows: [string, string][] = [
          ["File", s.path],
          ["Kind", kindLabel(s.name, s.type)],
          ["Size", s.type === "file" ? `${s.size} bytes (${formatBytes(s.size)})` : "—"],
          ["Modified", new Date(s.modifiedAt).toLocaleString()],
          ["Created", new Date(s.createdAt).toLocaleString()],
          ["Id", s.id],
        ];
        for (const [k, v] of rows) {
          ctx.stdout.write(`${k.padEnd(9)}`, "muted");
          ctx.stdout.write(`${v}\n`);
        }
      } catch (e) {
        ctx.stderr.write(`stat: cannot stat '${target}': ${errText(e)}\n`, "error");
        status = 1;
      }
    }
    return status;
  },
};

const simple = (name: string, summary: string, output: (ctx: CommandContext) => string): CommandSpec => ({
  name,
  summary,
  usage: name,
  async run(ctx) {
    ctx.stdout.write(`${output(ctx)}\n`);
    return 0;
  },
});

const env: CommandSpec = {
  name: "env",
  summary: "Print environment variables",
  usage: "env",
  async run(ctx) {
    for (const [k, v] of Object.entries(ctx.env).sort()) ctx.stdout.write(`${k}=${v}\n`);
    return 0;
  },
};

const exportCmd: CommandSpec = {
  name: "export",
  summary: "Set an environment variable",
  usage: "export NAME=value…",
  async run(ctx) {
    for (const a of ctx.args) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(a);
      if (!m) return usageError(ctx, "export", `not a valid identifier: '${a}'`, this.usage);
      if (m[1] === "PWD" || m[1] === "HOME") {
        ctx.stderr.write(`export: ${m[1]}: read-only variable\n`, "error");
        return 1;
      }
      ctx.env[m[1]!] = m[2]!;
    }
    return 0;
  },
};

const exit: CommandSpec = {
  name: "exit",
  summary: "Close this terminal",
  usage: "exit",
  async run(ctx) {
    ctx.host.close();
    return 0;
  },
};

export const BUILTIN_COMMANDS: readonly CommandSpec[] = [
  ls,
  cd,
  pwd,
  mkdir,
  rmdir,
  touch,
  cat,
  rm,
  mv,
  cp,
  echo,
  clear,
  help,
  history,
  tree,
  find,
  grep,
  wc,
  headTail("head"),
  headTail("tail"),
  open,
  stat,
  env,
  exportCmd,
  exit,
  simple("whoami", "Print the current user", (ctx) => ctx.env.USER ?? "user"),
  simple("date", "Print the date and time", () => new Date().toString()),
  simple("uname", "Print system information", () => `${SYSTEM_NAME} ${SYSTEM_VERSION} (browser)`),
];

