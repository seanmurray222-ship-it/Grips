import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function rule(selector: string): string {
  const m = css.match(new RegExp(`(^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`));
  return m ? m[2] : "";
}

describe("page scrolling", () => {
  // Overflow or overscroll-behavior on html/body broke touch scrolling in the installed Android app.
  it("keeps overflow and overscroll-behavior off html and body", () => {
    for (const sel of ["html", "body"]) {
      const body = rule(sel);
      expect(body, `${sel} rule`).not.toBe("");
      expect(body).not.toMatch(/overflow|overscroll-behavior/);
    }
  });
});
