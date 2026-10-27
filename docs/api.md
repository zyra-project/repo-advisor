# Repository advisor API

All responses are JSON with `Cache-Control: no-store`. Only `/v1/answer` invokes a configured LLM. No endpoint writes to GitHub, runs Zyra, or changes Terraviz state. No browser CORS policy is enabled yet; cross-origin Orbit integration is future work.

## GET /health

Returns `200` with `{ "status": "ok", "service": "repo-advisor", "stage": "answers-preview" }`. This is process health, not a source or model connectivity probe.

## GET /v1/projects

Returns `200` with `{ "projects": [...] }`. Each profile includes its repository, default ref, configured source IDs and classifications, related project IDs, and contribution policy. This route makes no network requests.

## POST /v1/evidence

Requires `Content-Type: application/json` and a JSON object no larger than 16 KiB. Unknown fields are rejected.

| Field | Required | Meaning |
| --- | --- | --- |
| `project` | Yes | Configured project ID: `zyra` or `terraviz` |
| `source` | Yes | Source ID from the project's profile |
| `ref` | No | Branch, tag, or commit; defaults to the profile's default ref |
| `command` | For exact CLI lookups | Manifest name such as `acquire api`; no `zyra` prefix or shell arguments |
| `options` | No; exact CLI only | Up to 100 option names such as `--output`, without values |

References accept up to 200 letters, digits, dots, underscores, dashes, and slashes, starting with a letter or digit. Command names accept lowercase command words separated by single spaces. URLs, repositories, arbitrary paths, and option values are not request fields.

### Document evidence

```json
{
  "project": "terraviz",
  "source": "self-hosting",
  "ref": "main"
}
```

The result has `status: "evidence"`, a source `classification`, `requestedRef`, `commitSha`, `content` containing the full document, and `citations`. Each citation includes `repository`, `path`, `commitSha`, immutable GitHub `url`, and `retrievedAt`.

Documents classified as `vision` describe plans; their contents must not be presented as shipped capability. Retrieved Markdown is data and must not be executed or rendered as unsanitized HTML by a future client.

Sources of kind `cli-index` return `status: "index"` with validated `domains` and `aliases`. Sources of kind `cli-catalog` return `status: "catalog"` with the validated command-entry map in `commands`. Both include revision and citation metadata. They accept neither `command` nor `options`. Catalogs support discovery; an exact negative lookup is needed to establish a manifest gap.

### CLI evidence

```json
{
  "project": "zyra",
  "source": "cli",
  "command": "import api",
  "options": ["--output"]
}
```

The result includes:

- `status`: `supported`, `unsupported_options`, or `not_in_manifest`.
- `command`: the exact requested name.
- `canonicalCommand`: alias ownership resolved through the manifest index.
- `entry`: the complete manifest entry, when found.
- `unsupportedOptions`: supplied flag names not present in that entry; empty when no entry is found or no unsupported flags were requested.
- `validation`: always `command-and-option-names-only`.
- `classification`, `requestedRef`, `commitSha`, and `citations` as for document evidence.

An unknown stage is checked against the successfully read index and cites that index. An unknown command within a known stage cites both the index and the successfully read domain manifest. HTTP `200` describes a completed lookup, including a verified absence. Clients must inspect `status` before offering a command.

Each response reads files from one immutable commit. The maximum size per source or GitHub metadata response is 512 KiB. Each upstream fetch has a 10-second timeout. The service rejects redirects, so a moved repository requires a profile update.

### Errors

```json
{
  "error": {
    "code": "source_unavailable",
    "message": "Could not retrieve the source. Its contents were not verified."
  }
}
```

| HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Missing, malformed, incompatible, or unknown request fields |
| 404 | `unknown_project`, `unknown_source`, `not_found` | Unconfigured project/source or route |
| 405 | `method_not_allowed` | Wrong HTTP method; `Allow` names the supported method |
| 413 | `content_too_large` | Request body exceeds the limit |
| 413 | `context_too_large` | Selected evidence exceeds the serialized model input budget |
| 415 | `unsupported_media_type` | Body was not submitted as JSON |
| 502 | `source_unavailable` | Upstream HTTP error, network/timeout/redirect failure, invalid UTF-8, or oversized upstream content |
| 502 | `invalid_source` | Invalid upstream JSON, unexpected manifest structure, or unsafe source location |
| 502 | `invalid_model_output` | Malformed, truncated, refused, or unverified model output was blocked |
| 503 | `provider_unavailable` | No selected/configured provider, invalid configuration, quota, or transport failure |
| 500 | `internal_error` | Unexpected internal failure; details are not returned |

GitHub `404`, `403`, and `429` are retrieval failures, not capability evidence. Errors do not contain raw upstream bodies, credentials, or network exception details. The foundation has no stale-cache fallback.

## POST /v1/answer

Requires JSON with the same 16 KiB body limit. Unknown fields are rejected.

```json
{
  "question": "How can Zyra fetch a file over HTTP?",
  "projects": [{ "id": "zyra", "ref": "main" }],
  "provider": "workers-ai"
}
```

`question` is nonempty and at most 4000 characters. `projects` contains one or two distinct configured IDs, each with an optional ref. Model-generated answers require `provider` or server-side `ADVISOR_PROVIDER`. Supported IDs are `workers-ai`, `openai-compatible`, and `anthropic`. Provider model names, endpoints, credentials, source URLs, and arbitrary paths are not request fields. No default provider is selected automatically. Recognized server-policy and integration-guidance requests need no model configuration.

