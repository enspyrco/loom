import { z } from "zod";

/**
 * The blog collection schema — the single source of truth.
 *
 * This one definition is what makes Loom "agent-native": it drives REST
 * validation, the CLI's argument validation, generated TypeScript types,
 * and (later) the form UI and MCP tool shapes. There is nothing parallel
 * to keep in sync because everything reads from here.
 *
 * Storage shape: a blog post is a markdown file with YAML frontmatter at
 * `content/blog/<slug>.md` in the content repo. The frontmatter fields are
 * the schema below; the markdown body is `body`.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

/** The YAML frontmatter block of a blog post. */
export const blogFrontmatterSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().min(1, "description is required"),
  date: isoDate,
  tags: z.array(z.string()).default([]),
  published: z.boolean().default(true),
});

/**
 * The writable shape of a blog post — what `create` and `update` accept.
 * Frontmatter fields plus the markdown body and the slug (which becomes the
 * filename). This is the canonical schema; read and frontmatter shapes are
 * derived from it so there is exactly one place to change a field.
 */
export const blogPostInputSchema = blogFrontmatterSchema.extend({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
  body: z.string().min(1, "body is required"),
});

/**
 * The full read result — the writable shape plus fields Loom derives at read
 * time (never stored). Derived fields are recomputed on every read so they
 * cannot drift from the body.
 */
export const blogPostSchema = blogPostInputSchema.extend({
  wordCount: z.number().int().nonnegative(),
  readTime: z.number().int().positive(),
});

/** Partial update: any writable field except slug (slug identifies the file). */
export const blogPostUpdateSchema = blogPostInputSchema.omit({ slug: true }).partial();

export type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>;
// Input type: `.default()` fields (tags, published) are optional to callers.
export type BlogPostInput = z.input<typeof blogPostInputSchema>;
// Output type: defaults applied, derived fields present.
export type BlogPost = z.output<typeof blogPostSchema>;
export type BlogPostUpdate = z.input<typeof blogPostUpdateSchema>;

/** Recompute the derived fields from a markdown body. Single definition so
 * the CLI, REST layer, and the site's own loader can agree on the numbers. */
export function deriveFields(body: string): { wordCount: number; readTime: number } {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.round(wordCount / 200));
  return { wordCount, readTime };
}
