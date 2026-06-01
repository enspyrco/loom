#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, readSync } from "node:fs";
import { ZodError } from "zod";
import { GitHubStore } from "../core/github-store.ts";
import type { Collection } from "../core/collection.ts";
import { getCollection, collectionNames } from "../core/collections.ts";
import type { BlogPostInput, BlogPostUpdate, BlogPost } from "../../schemas/blog.ts";
import type { ProjectInput, ProjectUpdate, Project } from "../../schemas/project.ts";

function storeFromEnv<TInput, TOutput>(collection: Collection<TInput, TOutput>) {
  return new GitHubStore<TInput, TOutput>({
    collection,
    owner: process.env.LOOM_CONTENT_OWNER ?? "enspyrco",
    repo: process.env.LOOM_CONTENT_REPO ?? "enspyrco-site",
    baseDir: process.env.LOOM_CONTENT_DIR ?? collection.dir,
    branch: process.env.LOOM_CONTENT_BRANCH ?? "main",
    token: process.env.GITHUB_TOKEN ?? process.env.LOOM_TOKEN,
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolve a markdown body from --body, --body-file (- = stdin), or $EDITOR. */
function resolveBody(flags: Record<string, unknown>): string {
  if (typeof flags.body === "string") return flags.body;
  if (typeof flags["body-file"] === "string") {
    const path = flags["body-file"];
    return path === "-" ? readStdin() : readFileSync(path, "utf-8").trim();
  }
  return openEditor();
}

function readStdin(): string {
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(65536);
  let bytes: number;
  while ((bytes = readSync(0, buf, 0, buf.length, null)) > 0) {
    chunks.push(Buffer.from(buf.subarray(0, bytes)));
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

function openEditor(): string {
  const editor = process.env.EDITOR ?? "vi";
  const file = join(tmpdir(), `loom-${Date.now()}.md`);
  writeFileSync(file, "");
  const res = spawnSync(editor, [file], { stdio: "inherit" });
  if (res.status !== 0) throw new Error("editor exited non-zero; aborting");
  const body = readFileSync(file, "utf-8").trim();
  unlinkSync(file);
  if (!body) throw new Error("empty body; aborting");
  return body;
}

function csv(v: unknown): string[] | undefined {
  if (typeof v !== "string") return undefined;
  return v.split(",").map((t) => t.trim()).filter(Boolean);
}

// ---------- generic verbs (collection-agnostic) ----------

async function cmdList<TInput, TOutput>(collection: Collection<TInput, TOutput>) {
  const items = await storeFromEnv(collection).list();
  if (items.length === 0) {
    console.log(`(no ${collection.name})`);
    return;
  }
  for (const i of items) renderListRow(collection.name, i);
}

function renderListRow(name: string, item: any) {
  if (name === "blog") {
    console.log(`${item.date}  ${String(item.slug).padEnd(36)}  ${item.title}`);
  } else if (name === "projects") {
    const star = item.featured ? "★" : " ";
    console.log(`${star} ${String(item.slug).padEnd(28)}  ${item.org.padEnd(16)}  ${item.name}`);
  } else {
    console.log(item.slug);
  }
}

async function cmdGet<TInput, TOutput>(
  collection: Collection<TInput, TOutput>,
  slug: string | undefined,
) {
  if (!slug) throw new Error(`usage: loom ${collection.name} get <slug>`);
  const item = await storeFromEnv(collection).get(slug);
  if (!item) {
    console.error(`not found: ${slug}`);
    process.exitCode = 1;
    return;
  }
  if (collection.name === "blog") renderBlog(item as unknown as BlogPost);
  else console.log(JSON.stringify(item, null, 2));
}

function renderBlog(post: BlogPost) {
  console.log(`# ${post.title}`);
  console.log(`slug: ${post.slug} · date: ${post.date} · tags: ${post.tags.join(", ") || "(none)"}`);
  console.log(`published: ${post.published} · ${post.wordCount} words · ${post.readTime} min read`);
  console.log("---");
  console.log(post.body);
}

// ---------- per-collection input builders ----------

function buildBlogCreate(flags: Record<string, unknown>): BlogPostInput {
  const title = flags.title;
  const description = flags.description;
  if (typeof title !== "string" || typeof description !== "string") {
    throw new Error(blogCreateUsage());
  }
  return {
    slug: typeof flags.slug === "string" ? flags.slug : slugify(title),
    title,
    description,
    date: typeof flags.date === "string" ? flags.date : today(),
    tags: csv(flags.tags) ?? [],
    published: flags.draft !== true,
    body: resolveBody(flags),
  };
}

function buildBlogUpdate(flags: Record<string, unknown>): BlogPostUpdate {
  const patch: BlogPostUpdate = {};
  if (typeof flags.title === "string") patch.title = flags.title;
  if (typeof flags.description === "string") patch.description = flags.description;
  if (typeof flags.date === "string") patch.date = flags.date;
  const tags = csv(flags.tags);
  if (tags) patch.tags = tags;
  if (flags.publish === true) patch.published = true;
  if (flags.draft === true) patch.published = false;
  if (typeof flags.body === "string" || typeof flags["body-file"] === "string") {
    patch.body = resolveBody(flags);
  }
  return patch;
}

function buildProjectCreate(flags: Record<string, unknown>): ProjectInput {
  const name = flags.name;
  const description = flags.description;
  const org = flags.org;
  const githubUrl = flags["github-url"];
  if (
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof org !== "string" ||
    typeof githubUrl !== "string"
  ) {
    throw new Error(projectCreateUsage());
  }
  const categories = csv(flags.categories);
  if (!categories || categories.length === 0) {
    throw new Error("at least one --categories value is required (CSV)");
  }
  return {
    slug: typeof flags.slug === "string" ? flags.slug : slugify(name),
    name,
    org: org as ProjectInput["org"],
    description,
    categories: categories as ProjectInput["categories"],
    languages: csv(flags.languages) ?? [],
    tech: csv(flags.tech) ?? [],
    githubUrl,
    imageUrl: typeof flags["image-url"] === "string" ? flags["image-url"] : undefined,
    videoUrl: typeof flags["video-url"] === "string" ? flags["video-url"] : undefined,
    featured: flags.featured === true,
    note: typeof flags.note === "string" ? flags.note : undefined,
  };
}

function buildProjectUpdate(flags: Record<string, unknown>): ProjectUpdate {
  const patch: ProjectUpdate = {};
  if (typeof flags.name === "string") patch.name = flags.name;
  if (typeof flags.description === "string") patch.description = flags.description;
  if (typeof flags.org === "string") patch.org = flags.org as ProjectInput["org"];
  if (typeof flags["github-url"] === "string") patch.githubUrl = flags["github-url"] as string;
  if (typeof flags["image-url"] === "string") patch.imageUrl = flags["image-url"] as string;
  if (typeof flags["video-url"] === "string") patch.videoUrl = flags["video-url"] as string;
  if (typeof flags.note === "string") patch.note = flags.note;
  const categories = csv(flags.categories);
  if (categories) patch.categories = categories as ProjectInput["categories"];
  const languages = csv(flags.languages);
  if (languages) patch.languages = languages;
  const tech = csv(flags.tech);
  if (tech) patch.tech = tech;
  if (flags.featured === true) patch.featured = true;
  if (flags.unfeature === true) patch.featured = false;
  return patch;
}

// ---------- create / edit dispatch ----------

async function cmdCreate(name: string, flags: Record<string, unknown>) {
  if (name === "blog") {
    const input = buildBlogCreate(flags);
    const collection = getCollection("blog")! as Collection<BlogPostInput, BlogPost>;
    const result = await storeFromEnv(collection).create(input);
    console.log(`opened PR: ${result.pr?.url}`);
    console.log(`branch:    ${result.pr?.branch}`);
    return;
  }
  if (name === "projects") {
    const input = buildProjectCreate(flags);
    const collection = getCollection("projects")! as Collection<ProjectInput, Project>;
    const result = await storeFromEnv(collection).create(input);
    console.log(`opened PR: ${result.pr?.url}`);
    console.log(`branch:    ${result.pr?.branch}`);
    return;
  }
  throw new Error(`create not implemented for collection: ${name}`);
}

async function cmdEdit(name: string, slug: string | undefined, flags: Record<string, unknown>) {
  if (!slug) throw new Error(`usage: loom ${name} edit <slug> [flags]`);
  if (name === "blog") {
    const patch = buildBlogUpdate(flags);
    if (Object.keys(patch).length === 0) {
      throw new Error("nothing to update — pass at least one field flag");
    }
    const collection = getCollection("blog")! as Collection<BlogPostInput, BlogPost>;
    const result = await storeFromEnv(collection).update(slug, patch);
    console.log(`opened PR: ${result.pr?.url}`);
    console.log(`branch:    ${result.pr?.branch}`);
    return;
  }
  if (name === "projects") {
    const patch = buildProjectUpdate(flags);
    if (Object.keys(patch).length === 0) {
      throw new Error("nothing to update — pass at least one field flag");
    }
    const collection = getCollection("projects")! as Collection<ProjectInput, Project>;
    const result = await storeFromEnv(collection).update(slug, patch);
    console.log(`opened PR: ${result.pr?.url}`);
    console.log(`branch:    ${result.pr?.branch}`);
    return;
  }
  throw new Error(`edit not implemented for collection: ${name}`);
}

// ---------- usage ----------

function blogCreateUsage(): string {
  return `usage: loom blog create --title <t> --description <d> [--slug <s>] [--date <YYYY-MM-DD>] [--tags a,b] [--draft] [--body <text> | --body-file <path|->]`;
}

function projectCreateUsage(): string {
  return `usage: loom projects create --name <n> --description <d> --org <o> --github-url <u> --categories <c1,c2> [--slug <s>] [--languages a,b] [--tech a,b] [--image-url <u>] [--video-url <u>] [--featured] [--note <s>]`;
}

function usage() {
  console.log(`loom — agent-native CMS CLI

usage:
  loom <collection> list
  loom <collection> get <slug>
  loom <collection> create [flags]
  loom <collection> edit <slug> [flags]

collections: ${collectionNames().join(", ")}

${blogCreateUsage()}
  loom blog edit <slug> [--title --description --tags --date --publish|--draft] [--body | --body-file]

${projectCreateUsage()}
  loom projects edit <slug> [--name --description --org --categories --languages --tech --github-url --image-url --video-url --note --featured|--unfeature]

env:
  GITHUB_TOKEN          token for writes (reads of a public repo need none)
  LOOM_CONTENT_OWNER    default: enspyrco
  LOOM_CONTENT_REPO     default: enspyrco-site
  LOOM_CONTENT_DIR      default: <collection.dir>
  LOOM_CONTENT_BRANCH   default: main
`);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      // shared
      slug: { type: "string" },
      description: { type: "string" },
      // blog
      title: { type: "string" },
      date: { type: "string" },
      tags: { type: "string" },
      body: { type: "string" },
      "body-file": { type: "string" },
      draft: { type: "boolean" },
      publish: { type: "boolean" },
      // projects
      name: { type: "string" },
      org: { type: "string" },
      categories: { type: "string" },
      languages: { type: "string" },
      tech: { type: "string" },
      "github-url": { type: "string" },
      "image-url": { type: "string" },
      "video-url": { type: "string" },
      featured: { type: "boolean" },
      unfeature: { type: "boolean" },
      note: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const [collectionName, action, arg] = positionals;

  if (values.help || !collectionName) return usage();

  const collection = getCollection(collectionName);
  if (!collection) {
    console.error(`unknown collection: ${collectionName} (try: ${collectionNames().join(", ")})`);
    process.exitCode = 1;
    return;
  }

  switch (action) {
    case "list":
      return cmdList(collection);
    case "get":
      return cmdGet(collection, arg);
    case "create":
      return cmdCreate(collectionName, values);
    case "edit":
      return cmdEdit(collectionName, arg, values);
    default:
      usage();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  if (err instanceof ZodError) {
    console.error("validation failed:");
    for (const issue of err.issues) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
  } else {
    console.error(`error: ${err.message}`);
  }
  process.exitCode = 1;
});
