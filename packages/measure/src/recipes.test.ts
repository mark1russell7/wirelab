import { describe, expect, it } from "vitest";
import {
  depsDevDependentsRecipe,
  depsDevPackageRecipe,
  downloadsRecipe,
  extractedOf,
  jsdelivrRecipe,
  registryRecipe,
} from "./recipes.ts";

const JSON_TYPE = "application/json";
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe("the recipes", () => {
  it("are API recipes with the pace of their source and the Accept header of the measure", () => {
    const request = registryRecipe.recipe.request({ url: "https://registry.npmjs.org/ws", accept: "application/vnd.npm.install-v1+json" });
    expect(request).toMatchObject({
      url: "https://registry.npmjs.org/ws",
      mode: "api",
      recipe: "npm-registry-document",
      accept: "application/vnd.npm.install-v1+json",
      minIntervalMs: 1000,
      maxAgeMs: 12 * 3_600_000,
    });
    expect(downloadsRecipe.recipe.request({ url: "https://api.npmjs.org/downloads/point/last-week/ws", accept: JSON_TYPE })).toMatchObject({
      minIntervalMs: 2000,
    });
    expect([downloadsRecipe, depsDevPackageRecipe, depsDevDependentsRecipe, jsdelivrRecipe, registryRecipe].map(({ recipe }) => recipe.mode)).toEqual([
      "api",
      "api",
      "api",
      "api",
      "api",
    ]);
  });

  it("put the rows and the missing packages of a body into the meta of one document", async () => {
    const url = "https://api.npmjs.org/downloads/point/last-week/ws,gone";
    const docs = await downloadsRecipe.recipe.extractor(bytes({ ws: { downloads: 9, start: "2026-11-12", end: "2026-11-18", package: "ws" }, gone: null }), {
      url,
      contentType: JSON_TYPE,
    });
    expect(docs).toEqual([
      {
        doc: `npm-downloads:${url}`,
        kind: "npm-downloads",
        title: `npm-downloads ${url}`,
        text: "1 rows, 1 missing",
        url,
        meta: { rows: [{ package: "ws", start: "2026-11-12", end: "2026-11-18", downloads: 9 }], missing: ["gone"] },
      },
    ]);
  });

  it("read each body with the extractor of its measure", async () => {
    const read = async (recipe: typeof jsdelivrRecipe.recipe, url: string, body: unknown) =>
      (await recipe.extractor(bytes(body), { url, contentType: JSON_TYPE }))[0]?.meta["rows"];
    expect(
      await read(depsDevPackageRecipe.recipe, "https://api.deps.dev/v3/systems/npm/packages/ws", {
        versions: [{ versionKey: { version: "8.0.0" }, isDefault: true }],
      }),
    ).toEqual([{ package: "ws", defaultVersion: "8.0.0", versions: [{ version: "8.0.0", publishedAt: null, isDefault: true, deprecated: null }] }]);
    expect(
      await read(depsDevDependentsRecipe.recipe, "https://api.deps.dev/v3alpha/systems/npm/packages/ws/versions/8.0.0:dependents", { dependentCount: 2, directDependentCount: 2 }),
    ).toEqual([{ package: "ws", version: "8.0.0", dependents: 2, direct: 2, indirect: 0 }]);
    expect(await read(jsdelivrRecipe.recipe, "https://data.jsdelivr.com/v1/stats/packages/npm/ws?period=month", { hits: { total: 3, dates: {} } })).toEqual([
      expect.objectContaining({ package: "ws", hits: 3 }),
    ]);
    expect(
      await read(registryRecipe.recipe, "https://registry.npmjs.org/ws", { modified: "2026-11-01T00:00:00Z", "dist-tags": { latest: "8.0.0" }, versions: { "8.0.0": {} } }),
    ).toEqual([{ package: "ws", modified: "2026-11-01T00:00:00Z", distTags: { latest: "8.0.0" }, versions: 1, latestDeprecated: null }]);
  });

  it("throw the error of the extractor for a body of a different shape", async () => {
    await expect(async () =>
      registryRecipe.recipe.extractor(bytes({ maintenance: true }), { url: "https://registry.npmjs.org/ws", contentType: JSON_TYPE }),
    ).rejects.toThrow("not an abbreviated npm document");
  });
});

describe("extractedOf", () => {
  it("gives the lists of the meta", () => {
    expect(extractedOf({ rows: [{ a: 1 }], missing: ["b"] }, "u")).toEqual({ rows: [{ a: 1 }], missing: ["b"] });
  });

  it.each([{}, { rows: [] }, { missing: [] }, { rows: {}, missing: [] }, { rows: [], missing: [1] }])("refuses the meta %j", (meta) => {
    expect(() => extractedOf(meta, "https://x.example/a")).toThrow('The document of https://x.example/a has no lists "rows" and "missing" in its meta.');
  });
});
