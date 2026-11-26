/**
 * The wirelab catalog: the browser clients of the wire protocols, as tables. `catalog` holds the checked tables.
 * `priorityOrder` gives the order of the campaign.
 */
import formats from "./data/formats.json" with { type: "json" };
import classes from "./data/classes.json" with { type: "json" };
import classFormats from "./data/class-formats.json" with { type: "json" };
import classDimensions from "./data/class-dimensions.json" with { type: "json" };
import findingClasses from "./data/finding-classes.json" with { type: "json" };
import probes from "./data/probes.json" with { type: "json" };
import families from "./data/families.json" with { type: "json" };
import findings from "./data/findings.json" with { type: "json" };
import packageLinks from "./data/package-links.json" with { type: "json" };
import packageProtocols from "./data/package-protocols.json" with { type: "json" };
import packageRepositories from "./data/package-repositories.json" with { type: "json" };
import packageTransports from "./data/package-transports.json" with { type: "json" };
import packages from "./data/packages.json" with { type: "json" };
import policies from "./data/policies.json" with { type: "json" };
import protocols from "./data/protocols.json" with { type: "json" };
import registry from "./data/registry.json" with { type: "json" };
import repositories from "./data/repositories.json" with { type: "json" };
import runs from "./data/runs.json" with { type: "json" };
import sources from "./data/sources.json" with { type: "json" };
import suiteProtocols from "./data/suite-protocols.json" with { type: "json" };
import suites from "./data/suites.json" with { type: "json" };
import transportGlobals from "./data/transport-globals.json" with { type: "json" };
import transports from "./data/transports.json" with { type: "json" };
import upstream from "./data/upstream.json" with { type: "json" };
import usage from "./data/usage.json" with { type: "json" };
import { type Catalog, type RawTables, parseCatalog } from "./schema.ts";

export * from "./schema.ts";
export * from "./priority.ts";
export * from "./measures.ts";
export * from "./transports.ts";

/** The raw tables of the files, before the check. */
export const rawTables: RawTables = {
  families,
  transports,
  transportGlobals,
  protocols,
  packages,
  packageProtocols,
  packageLinks,
  sources,
  registry,
  usage,
  repositories,
  packageRepositories,
  policies,
  suites,
  suiteProtocols,
  runs,
  findings,
  upstream,
  packageTransports,
  formats,
  classes,
  classFormats,
  classDimensions,
  findingClasses,
  probes,
};

/** The catalog, checked. An import of this module throws an error when a table has a problem. */
export const catalog: Catalog = parseCatalog(rawTables);
