import { test, expect, describe, afterAll } from "bun:test";
import { Octokit } from "@octokit/rest";
import { ZodError } from "zod";
import { GitHubStore } from "../src/core/github-store.ts";
import { BLOG_COLLECTION } from "../schemas/blog.ts";

describe("GitHubStore write validation (offline)", () => {
  const store = new GitHubStore({ collection: BLOG_COLLECTION, owner: "x", repo: "y" });

  test("create rejects invalid input before any network call", async () => {
    // No token, no network: validation must fail first on bad frontmatter.
    await expect(
      store.create({
        slug: "ok-slug",
        title: "",
        description: "d",
        date: "not-a-date",
        body: "b",
      }),
    ).rejects.toThrow(ZodError);
  });

  test("create rejects a non-kebab slug before any network call", async () => {
    await expect(
      store.create({
        slug: "Bad Slug",
        title: "t",
        description: "d",
        date: "2026-05-21",
        body: "b",
      }),
    ).rejects.toThrow(ZodError);
  });
});

// Live write round-trip. Opt-in (LOOM_INTEGRATION=1) and needs a token with
// PR-write on enspyrco-site. Opens a real PR, asserts it, then cleans up after
// itself (closes the PR, deletes the branch). main is never touched.
const RUN = process.env.LOOM_INTEGRATION === "1" && Boolean(process.env.GITHUB_TOKEN);
const owner = "enspyrco";
const repo = "enspyrco-site";
const token = process.env.GITHUB_TOKEN;
const opened: { number: number; branch: string }[] = [];

describe.if(RUN)("GitHubStore write (live, self-cleaning)", () => {
  const store = new GitHubStore({
    collection: BLOG_COLLECTION,
    owner,
    repo,
    baseDir: "content/blog",
    branch: "main",
    token,
  });
  const slug = `loom-tracer-test-${Date.now()}`;

  afterAll(async () => {
    const octokit = new Octokit({ auth: token });
    for (const pr of opened) {
      await octokit.pulls.update({ owner, repo, pull_number: pr.number, state: "closed" }).catch(() => {});
      await octokit.git.deleteRef({ owner, repo, ref: `heads/${pr.branch}` }).catch(() => {});
    }
  });

  test("create opens a PR with the new post", async () => {
    const result = await store.create({
      slug,
      title: "Loom Tracer Test",
      description: "Ephemeral post created by the Loom write integration test.",
      date: "2026-05-21",
      tags: ["loom", "test"],
      published: false,
      body: "This post is created by an automated test and the PR is closed immediately.",
    });
    expect(result.pr).toBeDefined();
    expect(result.pr!.url).toContain("/pull/");
    expect(result.pr!.branch).toContain(`loom/blog-${slug}`);
    opened.push({ number: result.pr!.number, branch: result.pr!.branch });
    expect(result.item.title).toBe("Loom Tracer Test");
  });
});
