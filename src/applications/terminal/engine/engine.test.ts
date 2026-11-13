import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createMemoryDatabase } from "@/system/testing/memory-db";
import { VirtualFileSystem } from "@/system/fs/vfs";
import { parse, ParseError, wordText } from "./parser";
import { Shell } from "./shell";
import { complete } from "./completion";
import type { TerminalHost, Writer } from "./types";

describe("parser", () => {
  const words = (line: string) => parse(line).map((p) => p.commands.map((c) => c.words.map(wordText)));

  it("splits words, respecting quotes and escapes", () => {
    expect(words(`echo "hello world" 'a b' c\\ d`)).toEqual([[["echo", "hello world", "a b", "c d"]]]);
    expect(words(`echo "say \\"hi\\""`)).toEqual([[["echo", 'say "hi"']]]);
  });

  it("parses pipelines, connectors and redirects", () => {
    const p = parse("cat a | grep x > out.txt && echo ok; ls");
    expect(p.map((x) => x.connector)).toEqual([undefined, "&&", ";"]);
    expect(p[0]!.commands).toHaveLength(2);
    expect(p[0]!.commands[1]!.redirects.map((r) => [r.op, wordText(r.target)])).toEqual([[">", "out.txt"]]);
  });

  it("ignores comments and trailing semicolons", () => {
    expect(words("ls; # list")).toEqual([[["ls"]]]);
  });

  it.each(["echo 'oops", 'echo "oops', "| ls", "ls |", "ls >", "ls &&", "sleep 1 &"])("rejects %j", (line) => {
    expect(() => parse(line)).toThrow(ParseError);
  });
});

/* ─────────────────────────────── Shell ─────────────────────────────── */

let fs: VirtualFileSystem;
let shell: Shell;
let host: { close: Mock<TerminalHost["close"]>; openPath: Mock<TerminalHost["openPath"]> };

async function run(line: string) {
  let out = "";
  let err = "";
  const stdout: Writer = { write: (t) => (out += t) };
  const stderr: Writer = { write: (t) => (err += t) };
  const status = await shell.run(line, stdout, stderr);
  return { status, out, err };
}

beforeEach(async () => {
  fs = new VirtualFileSystem(createMemoryDatabase());
  await fs.init();
  await fs.mkdir("/home/user", { recursive: true });
  host = { close: vi.fn(), openPath: vi.fn(async () => ({ ok: true as const })) };
  shell = new Shell(fs, host, { cwd: "/home/user" });
});

describe("shell: filesystem commands", () => {
  it("mkdir -p, cd, pwd and relative paths", async () => {
    expect((await run("mkdir -p a/b/c && cd a/b && pwd")).out).toBe("/home/user/a/b\n");
    expect((await run("cd ../.. && pwd")).out).toBe("/home/user\n");
    expect((await run("cd - ")).out).toBe("/home/user/a/b\n");
    expect((await run("cd ~ && pwd")).out).toBe("/home/user\n");
  });

  it("touch, echo with redirection, cat and append", async () => {
    await run("echo hello > note.txt");
    await run("echo world >> note.txt");
    expect((await run("cat note.txt")).out).toBe("hello\nworld\n");
    await run("touch empty.txt");
    expect(await fs.readText("/home/user/empty.txt")).toBe("");
  });

  it("ls marks directories, hides dotfiles unless -a, and prints one per line when piped", async () => {
    await run("mkdir docs && touch b.txt .secret");
    expect((await run("ls")).out).toBe("docs/  b.txt\n");
    expect((await run("ls -a")).out).toContain(".secret");
    expect((await run("ls | cat")).out).toBe("docs\nb.txt\n");
  });

  it("rm refuses directories without -r and -f ignores missing files", async () => {
    await run("mkdir -p d/e && touch d/e/f");
    const r = await run("rm d");
    expect(r.status).toBe(1);
    expect(r.err).toBe("rm: cannot remove 'd': Is a directory\n");
    expect((await run("rm -r d")).status).toBe(0);
    expect((await run("rm -f nope")).status).toBe(0);
    expect((await run("rm nope")).err).toContain("No such file or directory");
  });

  it("mv renames and moves into directories; cp needs -r for folders", async () => {
    await run("touch a.txt && mkdir dir && mv a.txt b.txt && mv b.txt dir");
    expect(await fs.exists("/home/user/dir/b.txt")).toBe(true);
    expect((await run("cp dir dir2")).err).toContain("-r not specified");
    await run("cp -r dir dir2");
    expect(await fs.exists("/home/user/dir2/b.txt")).toBe(true);
  });

  it("expands globs in the cwd and in subdirectories", async () => {
    await run("mkdir p && touch p/x.md p/y.md p/z.ts");
    expect((await run("echo p/*.md")).out).toBe("p/x.md p/y.md\n");
    await run("cd p && rm *.md");
    expect((await run("ls")).out).toBe("z.ts\n");
    expect((await run("echo *.none")).out).toBe("*.none\n");
  });
});

