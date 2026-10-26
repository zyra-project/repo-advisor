# Repo Advisor

Source-backed repository guidance for the Zyra ecosystem. The shared service is intended to help users understand supported functionality, troubleshoot workflows, and prepare useful contributions across Zyra and Terraviz. Orbit remains Terraviz's embedded digital docent and can consult this service for project assistance.

**Status: foundation.** This repository currently provides a runnable Cloudflare Worker for revision-pinned source retrieval and exact Zyra command/option-name checks. It does not yet generate natural-language answers, search issues/discussions, submit GitHub content, expose MCP, or include a public chat interface. Model evaluation and Orbit integration are subsequent milestones.

## Local development

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run check
npm run dev
```

Wrangler serves the Worker locally at `http://localhost:8787`. No Cloudflare account or AI binding is needed for this foundation. Evidence requests need outbound HTTPS access to `api.github.com` and `raw.githubusercontent.com`; health and project discovery work offline.

GitHub public reads work without a token, subject to GitHub's rate limits. Optionally copy `.dev.vars.example` to `.dev.vars` and set `GITHUB_TOKEN` to a token authorized for public repository reads. This service supports only its configured public repositories. Tokens are used only for GitHub API revision resolution and are never sent to raw-file endpoints or returned to clients.

```sh
curl http://localhost:8787/health
curl http://localhost:8787/v1/projects

curl http://localhost:8787/v1/evidence \
  -H 'Content-Type: application/json' \
  -d '{"project":"zyra","source":"cli","command":"acquire api","options":["--url","--output"]}'

curl http://localhost:8787/v1/evidence \
  -H 'Content-Type: application/json' \
  -d '{"project":"terraviz","source":"self-hosting","ref":"main"}'
```

`ref` accepts a branch, tag, or commit. Omit it to use the profile's default branch. For advice about an installed or deployed version, select that version explicitly rather than assuming `main` matches it. A source not present at an older revision returns a retrieval failure; it is not evidence that the product lacks the capability.

For CLI evidence, `supported` means that the command and supplied option **names** appear in the selected manifest. It does not verify option values, required arguments, environment prerequisites, workflow semantics, or execution. `not_in_manifest` means absence from the checked manifest at the cited revision, not proof that the feature is impossible through Python, manual work, or another interface.

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Worker routes, GitHub source adapter, evidence retrieval, and model-provider contract |
| `profiles/` | Curated Zyra and Terraviz source configurations and contribution policies |
| `tests/` | Offline source-failure, version-pinning, alias, option, and request-boundary tests |
| `evals/` | Questions and a rubric for the future model comparison; no model results yet |
| `docs/architecture.md` | Responsibilities, source hierarchy, and Orbit integration boundary |
| `docs/api.md` | Implemented request and response contracts |
| `docs/roadmap.md` | Milestones and acceptance criteria |

Profiles currently point to the public `NOAA-GSL/zyra` and `NOAA-GSL/terraviz` repositories inspected for this foundation. The advisor itself lives in `zyra-project/repo-advisor`. Source ownership changes should be reviewed as configuration changes rather than inferred from user input.

## Validation and deployment

```sh
npm run check
npm run build
```

`build` performs a Wrangler deployment **dry run**, producing `dist/` without publishing. CI runs type checking, offline tests, and this build. The checked-in configuration disables the default `workers.dev` route. There is no deployment workflow or AI binding. Public hosting, origin policy, request budgets, and model credentials belong to a later deployment milestone.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Architecture decisions start with the [foundation decision](docs/decisions/0001-shared-advisor.md). Work affecting Zyra's CLI or Terraviz's UI belongs upstream in those projects; this repository owns the shared advisor and its project profiles.

Licensed under [Apache-2.0](LICENSE).
