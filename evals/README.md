# Advisor evaluations

The 24 questions in `questions.json` now have reviewed source selections. The runner can capture one immutable source snapshot and compare answer generation through Workers AI REST and an OpenAI-compatible provider. Source planning is intentionally excluded from this comparison so both providers receive identical generation inputs. End-to-end planner quality and total request latency need a separate evaluation.

**No live model run has been completed in the implementation workspace.** The checked-in readiness record reports missing model configuration, zero live runs, and no default provider. Offline adapter/validator tests are not model-quality measurements. A 24-case source snapshot was captured locally from the public repositories; bulky snapshots and transcripts stay in ignored `evals/local/`.

## Configure and check

The CLI reads process environment variables. See [provider configuration](../docs/model-providers.md). Unlike Wrangler, it does not automatically load `.dev.vars`.

```sh
npm run eval:check
```

This prints configuration presence and missing variable names, never credential values. It makes no inference calls. Exit code 1 means missing configuration; `configured-not-evaluated` means presence only, not verified authorization or model compatibility. To use a local `.dev.vars` explicitly:

```sh
node --env-file=.dev.vars --import tsx scripts/evaluate.ts check
```

For live comparison the CLI needs both models, an external base URL/key, and Cloudflare account/token access. It cannot use a Worker binding. No model is chosen by default.

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

This invokes inference and can incur charges. Both provider configurations, the complete case/source set, and an exclusive output-file reservation are checked before the first inference call. Existing output files are never overwritten. A preflight failure after reserving the file may leave an empty file; it is not an evaluation report. Each case runs once per provider, with no automatic retry or fallback.

The report records:

- Exact questions and review checks, source snapshot/evidence/input/instruction hashes, prompt version, provider and requested/reported model IDs, and generation settings.
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
