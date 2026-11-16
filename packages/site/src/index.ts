/**
 * The home page of wirelab: the catalog in the priority order of the campaign, with filters. Each package shows the
 * parts of its score and its faults. The page reads the filter from the address, so a link keeps a view.
 */
import { byId, copyText, h, setupTheme } from "@mark1russell7/site-pages/chrome";
import { countOf } from "@mark1russell7/text";
import { catalog, LANDING } from "@wirelab/catalog";
import {
  type Bar,
  campaignCounts,
  catalogRows,
  compact,
  type Filter,
  filterRows,
  fixed2,
  LANDED,
  LANDING_CHOICES,
  type LandingChoice,
  METRIC_WORDS,
  NO_FILTER,
  type Row,
  STATE_WORDS,
} from "./model.ts";

setupTheme(byId<HTMLButtonElement>("theme"), "theme");

const copy = byId<HTMLButtonElement>("copy");
copy.addEventListener("click", () => {
  void copyText(copy, byId("install").textContent ?? "");
});

/** The number of rows that the list shows at first, and that each press of "Show more" adds. */
const PAGE = 25;

const rows = catalogRows(catalog);
const counts = campaignCounts(catalog);

const q = byId<HTMLInputElement>("q");
const family = byId<HTMLSelectElement>("family");
const landing = byId<HTMLSelectElement>("landing");
const faults = byId<HTMLInputElement>("faults");
const list = byId<HTMLOListElement>("ranked");
const count = byId("count");
const more = byId<HTMLButtonElement>("more");

let shown = PAGE;
let open: string | null = null;

/** This function puts the tiles of the campaign at the top of the page. */
function drawTiles(): void {
  const tile = (value: string, words: string): HTMLLIElement => h("li", { class: "tile" }, h("strong", {}, value), h("span", {}, words));
  byId("tiles").replaceChildren(
    tile(counts.packages.toLocaleString("en"), "client packages"),
    tile(counts.protocols.toLocaleString("en"), `protocols in ${countOf(counts.families, "family", "families")}`),
    tile(counts.faults.toLocaleString("en"), "faults found"),
    tile(counts.sent.toLocaleString("en"), "faults sent upstream"),
    tile(counts.landed.toLocaleString("en"), "fixes in the code upstream"),
  );
  byId("as-of").textContent = `The newest data of the catalog is from ${counts.newest}.`;
}

/** This function draws a chart of counts: one bar for each count, with the value at the end of the bar. */
function drawBars(id: string, bars: readonly Bar[]): void {
  const top = Math.max(1, ...bars.map((b) => b.count));
  byId(id).replaceChildren(
    ...bars.map((b) => {
      const fill = h("span", { class: "fill" });
      fill.style.width = `${(100 * b.count) / top}%`;
      return h(
        "li",
        { title: `${b.label}: ${countOf(b.count, "fault")}` },
        h("span", { class: "label" }, b.label),
        h("span", { class: "track" }, fill),
        h("span", { class: "n" }, b.count.toLocaleString("en")),
      );
    }),
  );
}

/** This function fills the choices of the family filter, in the order of the families of the catalog. */
function fillFamilies(): void {
  const used = new Set(rows.map((r) => r.ranked.family));
  const families = [...catalog.families].filter((f) => used.has(f.id)).sort((a, b) => a.order - b.order);
  family.append(...families.map((f) => h("option", { value: f.id }, f.title)));
}

/** This function gives the filter of the controls. */
function currentFilter(): Filter {
  const choice = landing.value as LandingChoice;
  return {
    text: q.value,
    family: family.value,
    withFaults: faults.checked,
    landing: LANDING_CHOICES.includes(choice) ? choice : "all",
  };
}

/** This function sets the controls from the address of the page. An unknown value gives the default. */
function readAddress(): void {
  const p = new URLSearchParams(location.search);
  q.value = p.get("q") ?? NO_FILTER.text;
  const f = p.get("family") ?? "";
  family.value = [...family.options].some((o) => o.value === f) ? f : NO_FILTER.family;
  const l = p.get("landing") ?? "";
  landing.value = (LANDING_CHOICES as readonly string[]).includes(l) ? l : NO_FILTER.landing;
  faults.checked = p.get("faults") === "1";
}

/** This function writes the filter into the address of the page, with no new entry in the history. */
function writeAddress(filter: Filter): void {
  const p = new URLSearchParams();
  if (filter.text !== "") p.set("q", filter.text);
  if (filter.family !== "") p.set("family", filter.family);
  if (filter.landing !== "all") p.set("landing", filter.landing);
  if (filter.withFaults) p.set("faults", "1");
  const search = p.toString();
  history.replaceState(null, "", `${location.pathname}${search === "" ? "" : `?${search}`}${location.hash}`);
}

/** This function makes the bar of a score: the score, then the part of the reach that the chance of a fix takes away. */
function scoreBar(row: Row): HTMLSpanElement {
  const score = h("span", { class: "score" });
  const lost = h("span", { class: "lost" });
  score.style.width = `${100 * (row.ranked.score ?? 0)}%`;
  lost.style.width = `${100 * Math.max(0, (row.ranked.reach ?? 0) - (row.ranked.score ?? 0))}%`;
  return h("span", { class: "bar", "aria-hidden": "true" }, score, lost);
}

