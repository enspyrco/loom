/**
 * The storage abstraction every surface sits on. The CLI and the (later) REST
 * layer depend only on this interface — they never know whether content lives
 * in GitHub, on disk, or in memory, nor which collection they're holding.
 * Swapping the backend swaps one constructor; swapping the collection swaps
 * the Collection passed at construction.
 */
export interface ContentStore<TInput, TOutput> {
  list(): Promise<TOutput[]>;
  get(slug: string): Promise<TOutput | null>;
  create(input: TInput): Promise<WriteResult<TOutput>>;
  update(slug: string, patch: Partial<TInput>): Promise<WriteResult<TOutput>>;
}

/** The result of a write. A git-backed store opens a PR rather than mutating
 * published content, so writes carry the PR they opened. */
export interface WriteResult<TOutput> {
  item: TOutput;
  pr?: { url: string; number: number; branch: string };
}
