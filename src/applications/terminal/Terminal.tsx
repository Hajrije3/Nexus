"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppComponentProps } from "@/system/runtime/types";
import { useWindow } from "@/system/sdk/window";
import { useFileSystem } from "@/system/sdk/fs";
import { openPath } from "@/system/sdk/launch";
import { HOME, normalize } from "@/system/fs/path";
import { cn } from "@/lib/utils";
import { Shell, promptPath } from "./engine/shell";
import { complete } from "./engine/completion";
import type { OutputStyle } from "./engine/types";

const HISTORY_FILE = `${HOME}/.nsh_history`;
const MAX_SCROLLBACK = 2000;

interface Segment {
  text: string;
  style: OutputStyle;
}
type Line = { id: number; kind: "output"; segments: Segment[] } | { id: number; kind: "prompt"; cwd: string; command: string };

const STYLE: Record<OutputStyle, string> = {
  plain: "",
  error: "text-danger",
  muted: "text-subtle",
  dir: "text-sky-500 dark:text-sky-400 font-medium",
  exec: "text-emerald-600 dark:text-emerald-400",
  accent: "text-accent",
  success: "text-emerald-600 dark:text-emerald-400",
};

interface RunState {
  out: Line[];
  open: { value: boolean };
  cleared: boolean;
}

let nextId = 0;

/**
 * Append streamed text (which may contain newlines) to a run's output.
 * A form feed (`\f`, written by `clear`) discards everything before it and
 * clears the screen, as in a real terminal.
 */
function appendText(run: RunState, text: string, style: OutputStyle): void {
  const ff = text.lastIndexOf("\f");
  if (ff !== -1) {
    run.out.length = 0;
    run.open.value = false;
    run.cleared = true;
    text = text.slice(ff + 1);
    if (!text) return;
  }
  const parts = text.split("\n");
  parts.forEach((part, i) => {
    if (i > 0) run.open.value = false;
    if (part === "" && i > 0 && i === parts.length - 1) return;
    const last = run.out[run.out.length - 1];
    if (run.open.value && last?.kind === "output") {
      last.segments.push({ text: part, style });
    } else {
      run.out.push({ id: nextId++, kind: "output", segments: [{ text: part, style }] });
    }
    run.open.value = true;
  });
  if (text.endsWith("\n")) run.open.value = false;
}

