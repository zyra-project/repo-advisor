# Model provider configuration

`wrangler.jsonc` selects **GPT-6.1 Sol (`gpt-6.1-sol`)** through `openai-compatible` as the evaluated preview default, with strict schema output, medium reasoning effort, an 8192-token output cap and a 90-second per-call timeout. Supply `OPENAI_COMPATIBLE_API_KEY` separately. Missing credentials return `503` before retrieval or inference; there is no provider fallback or production deployment. The library still requires provider configuration: `/v1/answer` uses the request's `provider` ID, or `ADVISOR_PROVIDER`. Clients can select `workers-ai`, `openai-compatible`, or `anthropic`; model IDs, endpoint URLs, and credentials are server configuration, never request fields.

Recognized service-policy and conditional integration-checklist responses bypass provider configuration and inference. Their `generation.origin` distinguishes them from model answers; `model` and `settings` are null and model-call metrics are empty. Integration guidance still requires the configured contract sources; service-policy answers require neither sources nor credentials. Unrecognized questions retain the explicit provider requirement. See the [response contract and routing limits](api.md).

The [current comparison and assistant review](../evals/results/2026-10-27-current-model-comparison.json) reruns the final answer/evidence/command guards on the unchanged reconstructed 24-question snapshot. GPT and Opus 5.5 each deliver all 16 model cases and all six additional/focused model cases. Both also pass all 16 model cases with source-specific planning and expanded frozen-source coverage. GPT's concise answers, lower observed latency and estimated token cost support the preview choice; Opus is an explicitly configured alternative. Server-owned responses are excluded from model scores. Independent review, broader questions and real HTTP/live-source measurements remain outstanding; this is not production qualification. Earlier [correction/input](../evals/results/repair-v1-and-command-inputs.json), [guided-v1](../evals/results/guided-v1-comparison.json) and [v3](../evals/results/answers-v3-comparison.json) cohorts remain separate.

All adapters use the same prompt builder, evidence contracts and local validators. The adapter output allowance defaults to 2048 tokens per call; evaluated reasoning configurations explicitly use 8192. Workers AI and native Anthropic send the canonical server-defined schemas through their respective API formats. Compatible endpoints support JSON-object mode or explicit strict JSON-schema mode. The answer validator requires bare JSON from every adapter. Temperature is omitted and recorded as `provider-default`, not claimed to be identical or deterministic across models. No vendor SDK is installed in runtime dependencies.

One complete answer that fails local validation may receive one correction call on the same provider/model. It uses the original evidence/schema, static versioned correction instructions, and the rejected response plus sanitized feedback as untrusted data. Both attempts count toward latency and usage. Provider failures, refusal/truncation, source-plan errors and retrieval failures stop without correction. This bounds a normal model request to three calls including planning; it never changes providers or relaxes validation.

Native Anthropic additionally accepts server-side `ANTHROPIC_THINKING` (`adaptive` or `disabled`), `ANTHROPIC_EFFORT` (`low`, `medium`, `high`, `xhigh`, `max`), `ANTHROPIC_MAX_OUTPUT_TOKENS` (256–32768; default 2048) and `ANTHROPIC_TIMEOUT_MS` (1000–90000; default 45000). Unsupported model combinations fail at the API without dropping settings. Adaptive mode requests omitted thinking display; the adapter discards thinking/redacted-thinking blocks and retains only final text plus a count of omitted blocks. Usage preserves the API's total output tokens, including internal reasoning. A missing reasoning-token breakdown is not guessed from answer length.

