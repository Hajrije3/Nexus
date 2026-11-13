/**
 * Shell command-line parser.
 *
 *   list      := pipeline ( (";" | "&&" | "||") pipeline )*
 *   pipeline  := command ( "|" command )*
 *   command   := word+ redirect*        (redirects may appear anywhere)
 *   redirect  := (">" | ">>" | "<") word
 *
 * Words keep track of which characters were quoted so expansion (variables,
 * `~`, globs) only applies to unquoted text, exactly as in POSIX shells.
 */

/** One character of a word, remembering whether it was quoted. */
interface Char {
  c: string;
  quoted: boolean;
  /** `$` that starts a variable reference (unquoted or in double quotes). */
  variable?: boolean;
}

export type Word = readonly Char[];

export interface Redirect {
  op: ">" | ">>" | "<";
  target: Word;
}

export interface SimpleCommand {
  words: Word[];
  redirects: Redirect[];
}

export type Connector = ";" | "&&" | "||";

export interface Pipeline {
  commands: SimpleCommand[];
  /** How this pipeline connects to the previous one (absent for the first). */
  connector?: Connector;
}

export class ParseError extends Error {
  override name = "ParseError";
}

type Token = { kind: "word"; word: Word } | { kind: "op"; op: "|" | ";" | "&&" | "||" | ">" | ">>" | "<" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let word: Char[] | null = null;
  const push = (ch: Char) => (word ??= []).push(ch);
  const endWord = () => {
    if (word) tokens.push({ kind: "word", word });
    word = null;
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;

    if (c === " " || c === "\t" || c === "\n") {
      endWord();
    } else if (c === "'") {
      const end = input.indexOf("'", i + 1);
      if (end === -1) throw new ParseError("unterminated single quote");
      word ??= [];
      for (const q of input.slice(i + 1, end)) push({ c: q, quoted: true });
      i = end;
    } else if (c === '"') {
      word ??= [];
      let j = i + 1;
      for (; j < input.length && input[j] !== '"'; j++) {
        if (input[j] === "\\" && j + 1 < input.length && '"\\$`'.includes(input[j + 1]!)) {
          push({ c: input[++j]!, quoted: true });
        } else {
          push({ c: input[j]!, quoted: true, variable: input[j] === "$" });
        }
      }
      if (j >= input.length) throw new ParseError("unterminated double quote");
      i = j;
    } else if (c === "\\") {
      if (i + 1 < input.length) push({ c: input[++i]!, quoted: true });
    } else if (c === "|" || c === "&" || c === ";" || c === ">" || c === "<") {
      endWord();
      const two = input.slice(i, i + 2);
      if (two === "&&" || two === "||" || two === ">>") {
        tokens.push({ kind: "op", op: two });
        i++;
      } else if (c === "&") {
        throw new ParseError("background jobs (&) are not supported");
      } else {
        tokens.push({ kind: "op", op: c as "|" | ";" | ">" | "<" });
      }
    } else if (c === "#" && word === null) {
      break; // comment
    } else {
      push({ c, quoted: false, variable: c === "$" });
    }
  }
  endWord();
  return tokens;
}

export function parse(input: string): Pipeline[] {
  const tokens = tokenize(input);
  const pipelines: Pipeline[] = [];
  let pipeline: Pipeline = { commands: [] };
  let command: SimpleCommand = { words: [], redirects: [] };

  const finishCommand = (beforeOp: string) => {
    if (command.words.length === 0) {
      if (command.redirects.length) throw new ParseError("missing command before redirection");
      throw new ParseError(`syntax error near unexpected token \`${beforeOp}'`);
    }
    pipeline.commands.push(command);
    command = { words: [], redirects: [] };
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === "word") {
      command.words.push(t.word);
      continue;
    }
    switch (t.op) {
      case ">":
      case ">>":
      case "<": {
        const target = tokens[i + 1];
        if (!target || target.kind !== "word") throw new ParseError(`syntax error: expected a file after \`${t.op}'`);
        command.redirects.push({ op: t.op, target: target.word });
        i++;
        break;
      }
      case "|":
        finishCommand("|");
        break;
      case ";":
      case "&&":
      case "||": {
        // A trailing ";" is allowed ("ls;"), an empty segment otherwise is not.
        if (t.op === ";" && command.words.length === 0 && pipeline.commands.length === 0) {
          if (pipelines.length === 0 && i === 0) throw new ParseError("syntax error near unexpected token `;'");
          continue;
        }
        finishCommand(t.op);
        pipelines.push(pipeline);
        pipeline = { commands: [], connector: t.op };
        break;
      }
    }
  }

  const last = tokens[tokens.length - 1];
  if (last?.kind === "op" && last.op === "|") throw new ParseError("syntax error: unexpected end of line after `|'");
  if (command.words.length || command.redirects.length) finishCommand("newline");
  if (pipeline.commands.length) pipelines.push(pipeline);
  else if (pipeline.connector && pipeline.connector !== ";") throw new ParseError("syntax error: unexpected end of line");
  return pipelines;
}

/** Plain text of a word (no expansion). */
export function wordText(word: Word): string {
  return word.map((ch) => ch.c).join("");
}

/** Variable expansion: $NAME, ${NAME}, $?. Returns the expanded chars. */
export function expandVariables(word: Word, env: Readonly<Record<string, string>>): Char[] {
  const out: Char[] = [];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i]!;
    if (!ch.variable) {
      out.push(ch);
      continue;
    }
    let name = "";
    let j = i + 1;
    if (word[j]?.c === "{") {
      for (j++; j < word.length && word[j]!.c !== "}"; j++) name += word[j]!.c;
      if (j >= word.length) {
        out.push(ch);
        continue;
      }
    } else if (word[j]?.c === "?") {
      name = "?";
    } else {
      for (; j < word.length && /[A-Za-z0-9_]/.test(word[j]!.c); j++) name += word[j]!.c;
      j--;
    }
    if (!name) {
      out.push({ ...ch, variable: false });
      continue;
    }
    for (const c of env[name] ?? "") out.push({ c, quoted: ch.quoted });
    i = j;
  }
  return out;
}

/** True if the chars contain an unquoted glob character. */
export function hasGlob(chars: readonly Char[]): boolean {
  return chars.some((ch) => !ch.quoted && (ch.c === "*" || ch.c === "?"));
}

/** Compile a single path segment glob ("*.md") into a RegExp. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
