import { afterEach, describe, expect, test, vi } from "vitest";
import {
  convertNumStrFromEffectiveTo,
  convertNumStrToLocal,
  getEffectiveLocale,
  getEnUSNumberToLocalParts,
  getLocaleSymbols,
} from "./locale.js";

describe("getLocaleSymbols", () => {
  test("returns en-US symbols", () => {
    const r = getLocaleSymbols("en-US");
    expect(r.decimalSymbol).toBe(".");
    expect(r.groupSymbol).toBe(",");
    expect(r.locale).toBe("en-US");
  });

  test("returns fr-FR symbols (decimal=',' and a non-breaking space group)", () => {
    const r = getLocaleSymbols("fr-FR");
    expect(r.decimalSymbol).toBe(",");
    // Group symbol in fr-FR is a NBSP/narrow NBSP — assert it is NOT "," or "."
    expect(r.groupSymbol).not.toBe(",");
    expect(r.groupSymbol).not.toBe(".");
    expect(r.locale).toBe("fr-FR");
  });

  test("returns de-DE symbols (decimal=',' group='.')", () => {
    const r = getLocaleSymbols("de-DE");
    expect(r.decimalSymbol).toBe(",");
    expect(r.groupSymbol).toBe(".");
    expect(r.locale).toBe("de-DE");
  });

  test("falls back to en-US when locale is invalid", () => {
    // The function still echoes back the input locale string but uses en-US formatter on RangeError
    const r = getLocaleSymbols("not-a-real-locale");
    // The decimal/group come from the en-US fallback
    expect(r.decimalSymbol).toBe(".");
    expect(r.groupSymbol).toBe(",");
    // Locale string is echoed back as-is
    expect(r.locale).toBe("not-a-real-locale");
  });
});

// `describe.sequential` is required because the tests below drive
// branching with `vi.stubGlobal("window"|"navigator"|"document", …)`,
// and the first test additionally asserts on the un-stubbed Node global.
// These stubs mutate Node's process-global namespace, and the repo-wide
// `sequence: { concurrent: true }` would otherwise let two concurrent
// tests overwrite each other's globals (and one's afterEach
// `vi.unstubAllGlobals()` could revoke another's stubs mid-flight).
describe.sequential("getEffectiveLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns en-US when window is undefined (Node)", () => {
    expect(typeof globalThis.window).toBe("undefined");
    expect(getEffectiveLocale()).toBe("en-US");
  });

  test("returns navigator.language when window is defined and language is valid", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { language: "fr-FR" });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    expect(getEffectiveLocale()).toBe("fr-FR");
  });

  test("falls back to document.documentElement.lang when navigator.language is empty", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { language: "" });
    vi.stubGlobal("document", { documentElement: { lang: "de-DE" } });
    expect(getEffectiveLocale()).toBe("de-DE");
  });

  test("falls back to en-US when both navigator.language and document.lang are missing", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { language: "" });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    expect(getEffectiveLocale()).toBe("en-US");
  });

  test("falls back to en-US when locale is invalid", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { language: "not-a-real-locale-bad!" });
    vi.stubGlobal("document", { documentElement: { lang: "" } });
    expect(getEffectiveLocale()).toBe("en-US");
  });
});

describe("convertNumStrToLocal", () => {
  test("returns input unchanged when from and to locales share symbols (en-US)", () => {
    expect(convertNumStrToLocal("1,234.56", "en-US", "en-US")).toBe("1,234.56");
  });

  test("converts en-US to de-DE (swaps , and .)", () => {
    expect(convertNumStrToLocal("1,234.56", "en-US", "de-DE")).toBe("1.234,56");
  });

  test("converts de-DE back to en-US (round trip)", () => {
    const enToDe = convertNumStrToLocal("1,234.56", "en-US", "de-DE");
    expect(convertNumStrToLocal(enToDe, "de-DE", "en-US")).toBe("1,234.56");
  });

  test("handles values with multiple group separators", () => {
    expect(convertNumStrToLocal("1,234,567.89", "en-US", "de-DE")).toBe(
      "1.234.567,89",
    );
  });

  test("handles negative numbers", () => {
    expect(convertNumStrToLocal("-1,234.56", "en-US", "de-DE")).toBe(
      "-1.234,56",
    );
  });

  test("handles zero", () => {
    expect(convertNumStrToLocal("0", "en-US", "de-DE")).toBe("0");
  });
});

describe("convertNumStrFromEffectiveTo", () => {
  test("uses en-US as the from locale in Node", () => {
    expect(convertNumStrFromEffectiveTo("1,234.56", "de-DE")).toBe("1.234,56");
  });
});

describe("getEnUSNumberToLocalParts", () => {
  test("formats to en-US when locale='en-US'", () => {
    const r = getEnUSNumberToLocalParts("1,234.56", "en-US");
    expect(r.value).toBe("1,234.56");
    expect(r.decimalSymbol).toBe(".");
    expect(r.groupSymbol).toBe(",");
    expect(r.locale).toBe("en-US");
  });

  test("formats to de-DE", () => {
    const r = getEnUSNumberToLocalParts("1,234.56", "de-DE");
    expect(r.value).toBe("1.234,56");
    expect(r.decimalSymbol).toBe(",");
    expect(r.groupSymbol).toBe(".");
    expect(r.locale).toBe("de-DE");
  });

  test("falls back to effective locale (en-US in Node) when locale arg omitted", () => {
    const r = getEnUSNumberToLocalParts("1,234.56");
    expect(r.value).toBe("1,234.56");
    expect(r.locale).toBe("en-US");
  });

  test("handles whole numbers", () => {
    const r = getEnUSNumberToLocalParts("1,000", "de-DE");
    expect(r.value).toBe("1.000");
  });

  test("handles fractional values without group separator", () => {
    const r = getEnUSNumberToLocalParts("0.5", "de-DE");
    expect(r.value).toBe("0,5");
  });
});
