# Advisor evaluations

The 24 questions in `questions.json` have reviewed source selections. The runner can capture one immutable source snapshot and compare answer generation through Workers AI REST, an OpenAI-compatible provider, or native Anthropic Messages. Source planning is intentionally excluded from this comparison so models receive identical evidence and instruction messages. Transport-level output constraints are recorded separately. End-to-end planner quality and total request latency need a separate evaluation.

**Both native Anthropic and Workers AI inference are authorized.** The [original endpoint record](results/2026-10-26-live-endpoints.json) verifies Anthropic's model catalog and Messages inference. The [Cloudflare retry record](results/2026-10-26-workers-ai-retry.json) supersedes its historical Workers AI authorization failures: token verification, model listing, baseline inference, and Llama 3.3 JSON-mode inference all return HTTP 200 after the token update. The external compatible URL points to Anthropic's root URL; its compatibility inference probe was rejected by automatic approval review because the intended credential routing is unconfirmed. Native Anthropic uses its own key at a fixed endpoint. No default provider is selected.

The latest [correction and command-input validation report](results/repair-v1-and-command-inputs.json) preserves an initial correction experiment, stronger command guards, focused metadata reruns, and frozen-source planning checks as **separate cohorts**. The initial 24-case experiment kept the v3 first-pass inputs/schema/validators and allowed one correction after a complete answer failed validation:

| Initial experiment, before stronger command-input guards | First-pass guard passes / 16 model cases | Recovered by correction | Initial total guard passes / 16 |
| --- | --- | --- | --- |
| Llama 3.3 | 12 | 2 | 14 |
| Llama 4 Scout | 9 | 0 | 9 |
| Haiku 4.5 | 9 | 4 | 13 |
| Sonnet 4.6 | 10 | 2 | 12 |

Each configuration also returned 8 server-owned answers, excluded from model scores. The experiment exposed accepted command failures: Llama 3.3 supplied an empty output value and no URL; Haiku copied an example URL. The final `command-inputs-v1` guard rejects empty or unprovided values and missing required positionals/options where annotated in the manifest. Offline replay rejects those two previously accepted drafts; original outcomes are preserved, not relabeled as a new live benchmark. The initial runtime is reproducible from a hash-verified [runtime patch](experiments/repair-v1.patch) against the report's base commit.

The `model-evidence-v2` catalog view now includes positional names/required annotations and mandatory option names, with an explicit incomplete-metadata marker. Four models were rerun on [two focused command questions](command-input-questions.json), first with the stronger guards and then with this metadata view. In the final focused runs, Sonnet passes 2/2: it asks for missing URL/destination without a runnable draft, and produces the checked command when those inputs are supplied. The other three configurations reject 2/2. These are focused checks, not a final 24-case result or independent held-out scoring.

The initial Scout planned-flow run accepts 11/16 model cases, with one retrieval failure because the planner selects an approved transform catalog missing from the snapshot. A separately labeled one-case replay adds that file at the same immutable revision: retrieval succeeds, but the answer still fails formatting. The original snapshot is unchanged. The additional 12-question Scout run routes all 8 server-owned cases as intended and guard-passes all 4 model cases; this remains insufficient evidence of semantic completeness.

The report records all 161 live model calls across these distinct runs, estimated base-token cost of $1.1808, per-call hashes, feedback, raw-completion/report digests, intermediate/final source fingerprints, selected exact answer excerpts, and limitations. Current offline checks pass 152 tests and cover the HTTP plan/answer/correction path, cancellation, exhausted correction, source errors and failed-call accounting. A failed generation attempt without usage now makes aggregate usage/cost unknown rather than counting only the preceding successful call.

**No operational default is selected.** Scout shows no correction benefit in the initial core experiment. Native Sonnet and Haiku merit further quality comparison, with Sonnet strongest on the final focused command checks. Accepted unsupported advice remains, including Sonnet's release/main compatibility claim and Llama 3.3's suggested nonexistent HTTPS subcommand. A full final-runtime benchmark, broader independent review, mixed-question routing and real HTTP/live-source measurements remain outstanding. Correction never relaxes guards or switches providers.

