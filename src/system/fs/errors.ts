/** POSIX-flavoured error codes, so the terminal can print familiar messages. */
export type FsErrorCode =
  | "ENOENT" // no such file or directory
  | "EEXIST" // already exists
  | "ENOTDIR" // a path component is not a directory
  | "EISDIR" // is a directory (file operation on a directory)
  | "ENOTEMPTY" // directory not empty
  | "EINVAL" // invalid argument (bad name, move into self, …)
  | "EPERM"; // operation not permitted (protected system path)

const DESCRIPTIONS: Record<FsErrorCode, string> = {
  ENOENT: "No such file or directory",
  EEXIST: "File exists",
  ENOTDIR: "Not a directory",
  EISDIR: "Is a directory",
  ENOTEMPTY: "Directory not empty",
  EINVAL: "Invalid argument",
  EPERM: "Operation not permitted",
};

export class FsError extends Error {
  override name = "FsError";
  constructor(
    readonly code: FsErrorCode,
    message?: string,
    readonly path?: string,
  ) {
    super(message ?? (path ? `${DESCRIPTIONS[code]}: ${path}` : DESCRIPTIONS[code]));
  }

  /** Short, terminal-friendly description, e.g. "No such file or directory". */
  get description(): string {
    return DESCRIPTIONS[this.code];
  }
}

export function isFsError(error: unknown, code?: FsErrorCode): error is FsError {
  return error instanceof FsError && (code === undefined || error.code === code);
}
