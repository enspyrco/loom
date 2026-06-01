# Loom

> Agent-native CMS — humans and AI agents edit the same content store, structurally.

**Status:** first code shipped — a write-capable CLI for two collections (blog + projects), generic over a `Collection` abstraction. See [Quickstart](#quickstart-cli) and [Status](#status).

---

## The thesis

CMSes were designed before AI agents could plausibly be editors. Their APIs are afterthoughts to a human-first studio: you build the schema in the studio UI, the API exposes it as REST/GraphQL, you write client code to stitch it into your application, and if an agent later needs to participate you bolt a tool wrapper around the API as a third-class citizen.

Loom inverts the order. **Schemas are the source of truth.** The same Zod definition drives:

- The form UI a human sees in the browser
- The [MCP](https://modelcontextprotocol.io) tools an agent calls from a chat
- The TypeScript types your build step consumes
- The validation enforced on every write

A human edit and an agent edit become structurally identical operations: same schema, same validation, same audit trail, same review workflow. The agent isn't *an integration*. It's a peer editor.

## What you could do with it

Real workflows that already happen — today they end in a human hand-editing the markdown after the AI did the actual thinking:

- **Self-updating team page** — a new member joins, an agent drafts their bio from public sources, opens a PR with content + a placeholder photo, human reviewer approves.
- **Project descriptions kept in sync with READMEs** — when a repo's README changes meaningfully, an agent re-summarises it and PRs the update to the marketing description on the site.
- **Conversational edits** — *"Update Delia's bio to mention NavMelb won the routing contest."* Agent calls `team.update("delia", {bio: ...})`, commits, PRs.
- **Bulk operations no human wants to do by hand** — *"shorten every project description on the site to under 200 characters; preserve the most concrete number in each one."*
- **Cross-content consistency** — *"if Delia's role changes on the team page, update every project card that shows her contribution."*
- **Schema-driven writeups** — *"add a `cv_pdf` field to the team schema, then for every member without one, draft a CV from their LinkedIn and open per-person PRs."*

## Quickstart (CLI)

The first surface is a CLI. It reads and writes any registered collection on a
content repo; every write opens a PR rather than committing to the base branch,
so the same command is safe for a teammate or an agent to run.

```sh
bun install

# Reads need no token (public content repo)
bun run cli blog list
bun run cli blog get agentic-engineering
bun run cli projects list

# Writes open a PR — needs a token with PR-write on the content repo
export GITHUB_TOKEN=$(gh auth token)
bun run cli blog create \
  --title "My New Post" \
  --description "One-line summary." \
  --tags "imagineering,ai" \
  --body-file ./draft.md
# → opened PR: https://github.com/enspyrco/enspyrco-site/pull/NN

bun run cli projects create \
  --name "Tech World" --org enspyrco \
  --description "A multiplayer 2D virtual world." \
  --categories "Education" --languages "Dart" --tech "Flutter,Firebase" \
  --github-url https://github.com/enspyrco/tech_world --featured
```

Config is via env: `LOOM_CONTENT_OWNER` / `LOOM_CONTENT_REPO` / `LOOM_CONTENT_DIR`
/ `LOOM_CONTENT_BRANCH` (defaults: `enspyrco` / `enspyrco-site` / per-collection
dir / `main`). Blog bodies come from `--body`, `--body-file` (`-` for stdin), or
`$EDITOR`; project fields are passed as flags.

Each collection is one [Zod schema](schemas/) — blog rides
markdown+frontmatter, projects rides JSON. The store layer is generic over a
`Collection<TInput,TOutput>` bundle (schemas + serialize/parse + file extension),
so adding a third collection is a schema file plus one line in the registry.

## Why this isn't existing CMS X

- **[Sveltia](https://github.com/sveltia/sveltia-cms) / [Decap](https://decapcms.org/)** — git-backed, lovely, but agents are not first-class. You'd write a separate MCP wrapper around their API, and the wrapper would drift from the studio's schema.
- **[Sanity](https://www.sanity.io/) / [Payload](https://payloadcms.com/) / [Strapi](https://strapi.io/)** — full-featured, but agent participation is an integration to bolt on, not a primitive. Their schemas live in a studio config; agent tools live somewhere else.
- **Notion as CMS** — popular pattern, but no schema enforcement, no git history of content, agent edits via Notion API are just another HTTP call without shared validation.

The differentiator isn't "git-backed" or "MCP-supporting" — both are downstream consequences. The thing that's actually different is that *one schema definition powers every editing surface*. Adding a field updates the human form, the agent's tool, the generated TS types, and the validation simultaneously. There's no drift to maintain because there's nothing parallel to keep aligned.

## Architecture (sketch)

Not implemented. Listed so the shape is clear if/when this resumes.

- Markdown + frontmatter content in a git repo (same git-backed advantages as Sveltia/Decap)
- Zod schemas in `schemas/<collection>.ts` define the shape of each content type
- Tiny server (Node or Bun + Hono) reads the repo and exposes three surfaces over the same store:
  - **REST** for build-time fetch (Next.js, Astro, Eleventy, anything)
  - **MCP server** for agent reads/writes
  - **Web UI** for human reads/writes
- Writes commit to a feature branch and open a PR — configurable per role to commit directly for trusted users
- GitHub OAuth for human auth; agents authenticate via API key or MCP transport

## Future directions

Speculative, listed for posterity:

- **Schema-as-protocol** — if the pattern catches on, the Loom MCP tool shape could standardise, letting an agent edit content on any compliant CMS without per-system code.
- **Diff-aware agent reviews** — an agent submits an edit PR, another agent critiques it (*"the new bio drops the NavMelb mention — intentional?"*).
- **Schema migrations as first-class operations** — *"rename `title` to `headline` across all 200 documents"* as a single MCP call.
- **Multi-repo content federation** — edit content from several repos in one surface.
- **Schema'd blocks in markdown bodies** — callouts, project cards, embeds rendered through the same form system.
- **Differential consent** — fine-grained scopes per agent (e.g., the [Scribe](agents/scribe.md) can edit project descriptions but not team bios).

## Status

Resumed. The first tracer bullet is built: a write-capable CLI for two
collections (blog + projects), backed by a generic `Collection` abstraction and
a GitHub-API content store. Reads pull live from the content repo; writes open
PRs. This proves the load-bearing claim end-to-end — *one schema drives
validation, serialization, and types*, and the abstraction holds across
collections that use different storage formats (markdown+frontmatter for blog,
JSON for projects).

Also in the repo: the design for the [Scribe](agents/scribe.md), the list of
[agents Loom refuses to host](agents/refused.md), and an
[architecture sketch](docs/architecture.md). A first Scribe practice runs live
on [enspyrco/enspyrco-site](https://github.com/enspyrco/enspyrco-site) — a
breath-paced GitHub Action tending the site's relationship to its sources.

What pulled the trigger: Imagineering itself is the use case the README always
named — more than ~3 content editors, AI agents drafting content humans then
hand-paste, and the friction of that loop. The [Scribe design](agents/scribe.md#on-looms-resumption-trigger)
argued the trigger had already been pulled; building the CLI is acting on it.

### What's next

- **REST surface** over the same core (the "API" half of the thesis) — the CLI
  and REST are both thin adapters over `src/core`.
- **Projects migration** — extract `enspyrco-site/lib/projects.ts` to per-project
  JSON files at `content/projects/<slug>.json` so the projects collection has a
  corpus to read.
- **More collections** — `team` next.
- **Auth beyond API keys** — GitHub OAuth for human attribution.

If you have a content repo you want this pointed at, the env config makes it a
one-line change; [open an issue](https://github.com/enspyrco/loom/issues/new).

## License

MIT. See [LICENSE](./LICENSE).

## Origin

Created by [Enspyr](https://enspyr.co) as part of the [Imagineering](https://imagineering.cc) studio — the open Melbourne meetup where humans and AI agents collaborate as peers. Named for the way humans and agents weave their threads through the same content store.
