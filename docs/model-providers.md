# Model provider configuration

Neither a provider nor a model is selected by default. `/v1/answer` uses the request's `provider` ID, or `ADVISOR_PROVIDER` when configured. Clients can select only `workers-ai` or `openai-compatible`; model IDs, endpoint URLs, and credentials are server configuration. They are not request fields.

The two adapters use the same prompt builder, evidence contracts, JSON-object response mode, and maximum output allowance of 2048 tokens per call. Temperature is omitted and recorded as `provider-default`, not claimed to be identical or deterministic across models. No vendor SDK is installed in runtime dependencies.

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

## Workers AI binding

Set `ADVISOR_PROVIDER=workers-ai` and `WORKERS_AI_MODEL` to a model that supports JSON mode. Start the explicit binding configuration:

```sh
npx wrangler dev --config wrangler.ai.example.jsonc
```

This uses `env.AI.run()`. **Workers AI inference uses your Cloudflare account even in local development.** The default `npm run dev` does not activate that binding. See [Cloudflare's binding guide](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/) and [JSON mode support](https://developers.cloudflare.com/workers-ai/features/json-mode/).

## Workers AI REST

The Node comparison runner cannot use a Worker binding. Configure `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `WORKERS_AI_MODEL` to use Cloudflare's REST endpoint instead. The token needs authorization for the account's Workers AI inference. These variables also work in the Worker when an AI binding is not present. With both transports available, the binding takes precedence.

The REST adapter checks Cloudflare's `success/result` envelope. Both transports accept text responses, object responses from JSON mode, and OpenAI-style completion envelopes. Missing or invalid token usage stays unknown; it is never guessed from character counts.

## Failure and cancellation

Each model call has a 45-second response timeout. The answer route has a 90-second overall cancellation signal, including source retrieval and both model phases. A cancelled request does not start a binding call. Once binding inference has started, the application can stop waiting, but the binding API does not guarantee that the underlying inference or its charges are cancelled.

Quota failures, HTTP errors, transport exceptions, and invalid configuration return sanitized `503 provider_unavailable` responses. Refused, truncated, empty, malformed, or oversized completions return `502 invalid_model_output`. Invalid answer JSON, citations, or command suggestions are blocked by the answer validator. There is no automatic retry or model fallback in this preview, so one request makes at most two model calls. A failed or rejected response can still incur provider charges.

Repository data stays in the user/data message, separate from server instructions. Prompts use explicit evidence IDs, source classifications, and fixed revisions. Guards check structure, evidence membership, and command/option names; they cannot prove that every sentence is true or that a cited passage entails a claim. Use the human evaluation rubric before selecting a model or exposing the service publicly.
