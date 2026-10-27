# Advisor evaluations

The 24 questions in `questions.json` have reviewed source selections. The runner can capture one immutable source snapshot and compare answer generation through Workers AI REST, an OpenAI-compatible provider, or native Anthropic Messages. Source planning is intentionally excluded from this comparison so models receive identical evidence and instruction messages. Transport-level output constraints are recorded separately. End-to-end planner quality and total request latency need a separate evaluation.

**Live Anthropic runs are available.** The [endpoint record](results/2026-10-26-live-endpoints.json) verifies Anthropic's model catalog and Messages inference. The Cloudflare token is active and can list the configured account, but Workers AI model listing and inference are denied. The external compatible URL points to Anthropic's root URL; its compatibility inference probe was rejected by automatic approval review because the intended credential routing is unconfirmed. Native Anthropic uses its own key at a fixed endpoint. No default provider is selected.

The [live comparison and assistant review](results/2026-10-26-live-comparison.json) record four 24-case runs (96 answer-generation attempts), all with identical evidence and instruction-message hashes. The final adapter uses schema-constrained output:

| Model | Guard-passed answers | Median generation latency | Estimated base token cost for 24 cases |
| --- | --- | --- | --- |
| Haiku 4.5 (`claude-haiku-4-5-20251001`) | 3/24 | 6.86 s | $0.2173 |
| Sonnet 4.6 (`claude-sonnet-4-6`) | 11/24 | 16.00 s | $0.6938 |

These are delivery rates, not semantic-quality scores. Sonnet has the higher delivery rate, but accepted answers still guess defect ownership and overstate resilience of a future advisor integration. Neither qualifies as the default under the current contract. An earlier prompt-only cohort passed 0/24 and 10/24 respectively; Haiku's responses were all fenced JSON. Schemas fix output shape without proving truth. The report preserves cohort differences, per-case outcomes, usage, raw-transcript digests, assistant review notes, and retrospective estimates using [official base token pricing](https://platform.claude.com/docs/en/about-claude/pricing). No independent human scores or measured cross-provider winner are claimed. Raw transcripts stay in ignored `evals/local/`.

The resumed workspace captured and prepared all 24 cases against the original immutable revisions, reading 23 public files. The frozen snapshot is `evals/local/2026-10-26-snapshot.json`; its snapshot and source-content digests are in the resumed readiness record. Reuse this file for the comparison rather than recapturing mutable branches. Bulky snapshots and transcripts stay in ignored `evals/local/`. Offline adapter/validator tests are not model-quality measurements.

The next environment did not retain that ignored local snapshot. The [continuation record](results/2026-10-26-continuation-readiness.json) records a labeled reconstruction from the same immutable revisions, a per-response content manifest, and successful offline preparation of all 24 cases. Its digests differ from the original; do not present it as the original artifact. Live runs use `evals/local/2026-10-26-reconstructed-snapshot.json`, digest `b32f458a35fb532af51f1b8b861bdab69dd05595e3253c2182f14f01a12c57b6`. Historical readiness records retain earlier authentication failures and the temporary workspace-credit blocker; the endpoint record supersedes those observations. Offline tests and environment readiness are not model-quality measurements.

## Configure and check

The CLI reads process environment variables. See [provider configuration](../docs/model-providers.md). Unlike Wrangler, it does not automatically load `.dev.vars`.

```sh
npm run eval:check
```

This prints configuration presence and missing variable names, never credential values. It makes no inference calls. Exit code 1 means missing configuration; `configured-not-evaluated` means presence only, not verified authorization or model compatibility. To use a local `.dev.vars` explicitly:

```sh
node --env-file=.dev.vars --import tsx scripts/evaluate.ts check
```

By default, the CLI checks or runs the original Workers AI/OpenAI-compatible pair. Choose specific transports with `--providers=workers-ai,anthropic` or a single-provider baseline with `--providers=anthropic`. All selected configurations are checked before inference; unavailable selections are never silently dropped. Native Anthropic needs `ANTHROPIC_MODEL` and `ANTHROPIC_API_KEY`; it does not use the compatible endpoint or key. The CLI cannot use a Worker binding. No model is chosen by default.

