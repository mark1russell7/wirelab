/**
 * The recipes of the measure run. Each recipe reads one source of `@procedures/npm/measures` through `polite-crawler`.
 * The extractor of the measure reads the body, and the one document of a capture holds its rows in `meta`.
 */
import {
  type DepsDevDependents,
  type DepsDevPackage,
  type DownloadsRow,
  type Extracted,
  type Extractor,
  type JsdelivrHits,
  type MeasureRequest,
  type RegistryDocument,
  extractDepsDevDependents,
  extractDepsDevPackage,
  extractDownloads,
  extractJsdelivrHits,
  extractRegistryDocument,
} from "@procedures/npm/measures";
import { type Duration, type ExtractedDoc, type Recipe, decodeBody, defineRecipe } from "polite-crawler";

/** A recipe of a measure, with the type of its rows. */
export interface MeasureRecipe<Row> {
  readonly recipe: Recipe<MeasureRequest>;
  /** The phantom field `row` carries the type of the rows. It has no value. */
  readonly row?: Row;
}

/** These values declare a recipe of a measure. */
interface MeasureDefinition<Row> {
  readonly name: string;
  readonly description: string;
  readonly minInterval: Duration;
  readonly extract: Extractor<Row>;
  readonly maxBytes?: number;
}

/** A stored answer younger than this age answers with no request. A second run on the same day sends no request again. */
const MAX_AGE: Duration = "12h";

function measureRecipe<Row>(definition: MeasureDefinition<Row>): MeasureRecipe<Row> {
  const { name, extract } = definition;
  const recipe = defineRecipe<MeasureRequest>({
    name,
    description: definition.description,
    mode: "api",
    minInterval: definition.minInterval,
    maxAge: MAX_AGE,
    ...(definition.maxBytes === undefined ? {} : { maxBytes: definition.maxBytes }),
    fetch: (request) => ({ url: request.url, accept: request.accept }),
    extract: (body, capture): ExtractedDoc[] => {
      const extracted = extract(decodeBody(body, capture.contentType), capture.url);
      return [
        {
          doc: `${name}:${capture.url}`,
          kind: name,
          title: `${name} ${capture.url}`,
          text: `${String(extracted.rows.length)} rows, ${String(extracted.missing.length)} missing`,
          url: capture.url,
          meta: { rows: extracted.rows, missing: extracted.missing },
        },
      ];
    },
  });
  return { recipe };
}

/** The weekly downloads of npm. The API refused the first check after 43 fast requests, so this recipe waits 2 s. */
export const downloadsRecipe: MeasureRecipe<DownloadsRow> = measureRecipe({
  name: "npm-downloads",
  description: "The downloads of npm packages, from api.npmjs.org",
  minInterval: "2s",
  extract: extractDownloads,
});

/** The versions of a package on deps.dev, with its default version. */
export const depsDevPackageRecipe: MeasureRecipe<DepsDevPackage> = measureRecipe({
  name: "deps-dev-package",
  description: "The versions of an npm package, from api.deps.dev",
  minInterval: "1s",
  extract: extractDepsDevPackage,
});

/** The dependents of one version of a package on deps.dev. */
export const depsDevDependentsRecipe: MeasureRecipe<DepsDevDependents> = measureRecipe({
  name: "deps-dev-dependents",
  description: "The dependents of a version of an npm package, from api.deps.dev",
  minInterval: "1s",
  extract: extractDepsDevDependents,
});

/** The hits of a package on the jsDelivr CDN. */
export const jsdelivrRecipe: MeasureRecipe<JsdelivrHits> = measureRecipe({
  name: "jsdelivr-hits",
  description: "The hits of an npm package on jsDelivr, from data.jsdelivr.com",
  minInterval: "1s",
  extract: extractJsdelivrHits,
});

/** The abbreviated document of a package on the npm registry. A package with many versions has a large document. */
export const registryRecipe: MeasureRecipe<RegistryDocument> = measureRecipe({
  name: "npm-registry-document",
  description: "The abbreviated document of an npm package, from registry.npmjs.org",
  minInterval: "1s",
  maxBytes: 64 * 1024 * 1024,
  extract: extractRegistryDocument,
});

/**
 * This function reads the rows of a document of a measure recipe. The rows went through the store of the crawler as JSON,
 * so the function checks the two lists. It throws an error that names the URL when the document has a different shape.
 */
export function extractedOf<Row>(meta: Readonly<Record<string, unknown>>, url: string): Extracted<Row> {
  const { rows, missing } = meta;
  if (!Array.isArray(rows) || !Array.isArray(missing) || !missing.every((name) => typeof name === "string")) {
    throw new Error(`The document of ${url} has no lists "rows" and "missing" in its meta.`);
  }
  return { rows: rows as Row[], missing };
}