/** This function makes the details of a package: the parts of its score, its factors and its faults. */
function details(row: Row, id: string): HTMLDivElement {
  const r = row.ranked;
  const parts =
    r.score === null || r.reach === null
      ? h("p", {}, "This package has no measure of use yet, so it has no score and it goes last.")
      : h("p", { class: "formula" }, `Score ${fixed2(r.score)} = reach ${fixed2(r.reach)} × chance that a fix lands ${fixed2(r.landing)}`);
  const shares =
    r.shares.length === 0
      ? null
      : h(
          "table",
          { class: "shares" },
          h("caption", {}, "The reach is the mean of the shares. A share is the place of the package among all packages on one measure, from 0 to 1."),
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Measure"), h("th", { scope: "col" }, "Value"), h("th", { scope: "col" }, "Share"))),
          h(
            "tbody",
            {},
            r.shares.map((s) => {
              const fill = h("span", { class: "fill" });
              fill.style.width = `${100 * s.share}%`;
              return h(
                "tr",
                {},
                h("th", { scope: "row" }, METRIC_WORDS[s.metric]),
                h("td", { title: s.value.toLocaleString("en") }, compact(s.value)),
                h("td", {}, h("span", { class: "share" }, h("span", { class: "track" }, fill), fixed2(s.share))),
              );
            }),
          ),
        );
  const factors =
    r.landing === 1
      ? h("p", {}, "No factor lowers the chance that a fix lands.")
      : h(
          "div",
          {},
          h("h4", {}, "What lowers the chance that a fix lands"),
          h("ul", { class: "reasons" }, r.reasons.filter((x) => x !== "no measure of use yet").map((x) => h("li", {}, x))),
        );
  const found =
    row.faults.length === 0
      ? h("p", {}, "The campaign has found no fault in this package yet.")
      : h(
          "div",
          {},
          h("h4", {}, countOf(row.faults.length, "fault")),
          h(
            "ul",
            { class: "faults" },
            row.faults.map((f) => {
              const state = f.upstream === null ? "no upstream report yet" : STATE_WORDS[f.upstream.state];
              const landed = f.upstream !== null && LANDED.has(f.upstream.state);
              return h(
                "li",
                {},
                h("span", { class: "fid" }, f.finding.id),
                h("span", { class: "ftitle" }, f.finding.title),
                h(
                  "span",
                  { class: "fmeta" },
                  `${f.finding.kind}, version ${f.finding.version}, `,
                  f.upstream?.url === undefined || f.upstream === null
                    ? h("span", { class: landed ? "state landed" : "state" }, state)
                    : h("a", { class: landed ? "state landed" : "state", href: f.upstream.url }, state),
                ),
              );
            }),
          ),
        );
  const links = h(
    "p",
    { class: "links" },
    h("a", { href: `https://www.npmjs.com/package/${r.package}` }, "npm"),
    row.repository === null ? null : h("a", { href: row.repository.url }, row.repository.id),
  );
  return h("div", { class: "detail", id }, parts, shares, factors, found, links);
}

/** This function makes the row of one package. The button of the row opens and closes its details. */
function rowOf(row: Row): HTMLLIElement {
  const r = row.ranked;
  const id = `d-${r.place}`;
  const isOpen = open === r.package;
  const button = h(
    "button",
    { class: "head", type: "button", "aria-expanded": isOpen ? "true" : "false", "aria-controls": id },
    h("span", { class: "place" }, String(r.place)),
    h("span", { class: "name" }, h("span", { class: "pkg" }, r.package), h("span", { class: "fam" }, row.familyTitle)),
    scoreBar(row),
    h("span", { class: "value" }, r.score === null ? "no score" : fixed2(r.score)),
    h("span", { class: "nfaults" }, row.faults.length === 0 ? "" : countOf(row.faults.length, "fault")),
  );
  button.addEventListener("click", () => {
    open = isOpen ? null : r.package;
    draw();
    byId(`p-${r.place}`).querySelector("button")?.focus();
  });
  return h("li", { class: isOpen ? "row open" : "row", id: `p-${r.place}` }, button, isOpen ? details(row, id) : null);
}

/** This function draws the list from the filter of the controls. */
function draw(): void {
  const filter = currentFilter();
  writeAddress(filter);
  const found = filterRows(rows, filter);
  list.replaceChildren(...found.slice(0, shown).map(rowOf));
  count.textContent =
    found.length === rows.length ? `All ${countOf(rows.length, "package")}, in the order of the campaign.` : `${countOf(found.length, "package")} of ${rows.length}.`;
  more.hidden = found.length <= shown;
  more.textContent = `Show ${Math.min(PAGE, found.length - shown)} more`;
}

/** This function draws the list again from its first page, after a change of the filter. */
function refilter(): void {
  shown = PAGE;
  draw();
}

fillFamilies();
readAddress();
drawTiles();
drawBars("kinds", counts.byKind);
drawBars("states", counts.byState);
draw();

q.addEventListener("input", refilter);
family.addEventListener("change", refilter);
landing.addEventListener("change", refilter);
faults.addEventListener("change", refilter);
byId("filters").addEventListener("submit", (e) => e.preventDefault());
more.addEventListener("click", () => {
  shown += PAGE;
  draw();
});

// The factors of the chance that a fix lands, for the title of the landing filter.
landing.title = `A factor lowers the chance: deprecated ${LANDING.deprecated}, archived ${LANDING.archived}, pull requests only from collaborators ${LANDING.collaboratorsOnly}, closed source ${LANDING.closed}, no AI contributions ${LANDING.aiRefused}, a CLA ${LANDING.cla}.`;