The earlier [guided-v1 comparison and review](results/guided-v1-comparison.json) evaluates the server-owned response paths with the unchanged `answers-v3` model instructions, data, schema and validators. Five service-boundary questions and three conditional integration checklists bypass inference; the remaining 16 questions make one model call each. The server-owned answers are identical across all four configurations and are **excluded from model guard-pass rates and latency**:

| Guided-v1 model cases | Model guard passes | Median model-case latency | Estimated base token cost for 16 model cases |
| --- | --- | --- | --- |
| Workers AI Llama 3.3 | 11/16 | 6.67 s | $0.0288 |
| Workers AI Llama 4 Scout | 11/16 | 4.25 s | $0.0217 |
| Anthropic Haiku 4.5 | 7/16 | 6.13 s | $0.1299 |
| Anthropic Sonnet 4.6 | 12/16 | 11.75 s | $0.4041 |

Each configuration also returns 5 service-policy answers and 3 conditional integration checklists, with zero model calls/tokens/cost. Recognized questions no longer depend on models to explain submission/private-source/cursor boundaries or avoid outage guarantees. Integration guidance requires the configured producer and consumer sources, requests errors/versions/payloads, and gives conditional repository work, testing and release/documentation steps. It is a review scaffold, not payload validation or a claim of interoperability. API tests verify no network or credentials for service-policy answers and failed retrieval for missing contract sources. Recognition is bounded English and may miss paraphrases or handle only the recognized portion of a compound request.

The [12 additional questions](additional-questions.json) have 8 intended server-owned routes and 4 Scout model cases. All routes match, and all 4 model cases pass guards, but the setup answer omits Cloudflare/domain and Git LFS prerequisites. These examples were authored by the implementing assistant before the live rerun, with no prompt tuning on the results; they are not independent held-out scoring. The current report includes those answers and exact excerpts of residual core failures. All accepted model answers were qualitatively reviewed; human scores remain null.

The cohort made 64 core inference calls and 4 additional Scout calls. The eight bypassed cases retain prepared input hashes, but `inputSentToModel: false`, empty raw responses, a null schema hash and zero usage distinguish them from inference. For actual model calls, the input/evidence/schema hashes match the prior v3 cohort. Source file hashes identify the routing and answer implementation. The reconstructed core snapshot digest remains unchanged. Latency excludes planning and live retrieval, and model-call variation on unchanged inputs does not show a causal quality improvement from routing. **No operational default qualifies:** accepted answers still omit requested content or overstate source facts, and 4–9 of 16 inference cases reject. Scout remains the development candidate on observed latency and estimated cost.

The earlier [answers-v3 comparison and assistant review](results/answers-v3-comparison.json) includes TerraViz's upstream Orbit default, Llama 4 Scout. Its exact ID, `@cf/meta/llama-4-scout-17b-16e-instruct`, is verified in [pinned proxy source](https://github.com/zyra-project/terraviz/blob/9b25d7ab62103529a86064e41c0e0a3efe826666/functions/api/chat/completions.ts#L48); this is source configuration, not a probe of a deployed node. [Candidate provenance](results/answers-v2-model-candidates.json) records the separate model-selection evidence, successful Scout inference, and pricing sources. That source was not added to the frozen question evidence.

| Historical answers-v3 model-only run | Guard-passed answers | Median generation latency | Estimated base token cost for 24 cases |
| --- | --- | --- | --- |
| Workers AI Llama 3.3 | 19/24 | 7.49 s | $0.0483 |
| Workers AI Llama 4 Scout | 17/24 | 3.71 s | $0.0381 |
| Anthropic Haiku 4.5 | 8/24 | 6.36 s | $0.2230 |
| Anthropic Sonnet 4.6 | 19/24 | 12.11 s | $0.6824 |

