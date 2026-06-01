import { test, expect, describe } from "bun:test";
import { ZodError } from "zod";
import {
  PROJECTS_COLLECTION,
  projectInputSchema,
  type ProjectInput,
} from "../schemas/project.ts";
import { MemoryStore } from "../src/core/memory-store.ts";

const SAMPLE: ProjectInput = {
  slug: "tech_world",
  name: "Tech World",
  org: "enspyrco",
  description: "A multiplayer 2D virtual world where players solve coding challenges together.",
  categories: ["Education"],
  languages: ["Dart"],
  tech: ["Flutter", "Flame", "Firebase", "LiveKit"],
  githubUrl: "https://github.com/enspyrco/tech_world",
  featured: true,
};

describe("PROJECTS_COLLECTION round-trip (JSON)", () => {
  test("parse → serialize → parse is stable", () => {
    const raw = PROJECTS_COLLECTION.serialize(SAMPLE);
    const parsed = PROJECTS_COLLECTION.parse("tech_world", raw);
    expect(parsed.name).toBe("Tech World");
    expect(parsed.org).toBe("enspyrco");
    expect(parsed.categories).toEqual(["Education"]);
    expect(parsed.featured).toBe(true);
    expect(parsed.slug).toBe("tech_world");
  });

  test("slug is not written to the file body (file path carries it)", () => {
    const raw = PROJECTS_COLLECTION.serialize(SAMPLE);
    const obj = JSON.parse(raw);
    expect(obj.slug).toBeUndefined();
    expect(obj.name).toBe("Tech World");
  });

  test("snake_case slug is accepted", () => {
    const r = projectInputSchema.safeParse({ ...SAMPLE, slug: "github_desktop_flutter" });
    expect(r.success).toBe(true);
  });

  test("kebab-case slug is accepted", () => {
    const r = projectInputSchema.safeParse({ ...SAMPLE, slug: "virtual-creatures" });
    expect(r.success).toBe(true);
  });

  test("uppercase / spaces in slug are rejected", () => {
    expect(projectInputSchema.safeParse({ ...SAMPLE, slug: "Tech World" }).success).toBe(false);
    expect(projectInputSchema.safeParse({ ...SAMPLE, slug: "techWorld" }).success).toBe(false);
  });

  test("unknown org enum value is rejected", () => {
    const r = projectInputSchema.safeParse({ ...SAMPLE, org: "google" });
    expect(r.success).toBe(false);
  });

  test("unknown category is rejected", () => {
    const r = projectInputSchema.safeParse({ ...SAMPLE, categories: ["Unknown"] });
    expect(r.success).toBe(false);
  });

  test("non-URL githubUrl is rejected", () => {
    const r = projectInputSchema.safeParse({ ...SAMPLE, githubUrl: "not-a-url" });
    expect(r.success).toBe(false);
  });

  test("empty categories array is rejected", () => {
    const r = projectInputSchema.safeParse({ ...SAMPLE, categories: [] });
    expect(r.success).toBe(false);
  });

  test("malformed JSON is rejected on read", () => {
    expect(() => PROJECTS_COLLECTION.parse("x", "{not json")).toThrow();
  });

  test("missing required field in JSON is rejected", () => {
    const bad = JSON.stringify({ org: "enspyrco" });
    expect(() => PROJECTS_COLLECTION.parse("x", bad)).toThrow(ZodError);
  });
});

describe("MemoryStore + PROJECTS_COLLECTION", () => {
  test("create persists and round-trips through JSON", async () => {
    const store = new MemoryStore(PROJECTS_COLLECTION);
    const result = await store.create(SAMPLE);
    expect(result.pr!.branch).toBe("loom/projects-tech_world");

    const got = await store.get("tech_world");
    expect(got).not.toBeNull();
    expect(got!.name).toBe("Tech World");
    expect(got!.tech).toEqual(["Flutter", "Flame", "Firebase", "LiveKit"]);
  });

  test("list sorts featured first, then by name", async () => {
    const store = new MemoryStore(PROJECTS_COLLECTION);
    await store.create({ ...SAMPLE, slug: "zed", name: "Zed", featured: false });
    await store.create({ ...SAMPLE, slug: "alpha", name: "Alpha", featured: true });
    await store.create({ ...SAMPLE, slug: "beta", name: "Beta", featured: false });
    const items = await store.list();
    expect(items.map((p) => p.slug)).toEqual(["alpha", "beta", "zed"]);
  });

  test("update merges a patch", async () => {
    const store = new MemoryStore(PROJECTS_COLLECTION);
    await store.create(SAMPLE);
    await store.update("tech_world", { description: "Updated." });
    const post = await store.get("tech_world");
    expect(post!.description).toBe("Updated.");
    expect(post!.name).toBe("Tech World");
  });

  test("create rejects duplicate slug", async () => {
    const store = new MemoryStore(PROJECTS_COLLECTION);
    await store.create(SAMPLE);
    await expect(store.create(SAMPLE)).rejects.toThrow("already exists");
  });

  test("update rejects unknown slug", async () => {
    const store = new MemoryStore(PROJECTS_COLLECTION);
    await expect(store.update("ghost", { name: "x" })).rejects.toThrow("not found");
  });
});
