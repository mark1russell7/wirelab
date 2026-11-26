/**
 * The matrix of a class: the combinations of the values of its dimensions. The dimensions come from the table
 * `classDimensions` of the catalog. The rows come from `matrixRows` of `@mark1russell7/rigor-generators`.
 */
import type { ClassDimension } from "@wirelab/catalog";

/** The values of each dimension of a class, in the order of the field `order`. */
export type Dimensions = Readonly<Record<string, readonly string[]>>;

/**
 * This function gives the dimensions of `classId` from the rows of `classDimensions`. With `only`, it keeps only these
 * dimensions. A target sets the other dimensions, for example the width of its prefix.
 */
export function dimensionsOf(rows: readonly ClassDimension[], classId: string, only?: readonly string[]): Dimensions {
  const out: Record<string, { order: number; value: string }[]> = {};
  for (const row of rows) {
    if (row.class !== classId) continue;
    if (only !== undefined && !only.includes(row.dimension)) continue;
    (out[row.dimension] ??= []).push({ order: row.order, value: row.value });
  }
  return Object.fromEntries(
    Object.entries(out).map(([name, values]) => [name, values.sort((a, b) => a.order - b.order).map((one) => one.value)]),
  );
}
