import { describe, expect, it } from "vitest";
import { countWords, insertLink, toggleInline, toggleLinePrefix } from "./markdown";

/** Apply an edit to "text with [selection]" notation and return it in the same notation. */
function run(
  input: string,
  apply: (text: string, start: number, end: number) => ReturnType<typeof toggleInline>,
) {
  const start = input.indexOf("[");
  const end = input.indexOf("]") - 1;
  const text = input.replace("[", "").replace("]", "");
  const edit = apply(text, start, end);
  return (
    edit.text.slice(0, edit.selectionStart) +
    "[" +
    edit.text.slice(edit.selectionStart, edit.selectionEnd) +
    "]" +
    edit.text.slice(edit.selectionEnd)
  );
}

describe("toggleInline", () => {
  const bold = (t: string, s: number, e: number) => toggleInline(t, s, e, "**", "bold text");

  it("wraps the selection and keeps it selected", () => {
    expect(run("Two [traditions] one truth", bold)).toBe("Two **[traditions]** one truth");
  });

  it("inserts a selected placeholder without a selection", () => {
    expect(run("Hello []", bold)).toBe("Hello **[bold text]**");
  });

  it("unwraps when the markers are inside or around the selection", () => {
    expect(run("Two [**traditions**] one", bold)).toBe("Two [traditions] one");
    expect(run("Two **[traditions]** one", bold)).toBe("Two [traditions] one");
  });

  it("keeps surrounding spaces outside the markers", () => {
    expect(run("a[ word ]b", bold)).toBe("a **[word]** b");
  });

  it("works with Arabic text", () => {
    const italic = (t: string, s: number, e: number) => toggleInline(t, s, e, "_");
    expect(run("تقليدان [حقيقة] واحدة", italic)).toBe("تقليدان _[حقيقة]_ واحدة");
  });
});

describe("toggleLinePrefix", () => {
  const heading = (t: string, s: number, e: number) => toggleLinePrefix(t, s, e, "## ");
  const bullet = (t: string, s: number, e: number) => toggleLinePrefix(t, s, e, "- ");
  const numbered = (t: string, s: number, e: number) => toggleLinePrefix(t, s, e, "1. ");

  it("prefixes the caret line and keeps the caret", () => {
    expect(run("Intro\nBal[]ance\nEnd", heading)).toBe("Intro\n## Bal[]ance\nEnd");
  });

  it("removes the prefix when present", () => {
    expect(run("## Bal[]ance", heading)).toBe("Bal[]ance");
  });

  it("prefixes every selected line, skipping blank lines", () => {
    expect(run("[Sun sign\n\nYear animal]", bullet)).toBe("[- Sun sign\n\n- Year animal]");
    expect(run("[a\nb\nc]", numbered)).toBe("[1. a\n2. b\n3. c]");
    expect(run("[1. a\n2. b]", numbered)).toBe("[a\nb]");
  });

  it("replaces another block style", () => {
    expect(run("[- a\n- b]", numbered)).toBe("[1. a\n2. b]");
    expect(run("## Ti[]tle", bullet)).toBe("- Ti[]tle");
  });
});

describe("insertLink", () => {
  it("uses the selection as label and selects the URL placeholder", () => {
    const edit = insertLink("Read the terms", 5, 14);
    expect(edit.text).toBe("Read [the terms](https://)");
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe("https://");
  });

  it("turns a selected URL into the link target", () => {
    const edit = insertLink("see /terms here", 4, 10);
    expect(edit.text).toBe("see [link text](/terms) here");
    expect(edit.text.slice(edit.selectionStart, edit.selectionEnd)).toBe("link text");
  });
});

describe("countWords", () => {
  it("counts Latin and Arabic words, ignoring markup", () => {
    expect(countWords("## Balance\n\nTwo **traditions**, one _truth_.")).toBe(5);
    expect(countWords("تقليدان، **حقيقة** واحدة")).toBe(3);
    expect(countWords("[link text](https://example.com)")).toBe(2);
    expect(countWords("")).toBe(0);
  });
});
