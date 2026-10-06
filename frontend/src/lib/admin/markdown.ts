/**
 * Pure text transformations behind the MarkdownEditor toolbar. Each returns the new text and the
 * selection to restore, so they are easy to test and to undo.
 */

export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Wrap the selection in `marker` (`**` bold, `_` italic), or unwrap it when it is already wrapped
 * (inside or just outside the selection). With no selection, inserts `marker+placeholder+marker`
 * and selects the placeholder.
 */
export function toggleInline(
  text: string,
  start: number,
  end: number,
  marker: string,
  placeholder = "text",
): TextEdit {
  const m = marker.length;
  const selected = text.slice(start, end);
  // Selection includes the markers: "**bold**" → "bold".
  if (selected.length >= 2 * m && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(m, selected.length - m);
    return {
      text: text.slice(0, start) + inner + text.slice(end),
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }
  // Markers just outside the selection: **[bold]** → bold.
  if (
    start >= m &&
    text.slice(start - m, start) === marker &&
    text.slice(end, end + m) === marker
  ) {
    return {
      text: text.slice(0, start - m) + selected + text.slice(end + m),
      selectionStart: start - m,
      selectionEnd: end - m,
    };
  }
  const content = selected || placeholder;
  // Keep surrounding spaces outside the markers ("** bold **" is not bold in Markdown).
  const lead = content.match(/^\s*/)?.[0] ?? "";
  const trail = content.slice(lead.length).match(/\s*$/)?.[0] ?? "";
  const core = content.slice(lead.length, content.length - trail.length) || placeholder;
  const inserted = `${lead}${marker}${core}${marker}${trail}`;
  const coreStart = start + lead.length + m;
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selectionStart: coreStart,
    selectionEnd: coreStart + core.length,
  };
}

function lineBounds(text: string, start: number, end: number): [number, number] {
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const adjustedEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = text.indexOf("\n", adjustedEnd);
  return [start === 0 ? 0 : lineStart, nextBreak === -1 ? text.length : nextBreak];
}

/** Matches any heading / list / quote prefix so switching styles replaces the old one. */
const BLOCK_PREFIX = /^(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/;

/**
 * Toggle a block prefix on every line touched by the selection:
 * `"## "` heading, `"- "` bullet list, `"1. "` numbered list (numbers increase), `"> "` quote.
 * If every non-empty line already has this prefix it is removed; otherwise other block prefixes
 * are replaced by it.
 */
export function toggleLinePrefix(
  text: string,
  start: number,
  end: number,
  prefix: string,
): TextEdit {
  const [from, to] = lineBounds(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const numbered = /^\d+\.\s$/.test(prefix);
  const hasPrefix = (line: string) =>
    numbered ? /^\d+[.)]\s+/.test(line) : line.startsWith(prefix);
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  const remove = nonEmpty.length > 0 && nonEmpty.every(hasPrefix);
  let counter = 0;
  const next = lines.map((line) => {
    if (remove)
      return line.replace(numbered ? /^\d+[.)]\s+/ : new RegExp(`^${escapeRegExp(prefix)}`), "");
    if (line.trim() === "" && lines.length > 1) return line;
    counter += 1;
    const bare = line.replace(BLOCK_PREFIX, "");
    return `${numbered ? `${counter}. ` : prefix}${bare}`;
  });
  const replaced = next.join("\n");
  const newText = text.slice(0, from) + replaced + text.slice(to);
  if (start === end && lines.length === 1) {
    // Keep the caret on the same character of the line.
    const delta = replaced.length - (to - from);
    const caret = Math.max(from, start + delta);
    return { text: newText, selectionStart: caret, selectionEnd: caret };
  }
  return { text: newText, selectionStart: from, selectionEnd: from + replaced.length };
}

/**
 * Insert a link: the selection becomes the label (`[label](url)`) and the URL part is selected so
 * it can be typed over. A selection that looks like a URL becomes the URL instead.
 */
export function insertLink(text: string, start: number, end: number, url = "https://"): TextEdit {
  const selected = text.slice(start, end);
  if (/^(https?:\/\/|\/)\S+$/.test(selected.trim())) {
    const label = "link text";
    const inserted = `[${label}](${selected.trim()})`;
    return {
      text: text.slice(0, start) + inserted + text.slice(end),
      selectionStart: start + 1,
      selectionEnd: start + 1 + label.length,
    };
  }
  const label = selected || "link text";
  const inserted = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    selectionStart: urlStart,
    selectionEnd: urlStart + url.length,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rough word count for the editor footer (Latin and Arabic words; markup ignored). */
export function countWords(markdown: string): number {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~[\]()-]/g, " ");
  const words = plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu);
  return words ? words.length : 0;
}