describe("shell: text processing", () => {
  beforeEach(async () => {
    await fs.writeFile("/home/user/log.txt", "info start\nERROR disk\ninfo ok\nerror net\n");
  });

  it("grep with flags, files and stdin", async () => {
    expect((await run("grep -i error log.txt")).out).toBe("ERROR disk\nerror net\n");
    expect((await run("grep -n -v info log.txt")).out).toBe("2:ERROR disk\n4:error net\n");
    expect((await run("cat log.txt | grep -c info")).out).toBe("2\n");
    expect((await run("grep missing log.txt")).status).toBe(1);
    expect((await run("grep '(' log.txt")).status).toBe(2);
  });

  it("wc, head and tail", async () => {
    expect((await run("wc -l log.txt")).out.trim()).toBe("4 log.txt");
    expect((await run("head -n 1 log.txt")).out).toBe("info start\n");
    expect((await run("tail -2 log.txt")).out).toBe("info ok\nerror net\n");
    expect((await run("cat log.txt | head -n 2 | tail -n 1")).out).toBe("ERROR disk\n");
  });

  it("input redirection", async () => {
    expect((await run("grep disk < log.txt")).out).toBe("ERROR disk\n");
  });

  it("find by name and type", async () => {
    await run("mkdir -p src/lib && touch src/a.ts src/lib/b.ts src/readme.md");
    // Same order as the filesystem walk (folders first); real find is unsorted too.
    expect((await run("find src -name '*.ts'")).out).toBe("src/lib/b.ts\nsrc/a.ts\n");
    expect((await run("find src -type d")).out).toBe("src\nsrc/lib\n");
  });
});

describe("shell: control flow, variables and errors", () => {
  it("&& and || depend on the previous status; $? exposes it", async () => {
    expect((await run("cat nope || echo fallback")).out).toBe("fallback\n");
    expect((await run("cat nope && echo never")).out).toBe("");
    expect((await run("cat nope; echo $?")).out).toBe("1\n");
  });

  it("expands variables except in single quotes, and supports export", async () => {
    expect((await run("echo $HOME '$HOME' \"${USER}!\"")).out).toBe("/home/user $HOME user!\n");
    await run("export GREETING=hi");
    expect((await run("echo $GREETING $UNSET end")).out).toBe("hi end\n");
  });

  it("reports unknown commands and syntax errors", async () => {
    expect(await run("frobnicate")).toMatchObject({ status: 127, err: "nsh: command not found: frobnicate\n" });
    expect((await run("echo 'x")).err).toBe("nsh: unterminated single quote\n");
  });

  it("clear emits a form feed; exit and open go to the host", async () => {
    expect((await run("clear")).out).toBe("\f");
    await fs.writeFile("/home/user/n.md", "");
    await run("open n.md");
    expect(host.openPath).toHaveBeenCalledWith("/home/user/n.md", undefined);
    await run("exit");
    expect(host.close).toHaveBeenCalled();
  });

  it("keeps history without blanks or immediate duplicates", () => {
    shell.remember("ls");
    shell.remember("ls");
    shell.remember("  ");
    shell.remember("pwd");
    expect(shell.history).toEqual(["ls", "pwd"]);
  });

  it("never touches anything outside the virtual filesystem", async () => {
    expect((await run("cat /etc/passwd")).err).toContain("No such file or directory");
  });
});

describe("completion", () => {
  beforeEach(async () => {
    await fs.mkdir("/home/user/Documents");
    await fs.mkdir("/home/user/Downloads");
    await fs.writeFile("/home/user/notes.md", "");
  });
  const ctx = () => ({ fs, cwd: "/home/user", commands: [...shell.commands.keys()] });

  it("completes unique commands with a trailing space", async () => {
    expect((await complete("hist", 4, ctx())).line).toBe("history ");
  });

  it("completes paths, extending to the common prefix and listing candidates", async () => {
    const r = await complete("cd Do", 5, ctx());
    expect(r.line).toBe("cd Do");
    expect(r.candidates).toEqual(["Documents/", "Downloads/"]);
    expect((await complete("cd Doc", 6, ctx())).line).toBe("cd Documents/");
    expect((await complete("cat no", 6, ctx())).line).toBe("cat notes.md ");
  });
});
