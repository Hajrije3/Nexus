export interface Searchable {
  title: string;
  keywords?: readonly string[];
}

/**
 * Score how well `query` matches an entry. Higher is better; 0 means no match.
 * Prefix > word-prefix > substring > keyword > in-order subsequence.
 */
export function scoreMatch(entry: Searchable, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const title = entry.title.toLowerCase();

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.split(/\s+/).some((w) => w.startsWith(q))) return 60;
  if (title.includes(q)) return 40;
  if (entry.keywords?.some((k) => k.toLowerCase().includes(q))) return 25;

  let i = 0;
  for (const ch of title) if (ch === q[i]) i++;
  return i === q.length ? 10 : 0;
}

/** Filter + rank, preserving original order among equal scores. */
export function rank<T extends Searchable>(entries: readonly T[], query: string): T[] {
  return entries
    .map((entry, index) => ({ entry, index, score: scoreMatch(entry, query) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((e) => e.entry);
}
