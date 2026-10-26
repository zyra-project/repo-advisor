# Repo Advisor

Source-backed repository guidance for the Zyra ecosystem. The shared service is intended to help users understand supported functionality, troubleshoot workflows, and prepare useful contributions across Zyra and Terraviz. Orbit remains Terraviz's embedded digital docent and can consult this service for project assistance.

**Status: answer-generation preview.** The Cloudflare Worker retrieves sources at fixed revisions, discovers Zyra commands from manifests, and generates structured answers through Workers AI or an OpenAI-compatible API. Command/option names and citation references are checked before an answer is returned. Offline tests cover the contracts; live model comparison is blocked until provider credentials are configured. No default model has been selected. Public hosting, issue/discussion search, submissions, MCP, and Orbit integration remain later milestones.

## Local development

Use Node.js 22 LTS (22.12 or newer in the 22.x line) or Node.js 24 LTS, with npm. The complete supported range is recorded in `package.json`.

```sh
npm ci
npm run check
npm run dev
```

Wrangler serves the Worker locally at `http://localhost:8787`. No Cloudflare account or AI binding is needed for evidence retrieval. Evidence requests need outbound HTTPS access to `api.github.com` and `raw.githubusercontent.com`; health and project discovery work offline. Answers additionally require an explicitly configured model provider; without one the answer route returns `503 provider_unavailable` before any source or model calls.

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

# After configuring a provider in .dev.vars; this invokes inference.
curl http://localhost:8787/v1/answer \
  -H 'Content-Type: application/json' \
  -d '{"question":"How can Zyra fetch a file over HTTP?","projects":[{"id":"zyra","ref":"main"}]}'
```

`ref` accepts a branch, tag, or commit. Omit it to use the profile's default branch. For advice about an installed or deployed version, select that version explicitly rather than assuming `main` matches it. A source not present at an older revision returns a retrieval failure; it is not evidence that the product lacks the capability.

For CLI evidence, `supported` means that the command and supplied option **names** appear in the selected manifest. It does not verify option values, required arguments, environment prerequisites, workflow semantics, or execution. `not_in_manifest` means absence from the checked manifest at the cited revision, not proof that the feature is impossible through Python, manual work, or another interface.

See [model configuration](docs/model-providers.md) for the binding/REST adapters and [evaluation instructions](evals/README.md) to capture one source snapshot and compare both providers. Generation uses deterministic source excerpts, but model output itself is not deterministic and factual correctness still needs review.

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Worker routes, evidence orchestration, model adapters, validators, and comparison functions |
| `profiles/` | Curated Zyra and Terraviz source configurations and contribution policies |
| `tests/` | Offline source, answer-validation, provider, cancellation, and comparison tests |
| `scripts/evaluate.ts` | Readiness checks, frozen source capture, and live comparison CLI |
| `evals/` | 24 questions with fixed source selections, a rubric, and honest readiness records |
| `docs/architecture.md` | Responsibilities, source hierarchy, and Orbit integration boundary |
| `docs/api.md` | Implemented request and response contracts |
| `docs/roadmap.md` | Milestones and acceptance criteria |

Profiles currently point to the public `NOAA-GSL/zyra` and `NOAA-GSL/terraviz` repositories inspected for this foundation. The advisor itself lives in `zyra-project/repo-advisor`. Source ownership changes should be reviewed as configuration changes rather than inferred from user input.

## Validation and deployment

```sh
npm run check
npm run build
```

`build` performs a Wrangler deployment **dry run**, producing `dist/` without publishing. CI runs type checking, offline tests, and this build, without inference credentials or calls. The default configuration disables the `workers.dev` route and has no AI binding. The separate AI configuration is an opt-in example. Public hosting, origin policy, per-client budgets, and production secrets belong to a later deployment milestone.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Architecture decisions start with the [foundation decision](docs/decisions/0001-shared-advisor.md). Work affecting Zyra's CLI or Terraviz's UI belongs upstream in those projects; this repository owns the shared advisor and its project profiles.

Licensed under [Apache-2.0](LICENSE).