export default function Terminal({ args }: AppComponentProps) {
  const fs = useFileSystem();
  const { setTitle, close } = useWindow();
  const [lines, setLines] = useState<Line[]>(() => [
    {
      id: nextId++,
      kind: "output",
      segments: [
        { text: "NEXUS shell (nsh). Type ", style: "muted" },
        { text: "help", style: "exec" },
        { text: " to see available commands.", style: "muted" },
      ],
    },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [cwd, setCwd] = useState(() => (typeof args.cwd === "string" ? normalize(args.cwd) : HOME));
  const historyIndex = useRef<number | null>(null);
  const draft = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [shell] = useState(
    () =>
      new Shell(
        fs,
        {
          close,
          openPath: async (path, appId) => {
            const r = await openPath(path, appId);
            return r.ok ? { ok: true } : { ok: false, error: r.error };
          },
        },
        { cwd },
      ),
  );

  // Load persistent history; fall back to home if the start directory is gone.
  useEffect(() => {
    fs.readText(HISTORY_FILE).then(
      (text) => shell.history.unshift(...text.split("\n").filter(Boolean)),
      () => undefined,
    );
    fs.stat(shell.cwd).catch(() => {
      shell.cwd = HOME;
      setCwd(HOME);
    });
  }, [fs, shell]);

  useEffect(() => setTitle(`Terminal — ${promptPath(cwd)}`), [cwd, setTitle]);

  // Stick to the bottom as output arrives.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, running]);

  const execute = async (command: string) => {
    const promptLine: Line = { id: nextId++, kind: "prompt", cwd: shell.cwd, command };
    const run: RunState = { out: [], open: { value: false }, cleared: false };
    setInput("");
    historyIndex.current = null;

    if (command.trim()) {
      setLines((l) => [...l, promptLine]);
      setRunning(true);
      shell.remember(command);
      try {
        await shell.run(
          command,
          { write: (t, s = "plain") => appendText(run, t, s) },
          { write: (t, s = "error") => appendText(run, t, s) },
        );
      } finally {
        setRunning(false);
      }
      setCwd(shell.cwd);
      fs.writeFile(HISTORY_FILE, `${shell.history.join("\n")}\n`).catch((e: unknown) => console.warn("[terminal] history not saved", e));
      setLines((l) => {
        // `clear` empties the screen, including this prompt; later output in the same line still shows.
        const next = run.cleared ? run.out : [...l, ...run.out];
        return next.length > MAX_SCROLLBACK ? next.slice(next.length - MAX_SCROLLBACK) : next;
      });
    } else {
      setLines((l) => [...l, promptLine]);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const recall = (direction: -1 | 1) => {
    const h = shell.history;
    if (!h.length) return;
    if (historyIndex.current === null) {
      if (direction === 1) return;
      draft.current = input;
      historyIndex.current = h.length - 1;
    } else {
      historyIndex.current += direction;
    }
    if (historyIndex.current >= h.length) {
      historyIndex.current = null;
      setInput(draft.current);
      return;
    }
    historyIndex.current = Math.max(0, historyIndex.current);
    setInput(h[historyIndex.current]!);
  };

  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "Enter") {
      e.preventDefault();
      await execute(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      recall(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      recall(1);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const r = await complete(input, el.selectionStart ?? input.length, { fs, cwd: shell.cwd, commands: [...shell.commands.keys()] });
      if (r.candidates.length) {
        setLines((l) => [
          ...l,
          { id: nextId++, kind: "prompt", cwd: shell.cwd, command: input },
          { id: nextId++, kind: "output", segments: [{ text: r.candidates.join("  "), style: "muted" }] },
        ]);
      }
      setInput(r.line);
      requestAnimationFrame(() => el.setSelectionRange(r.cursor, r.cursor));
    } else if (ctrl && e.key.toLowerCase() === "l") {
      e.preventDefault();
      setLines([]);
    } else if (ctrl && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
      e.preventDefault();
      setLines((l) => [...l, { id: nextId++, kind: "prompt", cwd: shell.cwd, command: `${input}^C` }]);
      setInput("");
      historyIndex.current = null;
    } else if (ctrl && e.key.toLowerCase() === "u") {
      e.preventDefault();
      setInput("");
    }
  };

  return (
    <div
      className="nx-scroll h-full overflow-y-auto bg-surface-sunken px-3 py-2 font-mono text-[12.5px] leading-[1.6] text-fg"
      ref={scrollRef}
      onMouseUp={() => {
        // Focus the prompt on click, but don't steal a text selection.
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
      role="log"
      aria-label="Terminal output"
      aria-live="polite"
      data-selectable
    >
      {lines.map((line) =>
        line.kind === "prompt" ? (
          <div key={line.id} className="whitespace-pre-wrap break-all">
            <Prompt cwd={line.cwd} />
            {line.command}
          </div>
        ) : (
          <div key={line.id} className="min-h-[1.6em] whitespace-pre-wrap break-all">
            {line.segments.map((s, i) => (
              <span key={i} className={cn(STYLE[s.style])}>
                {s.text}
              </span>
            ))}
          </div>
        ),
      )}
      <div className={cn("flex items-center", running && "invisible")}>
        <Prompt cwd={cwd} />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => void onKeyDown(e)}
          disabled={running}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="Command"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg caret-accent outline-none"
        />
      </div>
    </div>
  );
}

function Prompt({ cwd }: { cwd: string }) {
  return (
    <span className="select-none whitespace-nowrap">
      <span className="text-emerald-600 dark:text-emerald-400">user@nexus</span>
      <span className="text-subtle">:</span>
      <span className="text-sky-600 dark:text-sky-400">{promptPath(cwd)}</span>
      <span className="text-subtle">$ </span>
    </span>
  );
}
