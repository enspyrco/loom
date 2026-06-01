import { Octokit } from "@octokit/rest";
import type { Collection } from "./collection.ts";
import { pathFor } from "./collection.ts";
import type { ContentStore, WriteResult } from "./content-store.ts";

export interface GitHubStoreConfig<TInput, TOutput> {
  collection: Collection<TInput, TOutput>;
  owner: string;
  repo: string;
  /** Directory within the repo holding the collection. Defaults to collection.dir. */
  baseDir?: string;
  /** Branch to read from / base PRs against. */
  branch?: string;
  /** Required for writes; optional for reads of a public repo. */
  token?: string;
}

/**
 * A ContentStore backed by the GitHub API. Reads pull file contents directly;
 * writes never touch the base branch — they create a feature branch, commit
 * the file, and open a PR. That makes the write path safe to expose widely:
 * the worst an authorized caller can do is *propose* a change.
 *
 * Generic over the Collection — the store knows nothing about markdown,
 * JSON, frontmatter, or any specific schema. Format choice rides
 * `collection.serialize`/`collection.parse`; file extension rides
 * `collection.ext`. Adding a third collection requires zero changes here.
 */
export class GitHubStore<TInput, TOutput> implements ContentStore<TInput, TOutput> {
  private octokit: Octokit;
  private collection: Collection<TInput, TOutput>;
  private owner: string;
  private repo: string;
  private baseDir: string;
  private branch: string;
  private hasToken: boolean;

  constructor(config: GitHubStoreConfig<TInput, TOutput>) {
    this.collection = config.collection;
    this.owner = config.owner;
    this.repo = config.repo;
    this.baseDir = config.baseDir ?? config.collection.dir;
    this.branch = config.branch ?? "main";
    this.hasToken = Boolean(config.token);
    this.octokit = new Octokit(config.token ? { auth: config.token } : {});
  }

  async list(): Promise<TOutput[]> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path: this.baseDir,
      ref: this.branch,
    });
    if (!Array.isArray(data)) {
      throw new Error(`${this.baseDir} is not a directory`);
    }
    const ext = this.collection.ext;
    const slugs = data
      .filter((e) => e.type === "file" && e.name.endsWith(ext))
      .map((e) => e.name.slice(0, -ext.length));
    const items = await Promise.all(slugs.map((s) => this.get(s)));
    let result = items.filter((i) => i !== null) as TOutput[];
    if (this.collection.listFilter) result = result.filter(this.collection.listFilter);
    if (this.collection.listSort) result.sort(this.collection.listSort);
    return result;
  }

  async get(slug: string): Promise<TOutput | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: pathFor(this.collection, slug, this.baseDir),
        ref: this.branch,
      });
      if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
        return null;
      }
      const raw = Buffer.from(data.content, "base64").toString("utf-8");
      return this.collection.parse(slug, raw);
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  async create(input: TInput): Promise<WriteResult<TOutput>> {
    const validated = this.collection.inputSchema.parse(input);
    const slug = (validated as { slug: string }).slug;
    if (await this.get(slug)) {
      throw new Error(`${this.collection.name} '${slug}' already exists`);
    }
    const raw = this.collection.serialize(validated);
    return this.commitViaPR({
      slug,
      raw,
      message: `${this.collection.name}: add ${slug}`,
      title: `Add ${this.collection.name}: ${slug}`,
    });
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
    return this.commitViaPR({
      slug,
      raw,
      message: `${this.collection.name}: update ${slug}`,
      title: `Update ${this.collection.name}: ${slug}`,
    });
  }

  /**
   * The write primitive: branch off the base, commit the file, open a PR.
   * Shared by create and update. Requires a token.
   */
  private async commitViaPR(args: {
    slug: string;
    raw: string;
    message: string;
    title: string;
  }): Promise<WriteResult<TOutput>> {
    if (!this.hasToken) {
      throw new Error("a token is required for writes");
    }
    const { owner, repo, baseDir, branch: base } = this;
    const path = pathFor(this.collection, args.slug, baseDir);
    const head = `loom/${this.collection.name}-${args.slug}-${Date.now()}`;

    const baseRef = await this.octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${base}`,
    });
    await this.octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${head}`,
      sha: baseRef.data.object.sha,
    });

    let sha: string | undefined;
    try {
      const existing = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: head,
      });
      if (!Array.isArray(existing.data) && "sha" in existing.data) {
        sha = existing.data.sha;
      }
    } catch (err: any) {
      if (err?.status !== 404) throw err;
    }
    await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      branch: head,
      message: args.message,
      content: Buffer.from(args.raw, "utf-8").toString("base64"),
      sha,
    });

    const pr = await this.octokit.pulls.create({
      owner,
      repo,
      base,
      head,
      title: args.title,
      body: `Opened by Loom CLI. Validated against the ${this.collection.name} schema.\n\nCollection: \`${baseDir}\` · slug: \`${args.slug}\``,
    });

    return {
      item: this.collection.parse(args.slug, args.raw),
      pr: { url: pr.data.html_url, number: pr.data.number, branch: head },
    };
  }
}
