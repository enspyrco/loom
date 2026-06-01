import { test, expect, describe } from "bun:test";
import { GitHubStore } from "../src/core/github-store.ts";
import { BLOG_COLLECTION } from "../schemas/blog.ts";

// Live reads against the public enspyrco-site repo. Opt-in via LOOM_INTEGRATION=1
// so offline / CI-without-network runs skip it. No token needed (public repo).
const RUN = process.env.LOOM_INTEGRATION === "1";

describe.if(RUN)("GitHubStore reads (live, blog)", () => {
  const store = new GitHubStore({
    collection: BLOG_COLLECTION,
    owner: "enspyrco",
    repo: "enspyrco-site",
    baseDir: "content/blog",
    branch: "main",
    token: process.env.GITHUB_TOKEN,
  });

  test("list returns published posts from the real repo", async () => {
    const posts = await store.list();
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.published).toBe(true);
    }
  });

  test("get returns a known post with body + derived fields", async () => {
    const posts = await store.list();
    const slug = posts[0]!.slug;
    const post = await store.get(slug);
    expect(post).not.toBeNull();
    expect(post!.body.length).toBeGreaterThan(0);
    expect(post!.wordCount).toBeGreaterThan(0);
    expect(post!.readTime).toBeGreaterThanOrEqual(1);
  });

  test("get returns null for a missing slug", async () => {
    expect(await store.get("definitely-not-a-real-post-xyz")).toBeNull();
  });
});
