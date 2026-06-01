import type { Collection } from "./collection.ts";
import type { ContentStore, WriteResult } from "./content-store.ts";

/**
 * In-memory ContentStore for tests. Stores items as their serialized bytes so
 * it exercises the same serialize/parse path as the git-backed store — the
 * only thing it fakes is where the bytes live.
 *
 * Generic over the Collection so the same fake serves any collection.
 */
export class MemoryStore<TInput, TOutput> implements ContentStore<TInput, TOutput> {
  private files = new Map<string, string>();
  private prCounter = 0;

  constructor(
    private collection: Collection<TInput, TOutput>,
    seed: Record<string, string> = {},
  ) {
    for (const [slug, raw] of Object.entries(seed)) this.files.set(slug, raw);
  }

  async list(): Promise<TOutput[]> {
    const items = [...this.files.entries()].map(([slug, raw]) =>
      this.collection.parse(slug, raw),
    );
    const filtered = this.collection.listFilter
      ? items.filter(this.collection.listFilter)
      : items;
    if (this.collection.listSort) filtered.sort(this.collection.listSort);
    return filtered;
  }

  async get(slug: string): Promise<TOutput | null> {
    const raw = this.files.get(slug);
    return raw ? this.collection.parse(slug, raw) : null;
  }

  async create(input: TInput): Promise<WriteResult<TOutput>> {
    const validated = this.collection.inputSchema.parse(input);
    const slug = (validated as { slug: string }).slug;
    if (this.files.has(slug)) {
      throw new Error(`${this.collection.name} '${slug}' already exists`);
    }
    const raw = this.collection.serialize(validated);
    this.files.set(slug, raw);
    return this.writeResult(slug, raw);
  }

  async update(slug: string, patch: Partial<TInput>): Promise<WriteResult<TOutput>> {
    const existing = await this.get(slug);
    if (!existing) throw new Error(`${this.collection.name} '${slug}' not found`);
    const validatedPatch = this.collection.updateSchema.parse(patch);
    const merged = this.collection.inputSchema.parse({
      ...(existing as object),
      ...(validatedPatch as object),
      slug,
    });
    const raw = this.collection.serialize(merged);
    this.files.set(slug, raw);
    return this.writeResult(slug, raw);
  }

  private writeResult(slug: string, raw: string): WriteResult<TOutput> {
    const number = ++this.prCounter;
    return {
      item: this.collection.parse(slug, raw),
      pr: {
        url: `memory://pr/${number}`,
        number,
        branch: `loom/${this.collection.name}-${slug}`,
      },
    };
  }
}