The alias answers improved across all four models. Scout now avoids the unsupported advisor-outage guarantee and explains the draft-only/private-source boundaries. However, its coordinated implementation plan does not actually supply a plan, and its ownership guidance still guesses without the exact error and payload. Llama 3.3 and Sonnet retain accepted outage guarantees; Sonnet also assigns fault to TerraViz before diagnosing the contract. All models still reject at least five cases. **No operational default qualifies.** Scout is the next development candidate on latency, estimated cost, and the improved outage answer; it is not automatically configured as the runtime default. The report reviews every guard-passed answer and retains exact excerpts of important successes/failures. Independent human scores remain null.

The intermediate [answers-v2 cohort](results/answers-v2-comparison.json) is preserved: Llama 3.3 passed 18/24, Scout 16/24, Haiku 11/24, and Sonnet 18/24. Exact [v2 instructions](prompts/answers-v2.txt) and [current v3 instructions](prompts/answers-v3.txt) are archived and hash-checked against the runs. These two new cohorts contain 192 inference attempts. All use the unchanged reconstructed snapshot and data messages, the same output schema, unchanged validators, and a 2048-token limit. They are single samples per case/model, not a held-out validation or repeated/interleaved benchmark. Further prompt tuning on these same questions cannot establish general quality. Next, enforce service/future-integration boundaries in server-owned responses or contracts and improve evidence-specific integration guidance, then assess additional held-out questions as well as rerunning this corpus.

The historical [answers-v1 cross-provider comparison](results/2026-10-26-cross-provider-comparison.json) evaluates Llama 3.3, Haiku 4.5, and Sonnet 4.6 using the same server-defined schema, evidence, instruction messages, and 2048-token output limit:

| Historical answers-v1 schema run | Guard-passed answers | Median generation latency | Estimated base token cost for 24 cases |
| --- | --- | --- | --- |
| Workers AI Llama 3.3 (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) | 16/24 | 9.13 s | $0.0483 |
| Anthropic Haiku 4.5 | 3/24 | 6.86 s | $0.2173 |
| Anthropic Sonnet 4.6 | 11/24 | 16.00 s | $0.6938 |

Workers AI's earlier JSON-object run passed 3/24 and had 16 generic JSON/answer-contract rejections, including malformed JSON; it remains a separate baseline. The schema run had no JSON parsing or shape failures. Llama now has the highest delivery rate and lowest estimated token cost among these configurations, but a guard-passed answer incorrectly distinguishes canonical aliases, and other accepted answers miss the advisor's own source/action boundaries. It is the candidate for the next iteration, not a configured operational default. All three schema hashes match. Runs were not interleaved, provider sampling/enforcement can differ, and prices are estimates rather than bills. Workers AI reports an internal JSON-variant model name; estimates use the requested endpoint's [published tariff](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/).

These are delivery rates, not semantic-quality scores. The [earlier Anthropic-only comparison and assistant review](results/2026-10-26-live-comparison.json) preserve four runs (96 attempts), including a prompt-only cohort that passed 0/24 for Haiku and 10/24 for Sonnet. Haiku's prompt-only responses were all fenced JSON; accepted Sonnet answers still guessed defect ownership and overstated resilience of a future advisor integration. Schemas fix output shape without proving truth. Reports retain per-case outcomes, usage, raw-transcript digests, assistant review notes, and estimates using [official Anthropic prices](https://platform.claude.com/docs/en/about-claude/pricing). No independent human scores or operational default are claimed. Raw transcripts stay in ignored `evals/local/`.

The resumed workspace captured and prepared all 24 cases against the original immutable revisions, reading 23 public files. The frozen snapshot is `evals/local/2026-10-26-snapshot.json`; its snapshot and source-content digests are in the resumed readiness record. Reuse this file for the comparison rather than recapturing mutable branches. Bulky snapshots and transcripts stay in ignored `evals/local/`. Offline adapter/validator tests are not model-quality measurements.

