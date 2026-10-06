import { describe, expect, it } from "vitest";
import type { PromptVersion } from "@/lib/admin/types";
import {
  describeChanges,
  isPromptFormDirty,
  normalizeTitles,
  parseMinWords,
  promptFieldErrors,
  promptFormChanges,
  promptFormFromVersion,
  validatePromptForm,
} from "./promptForm";
import {
  countLines,
  countWords,
  formatExample,
  insertAtSelection,
  tokenizeTemplate,
  unknownVariables,
  usedVariables,
  variableSnippet,
} from "./template";

const VERSION: PromptVersion = {
  id: 7,
  slot: 2,
  version: 3,
  name: "Inner World",
  section_titles: { en: "Your Inner World", ar: "عالمك الداخلي" },
  template: "Moon: {{ moon_sign }}\nWrite in {{ language }}.",
  system_instruction: "You are an astrologer.",
  min_words: null,
  status: "draft",
  notes: "",
  created_by_id: 1,
  created_by_name: "Dev Owner",
  created_at: "2026-10-06T10:00:00Z",
  published_at: null,
};

const KNOWN = new Set(["moon_sign", "language", "name", "sun_degree"]);

describe("tokenizeTemplate", () => {
  it("splits text, variables, tags and comments", () => {
    const tokens = tokenizeTemplate("Hi {{ name }}{% if name %}!{% endif %} {# note #}", KNOWN);
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ["text", "Hi "],
      ["variable", "{{ name }}"],
      ["tag", "{% if name %}"],
      ["text", "!"],
      ["tag", "{% endif %}"],
      ["text", " "],
      ["comment", "{# note #}"],
    ]);
    expect(tokens[1]).toMatchObject({ name: "name", known: true });
  });

  it("flags unknown variable names and reads filters", () => {
    const [, typo, filtered] = tokenizeTemplate("x {{ moon_sing }}{{ moon_sign|upper }}", KNOWN);
    expect(typo).toMatchObject({ kind: "variable", name: "moon_sing", known: false });
    expect(filtered).toMatchObject({ kind: "variable", name: "moon_sign", known: true });
    expect(unknownVariables("{{ a }} {{ moon_sign }} {{ a }} {{ b }}", KNOWN)).toEqual(["a", "b"]);
  });

  it("keeps an unterminated tag as text", () => {
    expect(tokenizeTemplate("Write {{ sun", KNOWN)).toEqual([
      { kind: "text", text: "Write {{ sun" },
    ]);
  });

  it("treats every name as known without a list", () => {
    expect(tokenizeTemplate("{{ anything }}")[0]).toMatchObject({ known: true });
  });
});

describe("usedVariables", () => {
  it("collects known names from variables and tags, not comments", () => {
    const used = usedVariables(
      "{{ moon_sign }} {% if sun_degree < 15 %}x{% endif %} {# name #} language",
      KNOWN,
    );
    expect([...used].sort()).toEqual(["moon_sign", "sun_degree"]);
  });
});

describe("insertAtSelection", () => {
  it("inserts at the caret and replaces a selection", () => {
    expect(insertAtSelection("Hello world", 6, 6, "{{ name }} ")).toEqual({
      value: "Hello {{ name }} world",
      caret: 17,
    });
    expect(insertAtSelection("Hello world", 6, 11, "{{ name }}")).toEqual({
      value: "Hello {{ name }}",
      caret: 16,
    });
  });

  it("appends when there is no selection and clamps bad positions", () => {
    expect(insertAtSelection("abc", null, null, "X")).toEqual({ value: "abcX", caret: 4 });
    expect(insertAtSelection("abc", 10, 2, "X")).toEqual({ value: "abcX", caret: 4 });
    expect(insertAtSelection("abc", -3, 1, "X")).toEqual({ value: "Xbc", caret: 1 });
  });

  it("builds the variable snippet", () => {
    expect(variableSnippet("sun_sign")).toBe("{{ sun_sign }}");
  });
});

