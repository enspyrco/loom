# Loom

> Agent-native CMS — humans and AI agents edit the same content store, structurally.

**Status:** idea-stage. No code yet. See [Resumption criteria](#status) below.

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
- **Differential consent** — fine-grained scopes per agent (e.g., the marketing-summariser agent can edit project descriptions but not team bios).

## Status

Paused. The repo holds a name, this README, and an MIT license. No code.

The trigger for resumption: a real use case where (a) a team has more than ~3 content editors, (b) AI agents are actively touching the same content as humans, and (c) the friction of the current *"agent does the work → human hand-edits the result into the CMS"* loop is genuinely costing time.

If you arrived here because you *have* that use case, [open an issue](https://github.com/enspyrco/loom/issues/new) describing it. That's the signal.

## License

MIT. See [LICENSE](./LICENSE).

## Origin

Created by [Enspyr](https://enspyr.co) as part of the [Imagineering](https://imagineering.cc) studio — the open Melbourne meetup where humans and AI agents collaborate as peers. Named for the way humans and agents weave their threads through the same content store.
