/**
 * The measure run. It asks each source for each package of the catalog, through `polite-crawler`. Each source has its
 * own host, so the four lanes run at the same time, and the crawler keeps the pace of each host.
 */
import {
  type DepsDevDependents,
  type DownloadsRow,
  type JsdelivrHits,
  type MeasureRequest,
  type RegistryDocument,
  depsDevDependentsRequest,
  depsDevPackageRequest,
  downloadsRequests,
  jsdelivrHitsRequest,
  registryDocumentRequest,
} from "@procedures/npm/measures";
import { type RecipeTarget, runRecipe } from "polite-crawler";
import {
  type MeasureRecipe,
  depsDevDependentsRecipe,
  depsDevPackageRecipe,
  downloadsRecipe,
  extractedOf,
  jsdelivrRecipe,
  registryRecipe,
} from "./recipes.ts";

/** A request that gave no rows: its recipe, its URL, and what the crawler told. */
export interface Failure {
  readonly recipe: string;
  readonly url: string;
  readonly outcome: string;
  readonly status: number;
  readonly note: string | null;
}

/** The rows of a run, for each source, and each request that failed. */
export interface Measured {
  readonly downloads: readonly DownloadsRow[];
  readonly dependents: readonly DepsDevDependents[];
  readonly hits: readonly JsdelivrHits[];
  readonly documents: readonly RegistryDocument[];
  readonly failures: readonly Failure[];
}

/** A source answers these outcomes when it is busy. The crawler then waits before the next request to the host. */
const BUSY = new Set(["rate-limited", "unavailable"]);

/** This number is the most requests for one URL. The waits between them come from the crawler: `Retry-After` or a backoff. */
export const ATTEMPTS = 5;

/**
 * This function sends one request of a recipe, and it sends it again while the source is busy. A package that the
 * source does not know (HTTP 404 or 410) gives no rows and no failure. Each other request with no rows is a failure.
 */
async function ask<Row>(
  target: RecipeTarget,
  { recipe }: MeasureRecipe<Row>,
  request: MeasureRequest,
  failures: Failure[],
): Promise<readonly Row[]> {
  for (let attempt = 1; ; attempt += 1) {
    const result = await runRecipe(target, recipe, request);
    if (result.outcome === "not-found") return [];
    const [doc] = result.docs;
    if (doc !== undefined && result.error === null) return extractedOf<Row>(doc.meta, result.url).rows;
    if (!BUSY.has(result.outcome) || attempt === ATTEMPTS) {
      failures.push({
        recipe: recipe.name,
        url: result.url,
        outcome: result.outcome,
        status: result.status,
        note: result.error ?? result.note,
      });
      return [];
    }
  }
}

/** This function starts the steps of a lane one after the other, and it gives all their rows in order. */
async function lane<Row>(steps: ReadonlyArray<() => Promise<readonly Row[]>>): Promise<Row[]> {
  const rows: Row[] = [];
  for (const step of steps) rows.push(...(await step()));
  return rows;
}

/** This function asks deps.dev for the default version of a package, and then for the dependents of that version. */
async function dependentsOf(target: RecipeTarget, name: string, failures: Failure[]): Promise<readonly DepsDevDependents[]> {
  const [found] = await ask(target, depsDevPackageRecipe, depsDevPackageRequest(name), failures);
  const version = found?.defaultVersion ?? null;
  if (version === null) return [];
  return ask(target, depsDevDependentsRecipe, depsDevDependentsRequest(name, version), failures);
}

/** This function measures each package from each source. The order of the rows follows the order of the requests. */
export async function measurePackages(target: RecipeTarget, names: readonly string[]): Promise<Measured> {
  const failures: Failure[] = [];
  const [downloads, dependents, hits, documents] = await Promise.all([
    lane(downloadsRequests(names, "last-week").map((request) => () => ask(target, downloadsRecipe, request, failures))),
    lane(names.map((name) => () => dependentsOf(target, name, failures))),
    lane(names.map((name) => () => ask(target, jsdelivrRecipe, jsdelivrHitsRequest(name, "month"), failures))),
    lane(names.map((name) => () => ask(target, registryRecipe, registryDocumentRequest(name), failures))),
  ]);
  return { downloads, dependents, hits, documents, failures };
}
