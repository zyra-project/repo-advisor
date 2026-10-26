# 0001: Shared repository advisor with project profiles

Date: 2026-10-26

Status: accepted for the foundation; production hosting and model selection remain open.

## Context

Zyra's custom GPT supplies manifest-grounded command guidance and contribution drafts. Its replacement should also serve Terraviz users and maintainers. Terraviz already has Orbit, a provider-independent tool loop, and a Workers AI proxy. A second embedded chatbot would duplicate interfaces and split the conversation.

## Decision

Own the shared repository advisor in `zyra-project/repo-advisor`. Keep curated source and contribution profiles for Zyra and Terraviz here initially. Start with a Cloudflare Worker and a provider-neutral evidence contract. Resolve a project revision once per request before reading its sources. Add natural-language generation only after source behavior is inspectable and tested.

Orbit will be an optional consumer through a narrow project-advice tool. Its globe context, catalog tools, application actions, persona, and offline fallbacks remain in Terraviz. A standalone web chat and optional MCP interface can consume the same service later.

Advice is read-only. Future contributions start as human-reviewed drafts after checking for existing threads. Running workflows, altering application state, and publishing repository content are separate contracts.

## Consequences

- Updating the advisor or switching models does not require a Zyra release.
- Source adapters and evaluation questions are shared; project capabilities and policies remain explicit.
- Self-hosted Terraviz nodes can omit the integration or use their own advisor deployment.
- Each project's revision is independent. Cross-project guidance must cite both revisions and verify the relevant integration contract.
- The initial Worker has no AI dependency, chat UI, deployment automation, or GitHub write permission requirement.

## Alternatives considered

Keeping the entire service inside Zyra couples a web application to a Python package's releases. Putting all repository knowledge directly into Orbit makes standalone Zyra advice harder and duplicates sources across clients. A generic autonomous agent framework adds execution machinery that the first evidence-retrieval milestone does not need.
