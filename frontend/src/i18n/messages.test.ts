import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import { CONTENT_KEY_NAMES, CONTENT_KEYS } from "@/lib/content-keys";
import { CHINESE_ANIMALS, ELEMENTS, ORDER_STATUSES, WESTERN_SIGNS } from "@/lib/types";
import { CLIENT_NAMESPACES } from "./client-messages";
import { routing } from "./routing";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const catalogs = { en: flatten(en as Tree), ar: flatten(ar as Tree) };

/** ICU argument names ({name}, {count, plural, ...}) and rich-text tags (<terms>). */
function placeholders(message: string): string[] {
  const args = [...message.matchAll(/\{\s*([a-zA-Z_][\w]*)\s*[,}]/g)].map((m) => `{${m[1]}}`);
  const tags = [...message.matchAll(/<([a-zA-Z][\w-]*)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...args, ...tags])].sort();
}

describe("messages", () => {
  it("has a catalog for every routing locale", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...routing.locales].sort());
  });

  it("has the same keys in every locale", () => {
    expect(Object.keys(catalogs.ar).sort()).toEqual(Object.keys(catalogs.en).sort());
  });

  it("has no empty messages", () => {
    for (const [locale, messages] of Object.entries(catalogs)) {
      const empty = Object.entries(messages).filter(([, v]) => v.trim() === "");
      expect(empty.map(([k]) => `${locale}:${k}`)).toEqual([]);
    }
  });

  it("uses the same ICU arguments and rich-text tags in every locale", () => {
    const mismatches = Object.keys(catalogs.en).filter(
      (key) =>
        placeholders(catalogs.en[key]).join() !== placeholders(catalogs.ar[key] ?? "").join(),
    );
    expect(mismatches).toEqual([]);
  });

  it("names all signs, animals, elements, polarities and order statuses", () => {
    for (const messages of Object.values(catalogs)) {
      for (const sign of WESTERN_SIGNS) expect(messages[`zodiac.signs.${sign}`]).toBeTruthy();
      for (const animal of CHINESE_ANIMALS)
        expect(messages[`zodiac.animals.${animal}`]).toBeTruthy();
      for (const element of ELEMENTS) expect(messages[`zodiac.elements.${element}`]).toBeTruthy();
      for (const p of ["yin", "yang"]) expect(messages[`zodiac.polarity.${p}`]).toBeTruthy();
      for (const status of ORDER_STATUSES) {
        expect(messages[`orderStatus.${status}`]).toBeTruthy();
        expect(messages[`orderStatusDescription.${status}`]).toBeTruthy();
      }
      expect(messages["errors.rate_limited"]).toBeTruthy();
      expect(messages["errors.network"]).toBeTruthy();
    }
  });

  it("has a default under content.* for every site-content key", () => {
    for (const [locale, messages] of Object.entries(catalogs)) {
      const missing = CONTENT_KEY_NAMES.filter((key) => !messages[`content.${key}`]?.trim());
      expect(missing.map((k) => `${locale}:${k}`)).toEqual([]);
    }
  });

  it("only sends existing namespaces to the browser", () => {
    for (const ns of CLIENT_NAMESPACES) expect(Object.keys(en)).toContain(ns);
  });

  it("shows the GeoNames attribution in the footer", () => {
    const text = catalogs.en["footer.geonames"].replace(/<\/?\w+>/g, "");
    expect(text).toBe("Place data © GeoNames (geonames.org), CC BY 4.0");
  });
});

/** Parse backend/app/content/keys.py: `_k("key", "format", ...)` and the FAQ generator lines. */
function backendContentKeys(source: string): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const match = line.match(/_k\(f?"([^"]+)",\s*"(text|lines|markdown)"/);
    if (!match) continue;
    const [, key, format] = match;
    const range = line.match(/for\s+(\w+)\s+in\s+range\((\d+),\s*(\d+)\)/);
    if (range) {
      const [, variable, start, end] = range;
      for (let i = Number(start); i < Number(end); i++) {
        keys[key.replace(`{${variable}}`, String(i))] = format;
      }
    } else {
      keys[key] = format;
    }
  }
  return keys;
}

const keysPy = resolve(__dirname, "../../../backend/app/content/keys.py");

describe("site-content keys", () => {
  it.skipIf(!existsSync(keysPy))("mirror backend/app/content/keys.py exactly", () => {
    const backend = backendContentKeys(readFileSync(keysPy, "utf8"));
    expect(Object.keys(backend).length).toBeGreaterThan(50);
    expect(CONTENT_KEYS).toEqual(backend);
  });
});