The 5.5 comparison explicitly uses adaptive thinking, medium effort, an 8192-token combined thinking/answer cap, and a 90000-ms per-call timeout on all three models. The HTTP route still has a 90-second overall request deadline. Equal effort labels do not guarantee equal reasoning compute across models. Thinking settings, effort and token limits are recorded in the reports, and the older 2048-token cohorts remain separate. See [Anthropic's thinking cost controls](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost) and [effort guidance](https://platform.claude.com/docs/en/build-with-claude/effort).

## OpenAI-compatible endpoint

Copy `.dev.vars.example` to `.dev.vars` and configure:

```dotenv
ADVISOR_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_MODEL=YOUR_SELECTED_MODEL
OPENAI_COMPATIBLE_API_KEY=YOUR_KEY
```

Choose a model and endpoint that support Chat Completions with `response_format: { "type": "json_object" }`. The adapter appends `/chat/completions` to the base URL and requires HTTPS without embedded credentials, query parameters, or fragments. Redirects are rejected. Authentication is a server-side bearer token. OpenAI's endpoint uses `max_completion_tokens`; other endpoints default to `max_tokens`. Set `OPENAI_COMPATIBLE_TOKEN_PARAMETER` to either spelling when a compatible endpoint needs an override. Unsupported model settings fail as provider errors rather than silently dropping output limits.

For the verified GPT-6.1 configuration, also set:

```dotenv
OPENAI_COMPATIBLE_MODEL=gpt-6.1-sol
OPENAI_COMPATIBLE_RESPONSE_FORMAT=json_schema
OPENAI_COMPATIBLE_REASONING_EFFORT=medium
OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS=8192
OPENAI_COMPATIBLE_TIMEOUT_MS=90000
```

`OPENAI_COMPATIBLE_RESPONSE_FORMAT` accepts `json_object` (the adapter default) or `json_schema`. Strict mode sends the canonical contract as equivalent closed-object variants: an optional option value is either absent or a string, rather than a new nullable value. The server accepts the same answer contract and records both canonical and transport schema hashes. Strict conversion accepts only bounded closed server schemas and fails rather than weakening unsupported schemas. The model and endpoint must support these settings; there is no automatic downgrade. Reasoning effort accepts `low`, `medium`, `high`, `xhigh`, or `max`; output and timeout ranges match the native settings above. Reported completion tokens include reasoning when the API includes it, but reasoning text is never requested or stored.

The existing environment credential named `OPENAI_COMPATIBLE_API_KEY` was confirmed by its owner to be an OpenAI key. Model listing and strict-schema inference both succeeded at `api.openai.com`. Evaluation commands override the previously mismatched base URL explicitly; configuration presence alone did not establish working inference. See the [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat) for current model and parameter support.

## Native Anthropic Messages

Set `ADVISOR_PROVIDER=anthropic`, `ANTHROPIC_MODEL` to an authorized model ID, and `ANTHROPIC_API_KEY`. This adapter sends only that key to the fixed `https://api.anthropic.com/v1/messages` endpoint with Anthropic's version header. Instructions stay in `system`; the question and untrusted evidence stay in the user message. It does not use `OPENAI_COMPATIBLE_API_KEY` or the configurable external base URL.

Both source planning and answers supply a server-defined schema. Schema constraints enforce output shape; the local validators still enforce bounds, citations, authority, and command names. Select a model supporting [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). No schema is accepted from the client or repository content, and missing schema or unsupported API settings fail without a prompt-only fallback. Evaluation records include the schema hash so prompt-only and schema-constrained runs remain distinguishable.

Text blocks are joined without removing fences or repairing JSON. Truncations, refusals, malformed content, and unsupported content blocks remain rejected. Reported native input/output counts are normalized; cache creation and read tokens, when supplied, count toward input usage. Token-rate estimates still exclude caching price adjustments. No tool-use support is implemented.

For a native-only baseline, run `ANTHROPIC_MODEL=YOUR_MODEL npm run eval:run -- --providers=anthropic --snapshot=... --out=...`. Choose multiple transports explicitly with `--providers=workers-ai,anthropic`. The CLI defaults to the original Workers AI/OpenAI-compatible pair for backward compatibility; it never silently skips a selected unavailable provider.

## Workers AI binding

Set `ADVISOR_PROVIDER=workers-ai` and `WORKERS_AI_MODEL` to a model that supports JSON-schema mode. Start the explicit binding configuration:

```sh
npx wrangler dev --config wrangler.ai.example.jsonc
```

This uses `env.AI.run()`. **Workers AI inference uses your Cloudflare account even in local development.** The default `npm run dev` does not activate that binding. See [Cloudflare's binding guide](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/) and [JSON mode support](https://developers.cloudflare.com/workers-ai/features/json-mode/).

## Workers AI REST

The Node comparison runner cannot use a Worker binding. Configure `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `WORKERS_AI_MODEL` to use Cloudflare's REST endpoint instead. The token needs authorization for the account's Workers AI inference. Cloudflare's [REST setup guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) recommends its Workers AI token template, or both `Workers AI - Read` and `Workers AI - Edit` permissions when configuring a token manually. An active token and access to the account list do not establish Workers AI access. These variables also work in the Worker when an AI binding is not present. With both transports available, the binding takes precedence.

The REST adapter checks Cloudflare's `success/result` envelope. Both transports send the server-defined schema as `response_format: { type: "json_schema", json_schema: ... }`, following Cloudflare's documented format. Missing schema is rejected before inference; unsupported model settings fail without falling back to weaker constraints. Both transports accept text responses, object responses from JSON mode, and OpenAI-style completion envelopes. Missing or invalid token usage stays unknown; it is never guessed from character counts. API JSON mode is not treated as proof of valid output: local parsing and answer checks still reject malformed responses.

## Failure and cancellation

Each model call defaults to a 45-second response timeout; the native and compatible adapters allow a server-configured timeout up to 90 seconds. The answer route has a 90-second overall cancellation signal, including source retrieval, planning, answer and any correction. A cancelled request does not start a binding call. Once binding inference has started, the application can stop waiting, but the binding API does not guarantee that the underlying inference or its charges are cancelled.

Quota failures, HTTP errors, transport exceptions, and invalid configuration return sanitized `503 provider_unavailable` responses. Refused, truncated, empty, malformed, or oversized completions return `502 invalid_model_output`. Invalid answer JSON, citations, or command suggestions are blocked by the answer validator. The single bounded answer correction described above is the only retry; a request makes at most three model calls and never changes providers. A failed or rejected response can still incur provider charges.

Repository data stays in the user/data message, separate from server instructions. Prompts use explicit evidence IDs, source classifications, and fixed revisions. Guards check structure, evidence membership, and command/option names; they cannot prove that every sentence is true or that a cited passage entails a claim. Use the human evaluation rubric before selecting a model or exposing the service publicly.
