/**
 * The matrix of a class: the combinations of the values of its dimensions. The dimensions come from the table
 * `classDimensions` of the catalog. The rows come from `@mark1russell7/rigor-generators`.
 */
import { coveringRows, random } from "@mark1russell7/rigor-generators";
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

/**
 * This function gives the rows of the matrix of `dimensions`: each combination, from the seed `seed`.
 *
 * Shortcut (W26-R1): a covering array with the strength of the count of the dimensions holds each combination. It
 * ends when `@mark1russell7/rigor-generators` 0.2.7 is on npm. Then `matrixRows` replaces it, with a covering array
 * of strength 2 for a large matrix.
 */
export function matrixRows(dimensions: Dimensions, seed: string): Record<string, string>[] {
  const strength = Math.max(1, Object.keys(dimensions).length);
  return coveringRows(dimensions, random(seed), { strength }) as Record<string, string>[];
}
