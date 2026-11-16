import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");

describe("the home page", () => {
  it("names the package and gives the install command", () => {
    expect(page).toContain("<title>wirelab</title>");
    expect(page).toContain("git clone https://github.com/mark1russell7/wirelab.git");
  });

  it("links to the pages of site-pages and to the repository", () => {
    expect(page).toContain('href="./releases/"');
    expect(page).toContain('href="./status/"');
    expect(page).toContain('href="https://github.com/mark1russell7/wirelab"');
  });

  it("has the ranked list, its filters and the two charts of the faults", () => {
    for (const id of ["tiles", "filters", "q", "family", "landing", "faults", "count", "ranked", "more", "kinds", "states"]) {
      expect(page).toContain(`id="${id}"`);
    }
    expect(page).toContain('aria-live="polite"');
  });
});