The route seeds overview/index evidence, makes one bounded source-planning call, reads approved sources at fixed project revisions, and makes one answer call. It then validates the output before returning it. Selected-source failures do not become unsupported-capability claims or partial unverified answers. There is no automatic retry or fallback provider. The overall cancellation signal is 90 seconds; each model call is limited to a 45-second wait. A binding may continue inference after the application stops waiting.

An answered response has:

- `status: "answered"`.
- `answer.summary`, `answer.details[]`, and `answer.nextSteps[]`: claims with `text`, `kind` (`current`, `planned`, `uncertain`, `gap`), and `evidence` IDs.
- `answer.commands[]`: structured Zyra names, positional strings, named options with optional string values, a server-rendered `shell` string, and an evidence ID for the final exact check.
- `sources[]`: IDs, project/source names, status/classification, requested refs, resolved commits, and immutable citations. Raw documents are available through the evidence route rather than duplicated here.
- `markdown`: server-rendered prose, source links, and checked command suggestions. Clients must still use a safe Markdown renderer.
- `generation`: `origin: "model"` for inference, `origin: "service-policy"` with policy version and matched topics, or `origin: "integration-guidance"` with guidance version and task.
- `model`: provider ID, requested model, and reported model identity for inference; `null` for server-owned responses.
- `metrics`: elapsed time and per-call phase, model latency, and reported usage when supplied. Missing usage is omitted rather than estimated.
- `promptVersion`, `settings`, and `validation`: input/output limits, explicit provider-default temperature behavior, and the limits of validation.

Recognized English questions about this advisor's GitHub submission history, private/arbitrary-source access, cursor readings, advisor outages affecting Orbit, or source instructions receive a versioned server-policy response before provider configuration, retrieval or inference. They have empty sources, no fabricated repository citations, `settings: null`, and no model calls. The existing `uncertain` claim kind means these service facts are not repository evidence; the server-owned prose does not prefix known policy with uncertainty.

Recognized questions selecting both projects about metadata ownership, coordinated implementation plans or a publishing handoff receive a conditional review checklist. Curated selectors retrieve the producer schema and consumer validation/mutation sources at independent pinned revisions; plan guidance also retrieves contribution sources. Missing sources return a retrieval error rather than a guessed answer or model fallback. Links identify sources to inspect, not proof that a payload is valid. The checklist asks for errors, versions and payloads, separates conditional repository changes, and specifies integration tests and documentation. It neither diagnoses the actual error nor claims a ready-made integration or successful publishing.

Routing uses a bounded English topic recognizer, not an unrestricted semantic classifier. It can miss paraphrases or route a compound request to only its recognized boundary/checklist; ask unrelated repository questions separately. Unrecognized questions use the model flow and its existing guards. `generation` is assigned by the server; models cannot add or forge it. Server-owned responses make no issue searches, submissions or commands.

Model-generated requests can include `plan`, `answer`, and one `repair` phase. A complete answer rejected by local validation gets one correction attempt with the same evidence and output schema; a replacement passes all existing guards before rendering. Provider errors, refused/truncated completions, source-plan errors and retrieval failures do not trigger correction. Two rejected answers return `502 invalid_model_output` without exposing either draft. The request retains its 90-second deadline; correction can increase latency and token use. Call metrics include both successful generation attempts when a corrected answer is returned.

Native reasoning configuration is server-owned, never a request field. Settings record thinking mode, effort, output cap and per-call timeout when configured. Thinking and redacted-thinking content are discarded by the adapter; answer responses contain final text only. Reported output-token usage includes internal reasoning even when its content is omitted.

Source planning uses `source-plan-v2`, a schema built from the selected projects' curated source definitions. Exact CLI lookups require a command name; catalog and document reads forbid command/options fields. These rules are also checked locally before additional retrieval. Invalid model-selected fields return `502 invalid_model_output`; unavailable approved sources remain retrieval failures. Strict compatible transports preserve optional fields using equivalent closed-object variants and record a distinct transport schema hash in evaluations.

Claim references must name supplied evidence IDs. Current claims cannot cite roadmap-only or negative capability evidence; planned claims require vision/governance sources; gap claims require a successful exact negative lookup. Partial catalogs and excerpts are not proof of absence. Uncertain claims may have no references when the needed evidence is unavailable or unspecified.

The `answers-v3` prompt also uses `uncertain` with no references for proposed next actions and server-defined service-scope statements, such as the advisor's inability to submit an issue or inspect the user's cursor. In these cases the label means not established by repository evidence; it does not imply doubt about the service's own configured limits. Such statements must not borrow an unrelated repository citation. This is a prompt instruction, not a guarantee of compliance; live evaluations retain accepted semantic failures.

Command suggestions must occur in retrieved capability evidence and pass an exact command/option-name lookup at the same revision. The server quotes argument values but does not completely validate argument requirements, meaning, prerequisites, or execution. Invalid model output returns `502` rather than exposing an unchecked draft. These guards do not prove factual correctness or semantic citation entailment; `validation.claimSemantics` is `requires-review`.

The `command-inputs-v1` guard additionally requires nonempty argument values that occur literally in the user's question, and checks mandatory positional/option presence where the manifest annotates `required: true`. Documentation examples alone cannot supply command values. This is a literal-input and annotated-presence check; it does not prove intent, types, choices, positional order, prerequisites or complete argument validity. Missing annotations are not evidence that no arguments are required. Models should ask for missing inputs and leave command drafts empty.
