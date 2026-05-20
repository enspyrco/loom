import {
  blogPostInputSchema,
  blogPostUpdateSchema,
  type BlogPost,
  type BlogPostInput,
  type BlogPostUpdate,
} from "../../schemas/blog.ts";
import { serializePost, parsePost, type ContentStore, type WriteResult } from "./content-store.ts";

/**
 * In-memory ContentStore for tests. Stores posts as their serialized
 * markdown+frontmatter strings so it exercises the same serialize/parse path
 * as the git-backed store — the only thing it fakes is where the bytes live.
 *
 * Writes return a synthetic PR so callers can assert on the write-opens-a-PR
 * contract without hitting GitHub.
 */
export class MemoryStore implements ContentStore {
  private files = new Map<string, string>();
  private prCounter = 0;

  constructor(seed: Record<string, string> = {}) {
    for (const [slug, raw] of Object.entries(seed)) this.files.set(slug, raw);
  }

  async list(): Promise<BlogPost[]> {
    return [...this.files.entries()]
      .map(([slug, raw]) => parsePost(slug, raw))
      .filter((p) => p.published)
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }

  async get(slug: string): Promise<BlogPost | null> {
    const raw = this.files.get(slug);
    return raw ? parsePost(slug, raw) : null;
  }

  async create(input: BlogPostInput): Promise<WriteResult> {
    const validated = blogPostInputSchema.parse(input);
    if (this.files.has(validated.slug)) {
      throw new Error(`post '${validated.slug}' already exists`);
    }
    const raw = serializePost(validated);
    this.files.set(validated.slug, raw);
    return this.writeResult(validated.slug, raw);
  }

  async update(slug: string, patch: BlogPostUpdate): Promise<WriteResult> {
    const existing = await this.get(slug);
    if (!existing) throw new Error(`post '${slug}' not found`);
    const validatedPatch = blogPostUpdateSchema.parse(patch);
    const merged = blogPostInputSchema.parse({ ...existing, ...validatedPatch, slug });
    const raw = serializePost(merged);
    this.files.set(slug, raw);
    return this.writeResult(slug, raw);
  }

  private writeResult(slug: string, raw: string): WriteResult {
    const number = ++this.prCounter;
    return {
      post: parsePost(slug, raw),
      pr: {
        url: `memory://pr/${number}`,
        number,
        branch: `loom/blog-${slug}`,
      },
    };
  }
}
