import { Octokit } from "@octokit/rest";
import {
  blogPostInputSchema,
  blogPostUpdateSchema,
  type BlogPost,
  type BlogPostInput,
  type BlogPostUpdate,
} from "../../schemas/blog.ts";
import {
  parsePost,
  serializePost,
  blogPath,
  type ContentStore,
  type WriteResult,
} from "./content-store.ts";

export interface GitHubStoreConfig {
  owner: string;
  repo: string;
  /** Directory within the repo holding the collection. */
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
 */
export class GitHubStore implements ContentStore {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private baseDir: string;
  private branch: string;
  private hasToken: boolean;

  constructor(config: GitHubStoreConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.baseDir = config.baseDir ?? "content/blog";
    this.branch = config.branch ?? "main";
    this.hasToken = Boolean(config.token);
    this.octokit = new Octokit(config.token ? { auth: config.token } : {});
  }

  async list(): Promise<BlogPost[]> {
    const { data } = await this.octokit.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path: this.baseDir,
      ref: this.branch,
    });
    if (!Array.isArray(data)) {
      throw new Error(`${this.baseDir} is not a directory`);
    }
    const slugs = data
      .filter((e) => e.type === "file" && e.name.endsWith(".md"))
      .map((e) => e.name.replace(/\.md$/, ""));
    const posts = await Promise.all(slugs.map((s) => this.get(s)));
    return posts
      .filter((p): p is BlogPost => p !== null && p.published)
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }

  async get(slug: string): Promise<BlogPost | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path: blogPath(slug, this.baseDir),
        ref: this.branch,
      });
      if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
        return null;
      }
      const raw = Buffer.from(data.content, "base64").toString("utf-8");
      return parsePost(slug, raw);
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  async create(input: BlogPostInput): Promise<WriteResult> {
    const validated = blogPostInputSchema.parse(input);
    if (await this.get(validated.slug)) {
      throw new Error(`post '${validated.slug}' already exists`);
    }
    const raw = serializePost(validated);
    return this.commitViaPR({
      slug: validated.slug,
      raw,
      message: `blog: add ${validated.slug}`,
      title: `Add blog post: ${validated.title}`,
    });
  }

  async update(slug: string, patch: BlogPostUpdate): Promise<WriteResult> {
    const existing = await this.get(slug);
    if (!existing) throw new Error(`post '${slug}' not found`);
    const validatedPatch = blogPostUpdateSchema.parse(patch);
    const merged = blogPostInputSchema.parse({ ...existing, ...validatedPatch, slug });
    const raw = serializePost(merged);
    return this.commitViaPR({
      slug,
      raw,
      message: `blog: update ${slug}`,
      title: `Update blog post: ${merged.title}`,
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
  }): Promise<WriteResult> {
    if (!this.hasToken) {
      throw new Error("a token is required for writes");
    }
    const { owner, repo, baseDir, branch: base } = this;
    const path = blogPath(args.slug, baseDir);
    const head = `loom/blog-${args.slug}-${Date.now()}`;

    // Branch off the current base tip.
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

    // Create or update the file on the new branch (update needs the blob sha).
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
      body: `Opened by Loom CLI. Validated against the blog schema.\n\nCollection: \`${baseDir}\` · slug: \`${args.slug}\``,
    });

    return {
      post: parsePost(args.slug, args.raw),
      pr: { url: pr.data.html_url, number: pr.data.number, branch: head },
    };
  }
}
