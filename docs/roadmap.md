# Roadmap

## 1. Foundation — merged in PR #1

- Document service ownership, Orbit's boundary, and the source hierarchy.
- Configure both Zyra and Terraviz from the beginning.
- Retrieve allowed sources at one resolved project revision per request.
- Check exact Zyra command and option names, including canonical aliases.
- Cite source files and distinguish manifest absence from failed verification.
- Define the model-provider contract and an evaluation corpus.
- Run local type checks, offline behavior tests, and a Worker bundle dry run in CI.

Acceptance: a developer can start the Worker without Cloudflare credentials, discover the projects, retrieve Terraviz documentation, and check a Zyra command against a selected revision with immutable citations. Source requests additionally require GitHub connectivity. No natural-language answer quality is claimed at this milestone.

## 2. Evidence-backed answers and provider comparison — implementation preview

Implemented: answer orchestration, Workers AI binding/REST, OpenAI-compatible and native Anthropic Messages adapters, approved implementation reads, structured command suggestions, citation/command checks, and fixed-evidence/planned comparison modes. Source-specific planning schemas prevent catalog/document fields from being confused with exact command lookups. A complete invalid answer gets at most one correction on the same provider and evidence; provider, source-plan, retrieval, refusal and truncation failures stop without correction. Command guards reject empty/unprovided values and missing mandatory inputs where annotated, without claiming complete semantic or execution validation.

Recognized service-boundary questions use server-owned answers without retrieval or inference. Conditional cross-project ownership, implementation-plan and publishing-handoff questions retrieve curated contracts and return review checklists. Missing contracts fail retrieval. These bounded English routes are not a general semantic classifier or interoperability validator.

The [current comparison](../evals/results/2026-10-27-current-model-comparison.json) reruns the final answer/evidence/command guards on the unchanged reconstructed 24-question snapshot with Opus, Sonnet and Haiku 5.5, plus GPT-6.1 Sol. Eight server-owned answers are excluded from each model's score. GPT and Opus each deliver all 16 core model cases and six additional/focused model cases; both also pass 16/16 model cases with source-plan-v2 and expanded frozen-source coverage. Assistant semantic review, observed latency and estimated base-token cost select **GPT-6.1 Sol as the configured preview default**, with Opus as an alternative. Missing credentials fail without fallback. OpenAI, native Anthropic and Workers AI inference are verified; Gemini remains untested without a credential.

The original ignored snapshot was lost after an environment change. Its labeled reconstruction uses the same recorded revisions and corpus, remains unchanged, and is not presented as the original artifact. The expanded planned snapshot adds approved files at those same revisions and is a separate cohort. Reported usage, latency, canonical/transport input/schema hashes, model identities, raw-report/completion digests, source fingerprints and pricing sources support inspection. Unknown usage/pricing stays null; human scores remain null.

Acceptance evidence now includes final-runtime command/option delivery, source citations, capability-gap and version handling, current/planned distinctions, missing-input behavior, costs, and frozen-source planning. Historical [v3](../evals/results/answers-v3-comparison.json), [guided-v1](../evals/results/guided-v1-comparison.json) and [correction/input](../evals/results/repair-v1-and-command-inputs.json) reports remain separate; older development candidates are superseded by the current preview selection.

Remaining before production qualification: independently reviewed broader questions, factual entailment and contribution/setup completeness, compound-question routing, real HTTP/live-GitHub measurements, and the hosting controls in milestone 4. Guard delivery rates and one assistant-reviewed sample do not establish general accuracy. Nothing is deployed by this PR.

## 3. Contribution drafts

Add live search over relevant open and closed GitHub issues and discussions, then retrieve matching threads. Use REST for issue operations and GitHub's documented GraphQL API for discussions. Discover categories dynamically; file history uses `GET /repos/{owner}/{repo}/commits?path=...`. Refresh template/label configuration rather than assuming it remains correct forever.

Acceptance: matching threads are linked before a new draft is suggested; drafts identify the target repository, use verified conventions, and include implementation, tests, and documentation changes where needed. Submission remains a separate human action. Neither recent-issue lists nor an empty search result alone prove that no duplicate exists.

## 4. Public web chat

Build the smallest interface that can choose project/version, stream answers, inspect citations, and copy reviewed drafts. Define origin rules, per-client request budgets, model spend limits, logging/retention, and failure behavior before deployment. Make deployment explicit and document required Cloudflare bindings and secrets. Keep source errors understandable without exposing infrastructure details.

Acceptance: visitors can use the advisor without a particular commercial chat subscription; errors and unavailable models preserve the evidence trail. Public hosting must have operating limits appropriate to the selected model and audience.

## 5. Optional Orbit integration

Specify a narrow project-advice tool using Orbit's existing provider/tool interface. Work in Terraviz to add the help entry point, minimal relevant application context, deployed revision, a configurable advisor endpoint, and availability fallback. Reconcile the technical-help scope with Orbit's current Earth-science prompt.

Acceptance: app users can ask project questions in Orbit; science conversations and globe actions retain their existing behavior. A self-hosted node can use a different advisor or omit the integration. No vendor LLM SDK is added to Terraviz's dependencies.

## 6. Maintainer MCP access

Expose the stable advisor tools through an optional MCP adapter over the same evidence and answer contracts. Verify current protocol and authorization requirements with supported clients at implementation time.

Acceptance: maintainers obtain the same revision-pinned evidence and contribution guidance from their chosen client without a second implementation of project knowledge.

## Deferred

Workflow execution, autonomous repository writes, automatic issue submission, arbitrary repository onboarding, private repository retrieval, voice, persistent chat memory, and large-scale indexing are outside the foundation. Add them only with concrete use cases and explicit contracts.