describe("counters and examples", () => {
  it("counts words and lines", () => {
    expect(countWords("  one two\nthree  ")).toBe(3);
    expect(countWords("   ")).toBe(0);
    expect(countLines("")).toBe(1);
    expect(countLines("a\nb\n")).toBe(3);
  });

  it("formats variable examples", () => {
    expect(formatExample("Leo")).toBe("Leo");
    expect(formatExample("")).toBe('""');
    expect(formatExample(24.3)).toBe("24.3");
    expect(formatExample(false)).toBe("false");
    expect(formatExample(null)).toBe("—");
  });
});

describe("prompt form", () => {
  it("builds the form from a version with every locale", () => {
    const form = promptFormFromVersion({ ...VERSION, section_titles: { en: "X" } }, ["en", "ar"]);
    expect(form.section_titles).toEqual({ en: "X", ar: "" });
    expect(form.min_words).toBe("");
    expect(promptFormFromVersion({ ...VERSION, min_words: 300 }, ["en"]).min_words).toBe("300");
  });

  it("parses min words", () => {
    expect(parseMinWords("")).toBeNull();
    expect(parseMinWords(" 350 ")).toBe(350);
    expect(parseMinWords("0")).toBe(0);
    expect(parseMinWords("5001")).toBeUndefined();
    expect(parseMinWords("3.5")).toBeUndefined();
    expect(parseMinWords("-1")).toBeUndefined();
  });

  it("validates required fields and limits", () => {
    const form = promptFormFromVersion(VERSION, ["en", "ar"]);
    expect(validatePromptForm(form)).toEqual({});
    const bad = {
      ...form,
      name: "  ",
      template: " ",
      min_words: "abc",
      section_titles: { en: "x".repeat(301), ar: "" },
    };
    const errors = validatePromptForm(bad);
    expect(Object.keys(errors).sort()).toEqual(
      ["min_words", "name", "section_titles.en", "template"].sort(),
    );
  });

  it("sends only changed fields, compared like the backend stores them", () => {
    const form = promptFormFromVersion(VERSION, ["en", "ar"]);
    expect(promptFormChanges(form, VERSION)).toEqual({});
    expect(isPromptFormDirty(form, VERSION)).toBe(false);

    // Surrounding whitespace is stripped by the API: not a change.
    expect(isPromptFormDirty({ ...form, template: `${form.template}\n\n` }, VERSION)).toBe(false);

    const edited = {
      ...form,
      template: "New {{ sun_sign }}",
      min_words: "400",
      section_titles: { en: "Your Inner World", ar: " " },
    };
    expect(promptFormChanges(edited, VERSION)).toEqual({
      template: "New {{ sun_sign }}",
      min_words: 400,
      section_titles: { en: "Your Inner World" },
    });
    expect(describeChanges(promptFormChanges(edited, VERSION))).toBe(
      "section titles, template and minimum words",
    );
  });

  it("clears the min words override with null", () => {
    const version = { ...VERSION, min_words: 300 };
    const form = { ...promptFormFromVersion(version, ["en"]), min_words: "" };
    expect(promptFormChanges(form, version)).toEqual({ min_words: null });
  });

  it("counts an invalid min words as unsaved", () => {
    const form = { ...promptFormFromVersion(VERSION, ["en"]), min_words: "x" };
    expect(promptFormChanges(form, VERSION)).toEqual({});
    expect(isPromptFormDirty(form, VERSION)).toBe(true);
  });

  it("normalizes titles", () => {
    expect(normalizeTitles({ en: " A ", ar: "  " })).toEqual({ en: "A" });
  });

  it("maps API errors onto fields", () => {
    expect(
      promptFieldErrors({
        code: "invalid_template",
        message: "'nope' is undefined",
        details: { field: "system_instruction" },
      }),
    ).toEqual({ system_instruction: "'nope' is undefined" });
    expect(
      promptFieldErrors({ code: "invalid_template", message: "unexpected '}'", details: {} }),
    ).toEqual({ template: "unexpected '}'" });
    expect(
      promptFieldErrors(
        { code: "validation_error", message: "Invalid input", details: {} },
        { name: "String should have at least 1 character", other: "x" },
      ),
    ).toEqual({ name: "String should have at least 1 character" });
    expect(promptFieldErrors(null)).toEqual({});
  });
});
