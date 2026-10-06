/**
 * Small line diff (longest common subsequence) for comparing prompt versions. No dependency:
 * prompt templates are at most 20 000 characters, so an O(n·m) table over the changed middle part
 * (after trimming the common head and tail) is fast enough.
 *
 *   const lines = diffLines(published.template, draft.template);
 *   const { added, removed } = diffStats(lines);
 *   const hunks = diffHunks(lines, 3); // unchanged runs collapsed to "… 12 unchanged lines"
 */

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffLine {
  op: DiffOp;
  text: string;
  /** 1-based line number in the old text (null for insertions). */
  oldLine: number | null;
  /** 1-based line number in the new text (null for deletions). */
  newLine: number | null;
}

/** Above this many table cells the middle part is shown as "all removed, all added". */
export const MAX_DIFF_CELLS = 4_000_000;

export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** Line diff of `oldText` → `newText` (deletions come before insertions inside a changed block). */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  // Common head and tail need no table.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }

  const out: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  const equal = (text: string) =>
    out.push({ op: "equal", text, oldLine: oldNo++, newLine: newNo++ });
  const remove = (text: string) =>
    out.push({ op: "delete", text, oldLine: oldNo++, newLine: null });
  const insert = (text: string) =>
    out.push({ op: "insert", text, oldLine: null, newLine: newNo++ });

  for (let i = 0; i < head; i += 1) equal(a[i]);

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const n = midA.length;
  const m = midB.length;

  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_DIFF_CELLS) {
    midA.forEach(remove);
    midB.forEach(insert);
  } else {
    // lcs[i * (m + 1) + j] = length of the LCS of midA[i..] and midB[j..].
    const width = m + 1;
    const lcs =
      n < 65_535 && m < 65_535
        ? new Uint16Array((n + 1) * width)
        : new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        lcs[i * width + j] =
          midA[i] === midB[j]
            ? lcs[(i + 1) * width + j + 1] + 1
            : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        equal(midA[i]);
        i += 1;
        j += 1;
      } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
        remove(midA[i]);
        i += 1;
      } else {
        insert(midB[j]);
        j += 1;
      }
    }
    while (i < n) remove(midA[i++]);
    while (j < m) insert(midB[j++]);
  }

  for (let i = a.length - tail; i < a.length; i += 1) equal(a[i]);
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
  /** True when nothing changed. */
  same: boolean;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.op === "insert") added += 1;
    else if (line.op === "delete") removed += 1;
  }
  return { added, removed, same: added === 0 && removed === 0 };
}

export type DiffHunk =
  | { kind: "lines"; lines: DiffLine[] }
  /** `count` unchanged lines hidden, starting at old/new line numbers. */
  | { kind: "skip"; count: number; oldLine: number; newLine: number };

/**
 * Collapse unchanged runs, keeping `context` lines around every change. A run is only collapsed
 * when it hides at least 2 lines (hiding a single line saves no space).
 */
export function diffHunks(lines: DiffLine[], context = 3): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let buffer: DiffLine[] = [];
  const flush = () => {
    if (buffer.length) hunks.push({ kind: "lines", lines: buffer });
    buffer = [];
  };

  let index = 0;
  while (index < lines.length) {
    if (lines[index].op !== "equal") {
      buffer.push(lines[index]);
      index += 1;
      continue;
    }
    let end = index;
    while (end < lines.length && lines[end].op === "equal") end += 1;
    const run = lines.slice(index, end);
    const atStart = index === 0;
    const atEnd = end === lines.length;
    const keepBefore = atStart ? 0 : context; // lines after the previous change
    const keepAfter = atEnd ? 0 : context; // lines before the next change
    const hidden = run.length - keepBefore - keepAfter;
    if (hidden >= 2) {
      buffer.push(...run.slice(0, keepBefore));
      flush();
      const first = run[keepBefore];
      hunks.push({
        kind: "skip",
        count: hidden,
        oldLine: first.oldLine ?? 0,
        newLine: first.newLine ?? 0,
      });
      buffer.push(...run.slice(run.length - keepAfter));
    } else {
      buffer.push(...run);
    }
    index = end;
  }
  flush();
  return hunks;
}
