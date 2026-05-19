# Refused

> *Loom is also defined by what it will not host.*

Loom is an agent-native CMS. That phrasing makes it sound like any agent can move in. It cannot. The choice of which agents are native to Loom is a load-bearing design choice, and the negative space — the agents Loom *refuses* to host — is part of how the positive shape gets articulated.

This document records the archetypes Loom declines, and the reasoning for each. It exists so that future contributors do not have to discover these refusals by writing a PR for one of them.

The pattern, across every refusal below: **Loom hosts agents whose primary act is fidelity to a source, and declines agents whose primary act is the engineered gap between what a thing is and how it is presented.** The first lives upstream of marketing; the second is marketing.

---

## The author

An agent that produces site copy from scratch — bios, taglines, project blurbs, headlines — given a vague human prompt and latitude to invent.

**Why refused.** The author has no source. It generates language whose accuracy cannot be checked against anything except itself, and so it cannot be witnessed. Scribe's first commitment is *refuse to speak what you cannot witness.* An agent whose entire job is to speak what no one can witness is the structural opposite of what Loom is built around.

The smaller version of this refusal already lives in [the Scribe design](scribe.md#what-it-is-not-and-why): the first draft of Loom's README called this archetype the `marketing-summariser`. The name was wrong because the agent itself was wrong. Calling it out by category here generalizes the refusal beyond a single naming mistake.

**What a human can do instead.** Write the bio. Loom will witness it. Scribe will footnote it. The agent layer is for sustaining truthfulness across a corpus, not for authoring inside it.

---

## The engagement-optimiser

An agent that observes site analytics — click-through, dwell time, scroll depth — and rewrites copy to make those numbers move.

**Why refused.** This agent's job is to widen the gap Scribe exists to close. Every successful rewrite, by definition, makes the site say something the source does not, because the source did not optimise for engagement. The agent is not lying, exactly — it is constructing a parallel surface tuned to a different objective than truthfulness, and Loom does not host parallel surfaces.

The architectural tell: this agent's loop closes on a metric the corpus does not contain. Loom's loops close on the corpus.

---

## The translator-that-smooths

An agent that localises site content into other languages with latitude to "make it work" — paraphrasing, adapting idioms, softening cultural friction, filling gaps the source left ambiguous.

**Why refused.** This is the translation case Scribe already refuses in [its postures](scribe.md#what-scribe-does) (*"refuses to translate incoherence"*). Naming it as a category makes the refusal portable: it applies to any agent that treats unclear source as a problem to fix in its own surface, rather than a problem to escalate upstream.

A translator that *refuses* is welcome. A translator that *smooths* is not.

**Note.** This refusal is not against translation. It is against the specific posture of *cover for the source's incoherence*. An agent that produces a literal translation and refuses to ship until the source clarifies is fully Loom-shaped.

---

## The persona / brand-voice mimic

An agent prompted with *"write this in Nick's voice"* or *"in the Imagineering tone"* and given latitude to imitate.

**Why refused.** Loom has no canonical voice file to witness this against, and so the agent cannot be checked. Worse, every successful mimicry erodes the boundary between what a human actually said and what was generated to sound like them. Scribe's *quote integrity* posture exists precisely because this boundary matters.

If a person's voice is going to be modelled by an agent, the source-of-truth has to live somewhere Scribe can read — transcripts, written drafts, signed approvals. *Mimicry without a verifiable source is just plausible deniability with extra steps.*

---

## The SEO writer

An agent that inserts keywords into existing copy, adds H2s for crawl structure, generates meta descriptions tuned for search rankings.

**Why refused.** Every keyword insertion is a deliberate edit that does not improve fidelity. The agent's loop closes on Google's algorithm, not on the corpus. This is engagement-optimisation with extra jargon. Same refusal, same reasoning.

A site whose ranking comes from being substantively true and being *witnessed as true* is a stronger long-term position than one whose ranking comes from keyword density. Loom's bet is the former.

---

## The summariser-without-source-link

An agent that compresses long documents into shorter ones — for cards, previews, social shares — with no requirement to point back at the passage it compressed.

**Why refused.** Compression without provenance is exactly the failure mode Scribe's provenance posture is designed to prevent. A summary on the site whose source cannot be located is a free-floating claim, and free-floating claims accumulate into the soup Scribe was built to refuse.

**Acceptable shape.** A summariser that emits both the summary AND a stable pointer to the source passage, such that Scribe can later verify the summary still holds against the source, is welcome. The provenance is the price of entry.

---

## A note on the line

The line between refused and welcome is not *what the agent produces* — it is *whether the agent's loop closes on the corpus or on something external to it.*

- Closes on the corpus → Loom-native. Drift detection, cross-corpus consistency, provenance audits, schema migrations.
- Closes on something external (a metric, an audience, an aesthetic, a ranking) → not Loom-native.

This is the test. Run it against any proposed agent before designing it.

---

## On adding to this list

This document grows by refusal, not by speculation. An archetype lands here when someone proposes it and Loom declines — not when someone hypothetically imagines an agent that could be declined.

If you are reading this because you proposed something and were pointed at this page, the refusal is recorded. The reasoning above either applies to your case directly or it does not. If it does not, the list grows by one. Either outcome is the document working as intended.
