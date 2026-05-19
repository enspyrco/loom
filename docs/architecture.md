# Architecture

> Sober expansion of the sketch in [README.md §Architecture](../README.md#architecture-sketch). Idea-stage. No code exists yet. Treat every claim here as design intent, not implemented behaviour.

This document exists to make the shape of the system legible enough that a future contributor — or a future version of the author — can pick the work up without re-deriving it from the README. It does not lock in choices the README left open. Where the README hedged, this document hedges.

---

## 1. The schema-as-source-of-truth claim, concretely

The README's central claim is that *one schema definition powers every editing surface.* Stated plainly, here is what that means in practice.

For each content collection — `team`, `projects`, `posts`, whatever the consuming site needs — a single file lives at `schemas/<collection>.ts` and exports a [Zod](https://zod.dev) schema. That file is the only place the shape of a record is defined. Every other surface in the system is derived from it.

```
schemas/team.ts          ── one Zod schema
   │
   ├──► generated TypeScript types        (for build-time consumers)
   ├──► form fields in the Web UI         (rendered from the schema)
   ├──► MCP tool input schemas            (team.update, team.create, …)
   └──► write validation                  (same schema, run on every commit)
```

A new field added to `schemas/team.ts` — say, `cv_pdf: z.string().url().optional()` — propagates to all four surfaces without anyone editing four files. The form grows a field. The MCP tool's input schema gains the property. The generated types include it. The validator accepts it on write.

The thing that is *not* parallel here is what gives the design its leverage. In a typical CMS the studio config, the API schema, the TypeScript types consumed by the site, and the agent-tool wrapper each describe the same data shape in their own dialect, and the work of keeping them aligned is human labour, performed forever. Loom collapses that into one file.

The trade-off is honest: Zod is JS/TS-only. A project whose build pipeline is not Node-ish pays a translation cost. That is acknowledged as a constraint, not a flaw — the design is explicitly aimed at the JS/TS-heavy small-team site, not at language-agnostic enterprise content infrastructure.

## 2. Content storage layout

Content lives in a git repository as markdown files with YAML frontmatter. One file per record. Collections map to directories.

```
content/
├── team/
│   ├── delia.md
│   ├── nick.md
│   └── …
├── projects/
│   ├── navmelb.md
│   ├── watermarking.md
│   └── …
└── posts/
    └── 2026-05-thinking-with-agents.md
```

A record's frontmatter is the structured data the schema validates. The markdown body is the long-form prose that doesn't fit into structured fields. This is the same shape Sveltia, Decap, and most static-site generators already use, deliberately — it means existing repos can adopt Loom without migrating their content, and existing content can be edited outside Loom (in a text editor, via `gh`, via a script) without breaking anything. The schema is enforced on write; on read, Loom is just one of many tools that can parse the file.

**Open question:** whether the schemas live in the *same* git repo as the content, or in a separate config repo that the Loom server points at. The simple case — schemas-in-content-repo — is the default starting assumption. Separating them is a future option, not a v0 concern.

## 3. The three surfaces

Loom's server exposes three surfaces over the same content store. Each has a single, defensible reason to exist; each has things it deliberately does not do.

### 3.1 REST API — for build-time fetch

**Serves:** static-site generators (Next.js, Astro, Eleventy, SvelteKit) doing a build-time `fetch` to materialise content into pages.

**Does not:** support arbitrary write operations from the public internet, support GraphQL-style query shaping, or attempt to be a runtime CDN for content. The expectation is that consumers fetch at build time and cache the result themselves. If a consumer wants live content, they fetch on demand from their own server; Loom does not try to be that infrastructure.

The shape is uncontroversial: `GET /api/<collection>` returns the list, `GET /api/<collection>/<slug>` returns one record. Whether responses are JSON, MDX, or raw markdown-with-frontmatter is **TBD** and probably configurable per collection.

### 3.2 MCP server — for agent reads and writes

**Serves:** agents (Claude, ChatGPT, local LLMs) that read and write content through the [Model Context Protocol](https://modelcontextprotocol.io).

For each collection the MCP server exposes a small, predictable tool surface — `team.list`, `team.get`, `team.create`, `team.update`, `team.delete` — with input schemas derived directly from the Zod schema for that collection. An agent that wants to update Delia's bio calls `team.update({slug: "delia", patch: {bio: "..."}})` and gets back either a success (with the resulting PR URL) or a validation error explaining exactly what the schema rejected.

**Does not:** expose arbitrary file-system access, allow schema modifications (those are a code change to `schemas/`), or bypass the write flow described in §5. An agent writing through MCP goes through the same PR path as a human writing through the Web UI.

### 3.3 Web UI — for human reads and writes

**Serves:** humans browsing, editing, and reviewing content in a browser.

The UI renders forms from the same Zod schemas the MCP server uses. Editing Delia's bio in the browser opens a form whose fields are derived from `schemas/team.ts`; submitting it produces the same git operation as the agent-side `team.update` call.

**Does not:** define schemas in-UI. The Sanity / Payload / Strapi pattern of "build your schema by clicking around in a studio" is deliberately rejected — schemas are code, kept in the same repo as the content, version-controlled and reviewed like any other code. This is the choice that keeps drift out of the system; it is also the choice that disqualifies Loom from being a no-code CMS, and that is fine.

## 4. Auth model

Two principals, two mechanisms. The asymmetry is intentional: humans and agents authenticate differently because their identity stories are different, but they edit through the same write flow.

**Humans authenticate via GitHub OAuth.** The Loom Web UI initiates an OAuth flow against GitHub; the resulting token identifies the user and gives Loom the scope it needs to open PRs and push branches on their behalf. The user's GitHub identity is the user's Loom identity — there is no separate Loom account system. This piggybacks on whatever GitHub team / org permissions already exist; if a user can't push to the content repo, Loom won't let them either.

**Agents authenticate via API key or MCP transport.** An agent is provisioned with a credential — exact mechanism **TBD**, likely a per-agent API key in the simple case, possibly delegated tokens or signed MCP requests in more sophisticated setups. Each agent has a stable identity used in commit metadata, PR authorship, and audit logs. Critically, an agent's identity is its own — *Scribe* commits as *Scribe*, not as the human who provisioned it. This is what makes the Scribe-style "drafted by Dreamfinder, 2026-04-12" metadata in the README's vision work.

### Per-role write policy

Whether a given principal's writes go to a PR or land directly on `main` is **configurable per role**. The default for everyone is PR-by-default. A trusted user — say, the repo's primary maintainer — may opt into direct-commit on a per-collection basis. An agent might be PR-only for `team` (bios are sensitive) but direct-commit for `posts` (chronicle entries are append-only). The policy lives in repo config (location **TBD**, probably `loom.config.ts` next to `schemas/`).

The default is intentionally conservative. Direct-commit is the exception, not the norm. The "every write opens a PR" rule is what makes the agent-as-peer-editor claim safe to make.

## 5. The write flow

Every write — human or agent, Web UI or MCP — follows the same code path.

```
write request
    │
    ▼
validate against Zod schema     ── reject early if shape is wrong
    │
    ▼
materialise as markdown+frontmatter on a feature branch
    │
    ▼
commit with structured metadata     ── author (human or agent), source surface, edit summary
    │
    ▼
push branch, open PR                ── or, if role policy permits, commit directly to main
    │
    ▼
review                              ── human reviewer, automated checks, optionally an agent reviewer
    │
    ▼
merge                               ── consuming site rebuilds on next deploy
```

The point of the diagram is that the *same* arrow runs whether the request came in over HTTP from the Web UI or over MCP from an agent. Validation, branching, commit metadata, and review are not bypassable surfaces. There is no "agent fast-path" that skips the PR flow, and there is no "human fast-path" either, beyond the per-role direct-commit configuration described above.

This is what the README means by *structurally identical operations*. It's not a slogan — it's a single function with two callers.

## 6. Tech choices

The README is non-committal here, and this document follows suit. What's plausible:

- **Runtime:** Node or Bun. Both work for the JS/TS-heavy world the design assumes. Bun is faster to start and has nicer ergonomics for a small server; Node has the longer track record. **Open question.**
- **HTTP framework:** [Hono](https://hono.dev). Small, fast, runs on both Node and Bun, has a sane middleware story. The README mentions it explicitly; it remains the leading candidate, but nothing has been built against it yet.
- **MCP SDK:** the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Not strictly required (the protocol is documented) but adopting the SDK avoids re-implementing transport.
- **Git operations:** [`isomorphic-git`](https://isomorphic-git.org) or shelling out to the `git` CLI. The CLI is simpler to reason about; the JS library is portable. **TBD.**
- **Web UI framework:** **completely open.** SvelteKit, React (Next or Remix), Astro with islands, plain HTML with a sprinkle of vanilla JS — any would serve. The Web UI is the surface most easily delayed: the REST API and MCP server are enough to demonstrate the thesis. A v0 with no Web UI at all is defensible.

The pattern across all of these: the design *names* candidates so a future implementer can start from somewhere, but does not commit. The architecture is the part that's settled; the tech stack is the part that isn't.

## 7. What this design is honest about not having decided

Things that are genuinely open questions, not omissions:

- **Where schemas live** — same repo as content (default assumption) vs. separate config repo (future option).
- **Response format from REST** — JSON vs. MDX vs. raw frontmatter-and-body. Probably per-collection configurable.
- **Agent credential model** — per-agent API keys, delegated tokens, signed MCP requests, or something else.
- **Where role/write-policy config lives** — `loom.config.ts`, repo settings UI, GitHub team metadata.
- **Whether the server is stateless** — i.e. does it hold a working clone of the content repo, or fetch via the GitHub API on each request? Both are viable; the trade-offs are operational, not architectural.
- **How a v0 deploys** — single-tenant self-hosted (one Loom server per content repo) is the obvious starting point. Multi-tenant SaaS is conceivable but not the v0 target.

The discipline here is to keep the architecture small enough that these can be decided when someone is actually writing the code, not pre-bikeshedded into a corner now.

## 8. Out of scope (for now)

The architecture deliberately does not address:

- **Schema migrations** — what happens when `schemas/team.ts` adds, removes, or renames a field across 200 existing records. The README lists this under [Future directions](../README.md#future-directions); it's a real problem, just not v0's problem.
- **Conflict resolution** — two writers (human or agent) editing the same record concurrently. Default behaviour falls out of git's merge semantics; richer strategies are deferred.
- **Multi-repo content federation** — editing content from several repos through a single Loom surface. Listed in the README's Future directions.
- **Schema'd blocks inside markdown bodies** — callouts, project cards, embeds rendered through the same form system. Future direction.
- **Differential agent consent** — fine-grained per-agent scopes (e.g., Scribe can edit project descriptions but not team bios). Future direction; the v0 auth model treats an agent as an undifferentiated principal.
- **Realtime collaboration** — Google-Docs-style cursors, presence, simultaneous typing. Not a goal. Loom is a git-backed CMS; the unit of collaboration is the PR, not the keystroke.
- **A studio-style schema builder UI** — schemas are code. See §3.3.

These omissions are the point. The thesis the README defends — *one schema, four surfaces, agents as peer editors* — is small enough to demonstrate without any of the above. Each future direction is an addition the design can absorb if and when there's a use case that needs it.
