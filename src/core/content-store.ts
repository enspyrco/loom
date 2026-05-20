import matter from "gray-matter";
import {
  blogPostSchema,
  blogFrontmatterSchema,
  deriveFields,
  type BlogPost,
  type BlogPostInput,
  type BlogPostUpdate,
} from "../../schemas/blog.ts";

/** The result of a write. A git-backed store opens a PR rather than mutating
 * published content, so writes carry the PR they opened. */
export interface WriteResult {
  post: BlogPost;
  pr?: { url: string; number: number; branch: string };
}

/**
 * The storage abstraction every surface sits on. The CLI and the (later) REST
 * layer depend only on this interface — they never know whether content lives
 * in GitHub, on disk, or in memory. Swapping the backend swaps one constructor.
 */
export interface ContentStore {
  list(): Promise<BlogPost[]>;
  get(slug: string): Promise<BlogPost | null>;
  create(input: BlogPostInput): Promise<WriteResult>;
  update(slug: string, patch: BlogPostUpdate): Promise<WriteResult>;
}

/**
 * Serialize a validated post to the on-disk markdown+frontmatter form.
 * Inverse of {@link parsePost}. The derived fields are intentionally NOT
 * written — they are recomputed on read so they cannot go stale.
 */
export function serializePost(input: BlogPostInput): string {
  const frontmatter = blogFrontmatterSchema.parse(input);
  return matter.stringify(input.body, frontmatter);
}

/**
 * Parse a raw markdown+frontmatter file into a validated BlogPost. Throws a
 * ZodError if the frontmatter does not satisfy the schema — this is the
 * validation-on-read that keeps the corpus honest.
 */
export function parsePost(slug: string, raw: string): BlogPost {
  const { data, content } = matter(raw);
  const frontmatter = blogFrontmatterSchema.parse(data);
  return blogPostSchema.parse({
    slug,
    body: content.trim(),
    ...frontmatter,
    ...deriveFields(content),
  });
}

/** The conventional path for a blog post in the content repo. */
export function blogPath(slug: string, baseDir = "content/blog"): string {
  return `${baseDir}/${slug}.md`;
}
