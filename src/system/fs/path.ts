/**
 * POSIX-style path utilities for the virtual filesystem. Pure functions.
 * All paths returned are absolute and normalised: no trailing slash (except
 * `/`), no `.` / `..` segments, no repeated slashes.
 */
import { FsError } from "./errors";

export const ROOT = "/";
export const HOME = "/home/user";
const MAX_NAME_LENGTH = 255;

export function segments(path: string): string[] {
  return path.split("/").filter((s) => s !== "" && s !== ".");
}

/** Normalise an absolute path. `..` above the root stays at the root. */
export function normalize(path: string): string {
  if (!path.startsWith("/")) throw new FsError("EINVAL", `Path must be absolute: "${path}"`, path);
  const out: string[] = [];
  for (const seg of segments(path)) {
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return `/${out.join("/")}`;
}

/**
 * Resolve `path` against a working directory, shell-style:
 * absolute paths win, `~` expands to the home directory.
 */
export function resolve(cwd: string, path: string): string {
  if (path === "~" || path.startsWith("~/")) return normalize(HOME + path.slice(1));
  if (path.startsWith("/")) return normalize(path);
  return normalize(`${cwd}/${path}`);
}

export function join(...parts: string[]): string {
  return normalize(`/${parts.join("/")}`);
}

export function dirname(path: string): string {
  const segs = segments(normalize(path));
  segs.pop();
  return `/${segs.join("/")}`;
}

export function basename(path: string): string {
  const segs = segments(normalize(path));
  return segs[segs.length - 1] ?? "";
}

/**
 * Extension including the dot, lower-cased (`.md`). Dotfiles have none.
 * Accepts a path or a bare file name.
 */
export function extname(pathOrName: string): string {
  const name = pathOrName.slice(pathOrName.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** True if `child` is strictly inside `ancestor`. */
export function isDescendant(ancestor: string, child: string): boolean {
  const a = normalize(ancestor);
  const c = normalize(child);
  if (a === c) return false;
  return a === ROOT ? true : c.startsWith(`${a}/`);
}

/** Display form: home directory collapsed to `~`. */
export function displayPath(path: string): string {
  if (path === HOME) return "~";
  return path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path;
}

export function validateName(name: string): void {
  if (name === "" || name === "." || name === "..") {
    throw new FsError("EINVAL", `Invalid name "${name}"`);
  }
  if (name.includes("/") || name.includes("\0")) {
    throw new FsError("EINVAL", `Name may not contain "/" or NUL: "${name}"`);
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new FsError("EINVAL", `Name exceeds ${MAX_NAME_LENGTH} characters`);
  }
}