The next environment did not retain that ignored local snapshot. The [continuation record](results/2026-10-26-continuation-readiness.json) records a labeled reconstruction from the same immutable revisions, a per-response content manifest, and successful offline preparation of all 24 cases. Its digests differ from the original; do not present it as the original artifact. Live runs use `evals/local/2026-10-26-reconstructed-snapshot.json`, digest `b32f458a35fb532af51f1b8b861bdab69dd05595e3253c2182f14f01a12c57b6`. Historical readiness records retain earlier authentication failures and the temporary workspace-credit blocker; the endpoint record supersedes those observations. Offline tests and environment readiness are not model-quality measurements.

## Configure and check

The CLI reads process environment variables. See [provider configuration](../docs/model-providers.md). Unlike Wrangler, it does not automatically load `.dev.vars`.

The current `answers-v3` instructions revise alias reasoning, service-owned scope/action answers, claim-kind selection, command eligibility, and contract-specific integration guidance. They remove the executable example that models copied into unrelated answers. V3 further emphasizes same-claim option citations, exact evidence IDs, and the distinction between known service limits and repository evidence. Evidence extraction, output schema, and validators remain unchanged.

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

This invokes inference and can incur charges. Every selected provider configuration, the complete reviewed case/source set, and an exclusive output-file reservation are checked before the first inference call. Existing output files are never overwritten. A preflight failure after reserving the file may leave an empty file; it is not an evaluation report. Each case runs once per selected provider. A rejected complete answer may receive one bounded correction attempt on the same provider; failed/truncated/refused calls and unavailable sources are not retried. All existing guards still apply. Different native models can run into separate reports with different `ANTHROPIC_MODEL` values and the same snapshot.

The default `--mode=fixed-evidence` omits source planning. `--mode=planned` instead runs the real planner, source retrieval and answer/correction path against the snapshot's closed source adapter. It records actual per-call input/instruction/data/schema hashes and source requests; top-level prepared answer-input/evidence hashes are null because the selected evidence is determined by the planner. A selected file missing from the snapshot fails retrieval without a network fallback. This is a snapshot-coverage limitation, not proof the upstream file is absent. Planned-mode latency and token estimates include the planner but exclude live GitHub latency and HTTP ingress. Keep the modes in separate cohorts.

`answerRepairVersion`, `repairAttempts`, and `modelCallInputs` identify correction behavior. Actual correction inputs differ from the first-pass input and are hashed separately; validation feedback is recorded. Count first-pass acceptance, corrected acceptance and remaining rejection separately. Estimates include all reported attempts, including rejected output, and remain estimates rather than billed costs. Historical single-call cohorts are unchanged.

For an intentional prompt revision against frozen evidence, add `--allow-prompt-change`. Without it, a snapshot/run prompt-version mismatch fails before inference. The flag preserves the original snapshot and its digest, records both `snapshotPromptVersion` and the run's `promptVersion`, and records `promptChangeAccepted`. Snapshot-format compatibility is still required. Reports additionally hash the user/data message separately from the full instruction-and-data messages, allowing evidence and prompt changes to be assessed independently. Do not edit an archived snapshot's prompt label or recapture mutable branches just to run a new prompt.

The report records:

- Exact questions and review checks, source snapshot/evidence/input-message/instruction hashes, prompt version, provider and requested/reported model IDs, and generation settings. Schema-constrained transports additionally record `outputSchemaSha256`; prompt-only historical runs and schema-constrained runs are distinct cohorts.
- Normalized raw completion text, completion status when supplied, reported token usage, and answer-generation latency. Truncated/refused completions remain rejected while their reported usage can still be recorded.
- Validated answer or sanitized rejection reason. Unknown usage stays null.
- Optional estimated token cost and its pricing basis; missing usage or prices stay null.
- `answerOrigin`, `inputSentToModel`, and policy/guidance versions distinguish model inference from server-owned answers. Prepared hashes on bypassed cases describe potential inputs, not transmitted messages. Server-owned responses have no model/schema identity and zero inference tokens/cost. Never count them as model-quality successes or include them in model latency medians.
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
