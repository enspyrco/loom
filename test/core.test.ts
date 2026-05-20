import { test, expect, describe } from "bun:test";
import { ZodError } from "zod";
import { blogPostInputSchema } from "../schemas/blog.ts";
import { serializePost, parsePost } from "../src/core/content-store.ts";
import { MemoryStore } from "../src/core/memory-store.ts";

const SAMPLE = `---
title: "Agentic Engineering"
description: "What it means to engineer systems where AI agents are first-class participants."
date: "2026-05-07"
tags: ["agentic", "ai"]
published: true
---
Agents are first-class participants here. This is the body of the post.`;

describe("schema round-trip", () => {
  test("parse → serialize → parse is stable", () => {
    const post = parsePost("agentic-engineering", SAMPLE);
    expect(post.title).toBe("Agentic Engineering");
    expect(post.tags).toEqual(["agentic", "ai"]);
    expect(post.published).toBe(true);
    expect(post.wordCount).toBeGreaterThan(0);
    expect(post.readTime).toBeGreaterThanOrEqual(1);

    const reparsed = parsePost("agentic-engineering", serializePost(post));
    expect(reparsed.title).toBe(post.title);
    expect(reparsed.body).toBe(post.body);
    expect(reparsed.tags).toEqual(post.tags);
  });

  test("derived fields are not written to frontmatter", () => {
    const post = parsePost("x", SAMPLE);
    const serialized = serializePost(post);
    expect(serialized).not.toContain("wordCount");
    expect(serialized).not.toContain("readTime");
  });

  test("malformed frontmatter is rejected on read", () => {
    const bad = `---\ntitle: ""\ndescription: "d"\ndate: "nope"\n---\nbody`;
    expect(() => parsePost("bad", bad)).toThrow(ZodError);
  });

  test("create input rejects non-kebab slug", () => {
    const r = blogPostInputSchema.safeParse({
      slug: "Not Kebab",
      title: "t",
      description: "d",
      date: "2026-05-07",
      body: "b",
    });
    expect(r.success).toBe(false);
  });
});

describe("MemoryStore", () => {
  const seed = { "agentic-engineering": SAMPLE };

  test("list returns published posts", async () => {
    const store = new MemoryStore(seed);
    const posts = await store.list();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.slug).toBe("agentic-engineering");
  });

  test("get returns one post with body", async () => {
    const store = new MemoryStore(seed);
    const post = await store.get("agentic-engineering");
    expect(post).not.toBeNull();
    expect(post!.body).toContain("first-class participants");
  });

  test("get returns null for missing slug", async () => {
    const store = new MemoryStore(seed);
    expect(await store.get("nope")).toBeNull();
  });

  test("create opens a PR and persists", async () => {
    const store = new MemoryStore();
    const result = await store.create({
      slug: "new-post",
      title: "New Post",
      description: "A new post.",
      date: "2026-05-21",
      tags: ["x"],
      published: true,
      body: "Hello from the new post body.",
    });
    expect(result.pr).toBeDefined();
    expect(result.pr!.branch).toBe("loom/blog-new-post");
    expect((await store.get("new-post"))!.title).toBe("New Post");
  });

  test("create rejects missing title before any write", async () => {
    const store = new MemoryStore();
    await expect(
      store.create({
        slug: "bad",
        title: "",
        description: "d",
        date: "2026-05-21",
        body: "b",
      }),
    ).rejects.toThrow();
    expect(await store.get("bad")).toBeNull();
  });

  test("create rejects duplicate slug", async () => {
    const store = new MemoryStore(seed);
    await expect(
      store.create({
        slug: "agentic-engineering",
        title: "Dup",
        description: "d",
        date: "2026-05-21",
        body: "b",
      }),
    ).rejects.toThrow("already exists");
  });

  test("update merges a patch and reopens a PR", async () => {
    const store = new MemoryStore(seed);
    const result = await store.update("agentic-engineering", {
      description: "Updated description.",
    });
    expect(result.pr).toBeDefined();
    const post = await store.get("agentic-engineering");
    expect(post!.description).toBe("Updated description.");
    expect(post!.title).toBe("Agentic Engineering");
  });

  test("update throws for missing slug", async () => {
    const store = new MemoryStore();
    await expect(store.update("ghost", { title: "x" })).rejects.toThrow("not found");
  });
});
