# Model provider configuration

Neither a provider nor a model is selected by default. `/v1/answer` uses the request's `provider` ID, or `ADVISOR_PROVIDER` when configured. Clients can select `workers-ai`, `openai-compatible`, or `anthropic`; model IDs, endpoint URLs, and credentials are server configuration. They are not request fields.

All adapters use the same prompt builder, evidence contracts, and maximum output allowance of 2048 tokens per call. Workers AI and native Anthropic use the same server-defined planning/answer schemas through their respective API formats and record `responseFormat: "json_schema"`. Compatible endpoints request JSON-object mode. The answer validator requires bare JSON from every adapter. Temperature is omitted and recorded as `provider-default`, not claimed to be identical or deterministic across models. No vendor SDK is installed in runtime dependencies.

## OpenAI-compatible endpoint

Copy `.dev.vars.example` to `.dev.vars` and configure:

```dotenv
ADVISOR_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_MODEL=YOUR_SELECTED_MODEL
OPENAI_COMPATIBLE_API_KEY=YOUR_KEY
```

Choose a model and endpoint that support Chat Completions with `response_format: { "type": "json_object" }`. The adapter appends `/chat/completions` to the base URL and requires HTTPS without embedded credentials, query parameters, or fragments. Redirects are rejected. Authentication is a server-side bearer token. OpenAI's endpoint uses `max_completion_tokens`; other endpoints default to `max_tokens`. Set `OPENAI_COMPATIBLE_TOKEN_PARAMETER` to either spelling when a compatible endpoint needs an override. Unsupported model settings fail as provider errors rather than silently dropping output limits.

No OpenAI model is preselected. See the [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat) for current model and parameter support.

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

Each model call has a 45-second response timeout. The answer route has a 90-second overall cancellation signal, including source retrieval and both model phases. A cancelled request does not start a binding call. Once binding inference has started, the application can stop waiting, but the binding API does not guarantee that the underlying inference or its charges are cancelled.

Quota failures, HTTP errors, transport exceptions, and invalid configuration return sanitized `503 provider_unavailable` responses. Refused, truncated, empty, malformed, or oversized completions return `502 invalid_model_output`. Invalid answer JSON, citations, or command suggestions are blocked by the answer validator. There is no automatic retry or model fallback in this preview, so one request makes at most two model calls. A failed or rejected response can still incur provider charges.

Repository data stays in the user/data message, separate from server instructions. Prompts use explicit evidence IDs, source classifications, and fixed revisions. Guards check structure, evidence membership, and command/option names; they cannot prove that every sentence is true or that a cited passage entails a claim. Use the human evaluation rubric before selecting a model or exposing the service publicly.
