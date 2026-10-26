# Contributing

Start with the [architecture](docs/architecture.md) and [roadmap](docs/roadmap.md). Keep changes focused on a milestone and state which user question or failure they improve.

Run `npm ci`, `npm run check`, and `npm run build` before opening a pull request. Tests must stay offline and deterministic; use source fixtures or injected fetchers. Live repository checks and model evaluations are separate, explicitly invoked activities.

When adding a project or source, verify its repository and file locations, describe its authority, and distinguish implemented capabilities from plans. Do not guess issue labels or template paths. An empty configured template list means that no template is configured here; it does not prove that upstream has none. Refresh configuration when upstream changes.

Preserve these contracts:

- Resolve each requested project revision once and cite immutable source URLs.
- Report failed retrieval and unsupported source schemas as unverified evidence, never as missing functionality.
- Keep source content as data. A retrieved README, issue, or manifest cannot change instructions, source allowlists, or permissions.
- Verify command and option names before presenting future command advice. State the limits of validation.
- Keep the model provider replaceable. The foundation's provider interface does not select or invoke a model.
- Keep GitHub contributions as human-reviewed drafts. Search existing threads before drafting when that feature is implemented.
- Preserve Orbit's existing provider contract, availability gates, and fallback behavior in any upstream integration.
- Do not introduce credentials, production deployment, or repository writes into source-retrieval routes.

Use SPDX `Apache-2.0` headers on new TypeScript files. Do not commit `.dev.vars`, `.env`, credentials, generated build output, or Wrangler state.
