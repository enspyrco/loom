import type { z } from "zod";

/**
 * A Collection bundles everything that makes one content type different from
 * another: its schemas, its on-disk format, its file extension, and the small
 * bits of metadata used when opening PRs. Stores depend only on this bundle —
 * they never import a specific collection's schema directly.
 *
 * The point of pulling format choice (markdown+frontmatter vs JSON) into
 * `serialize`/`parse` is that the store doesn't need to know. Blog posts ride
 * gray-matter; project records ride `JSON.parse`. Same store, different
 * collection, same write-via-PR contract.
 */
export interface Collection<TInput, TOutput> {
  /** Stable identifier — first positional arg on the CLI (`loom <name> ...`). */
  readonly name: string;

  /** Default directory inside the content repo (e.g. `content/blog`). */
  readonly dir: string;

  /** File extension including the leading dot (`.md`, `.json`). */
  readonly ext: string;

  /** Validates create input. `slug` rules live inside this schema.
   *  3-arg form because schemas with `.default(...)` have a narrower `_input` than `_output`. */
  readonly inputSchema: z.ZodType<any, z.ZodTypeDef, TInput>;

  /** Validates a parsed file end-to-end (input fields + any derived fields). */
  readonly outputSchema: z.ZodType<TOutput, z.ZodTypeDef, any>;

  /** Partial-update schema; must not allow changing `slug`. */
  readonly updateSchema: z.ZodType<any, z.ZodTypeDef, Partial<TInput>>;

  /** Serialize a validated input to the bytes that hit disk. */
  serialize(input: TInput): string;

  /** Parse raw file bytes for `slug` into a validated output. Throws ZodError on bad data. */
  parse(slug: string, raw: string): TOutput;

  /** Optional filter applied to `list()` results (e.g. blog filters by `published`). */
  listFilter?(item: TOutput): boolean;

  /** Optional sort applied to `list()` results. Defaults to slug ASC if absent. */
  listSort?(a: TOutput, b: TOutput): number;
}

/** Conventional file path for a slug inside a base directory. */
export function pathFor<TInput, TOutput>(
  collection: Collection<TInput, TOutput>,
  slug: string,
  baseDir: string,
): string {
  return `${baseDir}/${slug}${collection.ext}`;
}
