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

Implemented: answer orchestration, Workers AI binding/REST, OpenAI-compatible and native Anthropic Messages adapters, approved implementation reads, structured command suggestions, citation/command checks, and a comparison runner with frozen evidence. Native Anthropic uses server-defined schemas for both planning and answers. The 24 evaluation questions include reviewed source selections, and live Haiku/Sonnet runs use the same reconstructed immutable source snapshot.

Remaining: improve answer-contract adherence and semantic quality, repair Workers AI account authorization, finish the cross-provider comparison, and then select a default that passes review. [Current endpoint checks](../evals/results/2026-10-26-live-endpoints.json) verify Anthropic inference; the Cloudflare token is active and sees the configured account but cannot use Workers AI. The external compatible URL also needs its intended provider and credential routing confirmed. The original ignored snapshot did not survive the environment change; its labeled reconstruction uses the same recorded revisions and corpus. The runner records reported usage, latency, input/evidence/snapshot/schema hashes, model identity, raw completions, and optional estimated token cost. Unknown usage or pricing stays null. Planner quality and full request latency require a separate end-to-end evaluation; fixed-evidence runs measure answer generation only.

Acceptance: recorded evaluation results include command/option validity, citation correctness, capability-gap handling, current-versus-planned distinctions, latency, token use, and cost. Select the default based on those results; do not infer quality from model size or token price.

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