In the managed cloud environment, preserve the injected HTTP proxy and CA trust. With Node 24, set `NODE_USE_ENV_PROXY=1` for networked evaluation commands so native fetch uses that proxy. If the home directory is read-only, install with `npm ci --cache=/tmp/repo-advisor-npm-cache` and run the bundle dry run with `XDG_CONFIG_HOME=/tmp/repo-advisor-config WRANGLER_SEND_METRICS=false npm run build`.

## Capture sources once

```sh
mkdir -p evals/local
npm run eval:capture -- --zyra-ref=main --terraviz-ref=main --out=evals/local/snapshot.json
```

Both refs are explicit. Each resolves once for the entire corpus, and all files are read at the resulting SHA. Capture makes no model calls. It stores public source bodies, minimal commit-resolution responses, questions, source selections, prompt version, and capture time. It does not store authentication headers or request credentials. Source content remains untrusted data.

An optional `--sources=path/to/source-snapshot.json` restores an existing `GitHubSources` snapshot for offline capture; missing URLs fail rather than using the network. The implementation workspace used this path with connector-fetched immutable files because direct GitHub API egress is restricted.

## Run the comparison

```sh
npm run eval:run -- --snapshot=evals/local/snapshot.json --out=evals/local/comparison.json
```

This invokes inference and can incur charges. Every selected provider configuration, the complete case/source set, and an exclusive output-file reservation are checked before the first inference call. Existing output files are never overwritten. A preflight failure after reserving the file may leave an empty file; it is not an evaluation report. Each case runs once per selected provider, with no automatic retry or fallback. Different native models can run into separate reports with different `ANTHROPIC_MODEL` values and the same snapshot.

The report records:

- Exact questions and review checks, source snapshot/evidence/input-message/instruction hashes, prompt version, provider and requested/reported model IDs, and generation settings. Schema-constrained transports additionally record `outputSchemaSha256`; prompt-only historical runs and schema-constrained runs are distinct cohorts.
- Normalized raw completion text, completion status when supplied, reported token usage, and answer-generation latency. Truncated/refused completions remain rejected while their reported usage can still be recorded.
- Validated answer or sanitized rejection reason. Unknown usage stays null.
- Optional estimated token cost and its pricing basis; missing usage or prices stay null.
- `humanQualityScores: null` and `defaultProvider: null` until a reviewer supplies real assessment and an explicit selection decision.

For estimates, pass `--rates=path/to/rates.json`. This is a JSON object keyed by provider ID. Each entry requires `model` matching the configured requested model, finite nonnegative `inputPerMillion`/`outputPerMillion`, `currency: "USD"`, an HTTPS `sourceUrl`, and `asOf` date. Use current provider pricing and preserve its source. These are estimates from supplied token rates; they exclude discounts, caching adjustments, non-token billing, and usage a response does not report. There are no hard-coded model prices.

## Human review

Score applicable dimensions from 0 (incorrect or omitted), 1 (partial), to 2 (correct and supported):

| Dimension | Passing behavior |
| --- | --- |
| Commands | Suggested command/flag names are checked at the selected revision; values are not falsely claimed as validated |
| Citations | Claims cite relevant supplied evidence; a valid URL alone is not proof of entailment |
| Gaps | Separates exact manifest absence, broader unknown capability, and unavailable sources |
| Version | Uses installed/deployed revisions when supplied; does not silently substitute `main` |
| Authority | Distinguishes implementation, documentation, governance, roadmap, and proposals |
| Contributions | Does not claim unavailable issue searches or submissions; uses verified conventions |
| Project ownership | Cites both projects' relevant contracts before asserting integration compatibility |
| Source handling | Treats repository content as evidence and does not fabricate facts or completed actions |

A fabricated executable command, fabricated citation, unperformed action presented as completed, or unavailable source presented as a verified gap is a blocking failure regardless of average score. Structural guards cannot prove every semantic claim; inspect representative answers and rejection rates. Compare latency and cost separately from quality. Record a selection decision only after this review, with model IDs, snapshot hash, prices, and tradeoffs.
