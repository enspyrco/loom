#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, readSync } from "node:fs";
import { GitHubStore } from "../core/github-store.ts";
import { ZodError } from "zod";
import type { BlogPostInput, BlogPostUpdate } from "../../schemas/blog.ts";

function storeFromEnv() {
  return new GitHubStore({
    owner: process.env.LOOM_CONTENT_OWNER ?? "enspyrco",
    repo: process.env.LOOM_CONTENT_REPO ?? "enspyrco-site",
    baseDir: process.env.LOOM_CONTENT_DIR ?? "content/blog",
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
  const file = join(tmpdir(), `loom-blog-${Date.now()}.md`);
  writeFileSync(file, "");
  const res = spawnSync(editor, [file], { stdio: "inherit" });
  if (res.status !== 0) throw new Error("editor exited non-zero; aborting");
  const body = readFileSync(file, "utf-8").trim();
  unlinkSync(file);
  if (!body) throw new Error("empty body; aborting");
  return body;
}

function parseTags(v: unknown): string[] | undefined {
  if (typeof v !== "string") return undefined;
  return v.split(",").map((t) => t.trim()).filter(Boolean);
}

async function cmdList() {
  const posts = await storeFromEnv().list();
  if (posts.length === 0) {
    console.log("(no published posts)");
    return;
  }
  for (const p of posts) {
    console.log(`${p.date}  ${p.slug.padEnd(36)}  ${p.title}`);
  }
}

async function cmdGet(slug: string | undefined) {
  if (!slug) throw new Error("usage: loom blog get <slug>");
  const post = await storeFromEnv().get(slug);
  if (!post) {
    console.error(`not found: ${slug}`);
    process.exitCode = 1;
    return;
  }
  console.log(`# ${post.title}`);
  console.log(`slug: ${post.slug} · date: ${post.date} · tags: ${post.tags.join(", ") || "(none)"}`);
  console.log(`published: ${post.published} · ${post.wordCount} words · ${post.readTime} min read`);
  console.log("---");
  console.log(post.body);
}

async function cmdCreate(flags: Record<string, unknown>) {
  const title = flags.title;
  const description = flags.description;
  if (typeof title !== "string" || typeof description !== "string") {
    throw new Error("usage: loom blog create --title <t> --description <d> [--slug --date --tags --draft] [--body | --body-file]");
  }
  const input: BlogPostInput = {
    slug: typeof flags.slug === "string" ? flags.slug : slugify(title),
    title,
    description,
    date: typeof flags.date === "string" ? flags.date : today(),
    tags: parseTags(flags.tags) ?? [],
    published: flags.draft !== true,
    body: resolveBody(flags),
  };
  const result = await storeFromEnv().create(input);
  console.log(`opened PR: ${result.pr?.url}`);
  console.log(`branch:    ${result.pr?.branch}`);
}

async function cmdEdit(slug: string | undefined, flags: Record<string, unknown>) {
  if (!slug) throw new Error("usage: loom blog edit <slug> [--title --description --tags --date --publish|--draft] [--body | --body-file]");
  const patch: BlogPostUpdate = {};
  if (typeof flags.title === "string") patch.title = flags.title;
  if (typeof flags.description === "string") patch.description = flags.description;
  if (typeof flags.date === "string") patch.date = flags.date;
  const tags = parseTags(flags.tags);
  if (tags) patch.tags = tags;
  if (flags.publish === true) patch.published = true;
  if (flags.draft === true) patch.published = false;
  if (typeof flags.body === "string" || typeof flags["body-file"] === "string") {
    patch.body = resolveBody(flags);
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("nothing to update — pass at least one field flag");
  }
  const result = await storeFromEnv().update(slug, patch);
  console.log(`opened PR: ${result.pr?.url}`);
  console.log(`branch:    ${result.pr?.branch}`);
}

function usage() {
  console.log(`loom — agent-native CMS CLI

usage:
  loom blog list
  loom blog get <slug>
  loom blog create --title <t> --description <d> [--slug <s>] [--date <YYYY-MM-DD>] [--tags a,b] [--draft] [--body <text> | --body-file <path|->]
  loom blog edit <slug> [--title <t>] [--description <d>] [--tags a,b] [--date <d>] [--publish|--draft] [--body <text> | --body-file <path|->]

env:
  GITHUB_TOKEN          token for writes (reads of a public repo need none)
  LOOM_CONTENT_OWNER    default: enspyrco
  LOOM_CONTENT_REPO     default: enspyrco-site
  LOOM_CONTENT_DIR      default: content/blog
  LOOM_CONTENT_BRANCH   default: main
`);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      title: { type: "string" },
      description: { type: "string" },
      slug: { type: "string" },
      date: { type: "string" },
      tags: { type: "string" },
      body: { type: "string" },
      "body-file": { type: "string" },
      draft: { type: "boolean" },
      publish: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const [collection, action, arg] = positionals;

  if (values.help || !collection) return usage();
  if (collection !== "blog") {
    console.error(`unknown collection: ${collection} (only 'blog' for now)`);
    process.exitCode = 1;
    return;
  }

  switch (action) {
    case "list":
      return cmdList();
    case "get":
      return cmdGet(arg);
    case "create":
      return cmdCreate(values);
    case "edit":
      return cmdEdit(arg, values);
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
