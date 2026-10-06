import { describe, expect, it } from "vitest";
import { diffHunks, diffLines, diffStats, MAX_DIFF_CELLS, splitLines, type DiffLine } from "./diff";

const ops = (lines: DiffLine[]) =>
  lines.map((l) => `${l.op === "equal" ? " " : l.op === "insert" ? "+" : "-"}${l.text}`);

/** Rebuild both sides from the diff: every line must be accounted for, in order. */
function sides(lines: DiffLine[]) {
  return {
    old: lines.filter((l) => l.op !== "insert").map((l) => l.text),
    new: lines.filter((l) => l.op !== "delete").map((l) => l.text),
  };
}

describe("splitLines", () => {
  it("normalises CRLF and keeps a trailing empty line", () => {
    expect(splitLines("a\r\nb\rc\n")).toEqual(["a", "b", "c", ""]);
    expect(splitLines("")).toEqual([""]);
  });
});

describe("diffLines", () => {
  it("returns only equal lines for identical texts", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(ops(lines)).toEqual([" a", " b", " c"]);
    expect(diffStats(lines)).toEqual({ added: 0, removed: 0, same: true });
  });

  it("finds a changed line in the middle (delete before insert)", () => {
    const lines = diffLines("one\ntwo\nthree", "one\nTWO\nthree");
    expect(ops(lines)).toEqual([" one", "-two", "+TWO", " three"]);
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1, same: false });
  });

  it("numbers lines on both sides", () => {
    const lines = diffLines("a\nb\nc", "a\nx\ny\nc");
    expect(lines.map((l) => [l.op, l.oldLine, l.newLine])).toEqual([
      ["equal", 1, 1],
      ["delete", 2, null],
      ["insert", null, 2],
      ["insert", null, 3],
      ["equal", 3, 4],
    ]);
  });

  it("handles additions and removals at the edges", () => {
    expect(ops(diffLines("", "a\nb"))).toEqual(["-", "+a", "+b"]);
    expect(ops(diffLines("a\nb", "b"))).toEqual(["-a", " b"]);
    expect(ops(diffLines("a", "a\nb"))).toEqual([" a", "+b"]);
  });

  it("uses the longest common subsequence (moved block)", () => {
    const before = ["A", "B", "C", "D", "E"].join("\n");
    const after = ["A", "C", "D", "B", "E"].join("\n");
    const lines = diffLines(before, after);
    // Moving one line costs exactly one deletion and one insertion.
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1, same: false });
    expect(sides(lines)).toEqual({ old: before.split("\n"), new: after.split("\n") });
  });

  it("always reproduces both inputs", () => {
    const cases: Array<[string, string]> = [
      ["x\ny\nz", "z\ny\nx"],
      ["{{ sun_sign }}\n\nWrite 400 words.", "Intro\n{{ sun_sign }}\nWrite 500 words.\nEnd"],
      ["same\nsame\nsame", "same\nother\nsame\nsame"],
    ];
    for (const [a, b] of cases) {
      expect(sides(diffLines(a, b))).toEqual({ old: splitLines(a), new: splitLines(b) });
    }
  });

  it("falls back to remove-all/add-all for huge inputs", () => {
    const size = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10;
    const a = Array.from({ length: size }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: size }, (_, i) => `b${i}`).join("\n");
    const lines = diffLines(a, b);
    expect(diffStats(lines)).toEqual({ added: size, removed: size, same: false });
    expect(lines[0].op).toBe("delete");
    expect(lines.at(-1)?.op).toBe("insert");
  });
});

describe("diffHunks", () => {
  const numbered = (n: number, prefix = "l") =>
    Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

  it("collapses unchanged runs around a change", () => {
    const before = numbered(20);
    const after = [...before];
    after[9] = "changed";
    const hunks = diffHunks(diffLines(before.join("\n"), after.join("\n")), 2);
    expect(hunks.map((h) => h.kind)).toEqual(["skip", "lines", "skip"]);
    const [first, middle, last] = hunks;
    expect(first).toMatchObject({ kind: "skip", count: 7, oldLine: 1, newLine: 1 });
    expect(middle.kind === "lines" && ops(middle.lines)).toEqual([
      " l8",
      " l9",
      "-l10",
      "+changed",
      " l11",
      " l12",
    ]);
    expect(last).toMatchObject({ kind: "skip", count: 8, oldLine: 13, newLine: 13 });
  });

  it("keeps short runs between changes", () => {
    const hunks = diffHunks(diffLines("a\nb\nc\nd", "A\nb\nc\nD"), 1);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].kind === "lines" && ops(hunks[0].lines)).toEqual([
      "-a",
      "+A",
      " b",
      " c",
      "-d",
      "+D",
    ]);
  });

  it("does not hide a single line", () => {
    const before = numbered(5).join("\n");
    const after = numbered(5)
      .map((l, i) => (i === 4 ? "X" : l))
      .join("\n");
    const hunks = diffHunks(diffLines(before, after), 3);
    // 4 equal lines before the change: 3 kept as context, hiding only 1 line is not worth it.
    expect(hunks).toHaveLength(1);
  });

  it("collapses everything when nothing changed", () => {
    const hunks = diffHunks(diffLines("a\nb\nc", "a\nb\nc"), 3);
    expect(hunks).toEqual([{ kind: "skip", count: 3, oldLine: 1, newLine: 1 }]);
  });
});
