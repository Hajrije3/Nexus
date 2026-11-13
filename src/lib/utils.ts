import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

let counter = 0;

/** Short, collision-resistant id with a readable prefix, e.g. `win_lx3k9a_4`. */
export function createId<P extends string>(prefix: P): `${P}_${string}` {
  counter = (counter + 1) % 1_000_000;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${time}${rand}${counter.toString(36)}`;
}
