/**
 * The probe of the catalog. The site check of the Pages workflow starts it in a browser at each width, before the deploy.
 * A failed check stops the deploy.
 *
 * The probe drives the core of the first page: the ranked list of packages, the details of a row and the filters.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the
 * result as the body of an async function.
 */

// The site check gives these helpers to the probe.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => Element | null;
declare const $$: (selector: string) => Element[];
declare const type: (element: string | Element, text: string) => void;
declare const click: (element: string | Element) => void;

const ROWS = "#ranked li.row";
const HEAD = `${ROWS} button.head`;
/** The least count of rows on the first page of the list. The catalog has more packages than this count. */
const FEW = 10;

const count = (): string => $("#count")?.textContent?.trim() ?? "";

check("the list shows the packages", await until(() => $$(ROWS).length >= FEW), $$(ROWS).length);
check("the count names all packages", /^All \d+ packages/.test(count()), count());

click(HEAD);
const open = await until(() => $(`${ROWS}.open`));
check("the button of a row opens its details", $(HEAD)?.getAttribute("aria-expanded") === "true", $(HEAD)?.getAttribute("aria-expanded"));
check("the details show the parts of the score", (open?.querySelectorAll("table tr").length ?? 0) >= 2, open?.textContent?.slice(0, 120));
click(HEAD);
check("the button closes the details", await until(() => $(`${ROWS}.open`) === null), $(HEAD)?.getAttribute("aria-expanded"));

type("#q", "socket");
check("the package filter narrows the list", await until(() => /^\d+ packages? of \d+\.$/.test(count())), count());
const names = $$(`${HEAD} .pkg`).map((element) => element.textContent ?? "");
check("each shown package matches the filter", names.length > 0 && names.every((name) => name.toLowerCase().includes("socket")), names.slice(0, 8));
type("#q", "");
check("an empty filter shows all packages again", await until(() => /^All \d+ packages/.test(count())), count());

click("#faults");
check("the fault filter narrows the list", await until(() => /^\d+ packages? of \d+\.$/.test(count())), count());
const faults = $$(`${HEAD} .nfaults`).map((element) => element.textContent?.trim() ?? "");
check("each shown package has a fault", faults.length > 0 && faults.every((text) => /^\d+ faults?$/.test(text)), faults.slice(0, 8));
click("#faults");
check("the fault filter clears", await until(() => /^All \d+ packages/.test(count())), count());

export {};
