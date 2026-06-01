import { z } from "zod";
import matter from "gray-matter";
import type { Collection } from "../src/core/collection.ts";

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

export const blogPostInputSchema = blogFrontmatterSchema.extend({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
  body: z.string().min(1, "body is required"),
});

export const blogPostSchema = blogPostInputSchema.extend({
  wordCount: z.number().int().nonnegative(),
  readTime: z.number().int().positive(),
});

export const blogPostUpdateSchema = blogPostInputSchema.omit({ slug: true }).partial();

export type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>;
export type BlogPostInput = z.input<typeof blogPostInputSchema>;
export type BlogPost = z.output<typeof blogPostSchema>;
export type BlogPostUpdate = z.input<typeof blogPostUpdateSchema>;

/** Recompute the derived fields from a markdown body. */
export function deriveFields(body: string): { wordCount: number; readTime: number } {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.round(wordCount / 200));
  return { wordCount, readTime };
}

/**
 * The blog Collection. Serializes to markdown+frontmatter via gray-matter;
 * derived fields (wordCount, readTime) are recomputed on every read so they
 * cannot drift from the body.
 */
export const BLOG_COLLECTION: Collection<BlogPostInput, BlogPost> = {
  name: "blog",
  dir: "content/blog",
  ext: ".md",
  inputSchema: blogPostInputSchema,
  outputSchema: blogPostSchema,
  updateSchema: blogPostUpdateSchema,

  serialize(input) {
    const frontmatter = blogFrontmatterSchema.parse(input);
    return matter.stringify(input.body, frontmatter);
  },

  parse(slug, raw) {
    const { data, content } = matter(raw);
    const frontmatter = blogFrontmatterSchema.parse(data);
    return blogPostSchema.parse({
      slug,
      body: content.trim(),
      ...frontmatter,
      ...deriveFields(content),
    });
  },

  listFilter: (post) => post.published,
  listSort: (a, b) => (a.date > b.date ? -1 : 1),
};
