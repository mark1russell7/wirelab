/**
 * The wirelab catalog: the browser clients of the wire protocols, as tables. `catalog` holds the checked tables.
 * `priorityOrder` gives the order of the campaign.
 */
import families from "./data/families.json" with { type: "json" };
import packageLinks from "./data/package-links.json" with { type: "json" };
import packageProtocols from "./data/package-protocols.json" with { type: "json" };
import packages from "./data/packages.json" with { type: "json" };
import protocols from "./data/protocols.json" with { type: "json" };
import registry from "./data/registry.json" with { type: "json" };
import sources from "./data/sources.json" with { type: "json" };
import transports from "./data/transports.json" with { type: "json" };
import usage from "./data/usage.json" with { type: "json" };
import { type Catalog, type RawTables, parseCatalog } from "./schema.ts";

export * from "./schema.ts";
export * from "./priority.ts";

/** The raw tables of the files, before the check. */
export const rawTables: RawTables = {
  families,
  transports,
  protocols,
  packages,
  packageProtocols,
  packageLinks,
  sources,
  registry,
  usage,
};

/** The catalog, checked. An import of this module throws an error when a table has a problem. */
export const catalog: Catalog = parseCatalog(rawTables);
