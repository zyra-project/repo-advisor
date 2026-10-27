// SPDX-License-Identifier: Apache-2.0

import { AdvisorError, isRecord } from "./errors";
import { readLimitedText } from "./github";
import { modelMessages } from "./prompts";
import { strictSchema } from "./strict-schema";
import type { Env, Fetcher, GenerationSettings, ModelInput, ModelProvider, ModelResult } from "./types";

export const GENERATION_SETTINGS = Object.freeze({ maxOutputTokens: 2048, responseFormat: "json_object" as const, temperature: "provider-default" as const });
export const PROVIDER_IDS = ["workers-ai", "openai-compatible", "anthropic"] as const;
export type ProviderId = typeof PROVIDER_IDS[number];

export function evaluationProviderIds(value = "workers-ai,openai-compatible"): ProviderId[] {
  const selected = value.split(",");
  if (new Set(selected).size !== selected.length || selected.some((id) => !PROVIDER_IDS.includes(id as ProviderId))) {
    throw new AdvisorError("invalid_arguments", "Supply distinct known IDs in --providers=...", 400);
  }
  return selected as ProviderId[];
}

function unavailable(message = "The configured model provider is unavailable."): AdvisorError {
  return new AdvisorError("provider_unavailable", message, 503);
}

function invalidResponse(): never {
  throw new AdvisorError("invalid_model_output", "The provider did not return a usable model response.", 502);
}

function usage(value: unknown): ModelResult["usage"] {
  if (!isRecord(value) || !Number.isSafeInteger(value.prompt_tokens) || !Number.isSafeInteger(value.completion_tokens) ||
    (value.prompt_tokens as number) < 0 || (value.completion_tokens as number) < 0) return undefined;
  return { inputTokens: value.prompt_tokens as number, outputTokens: value.completion_tokens as number };
}

function extract(value: unknown, requestedModel: string): ModelResult {
  if (!isRecord(value)) invalidResponse();
  let text: unknown = value.response;
  let completionStatus: ModelResult["completionStatus"] = "complete";
  let finishReason: string | undefined;
  if (Array.isArray(value.choices)) {
    const choice = value.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) invalidResponse();
    if (choice.finish_reason !== undefined && choice.finish_reason !== "stop") completionStatus = "incomplete";
    if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason;
    if (typeof choice.message.refusal === "string" && choice.message.refusal) completionStatus = "refused";
    text = choice.message.content;
    if (text === null && completionStatus === "refused") text = "";
  }
  // Workers AI JSON mode can return an object in response, rather than a string.
  if (isRecord(text)) text = JSON.stringify(text);
  if (typeof text !== "string" || (text.length === 0 && completionStatus === "complete") || text.length > 64 * 1024) invalidResponse();
  return { text, model: typeof value.model === "string" && value.model ? value.model : requestedModel,
    completionStatus, finishReason, usage: usage(value.usage) };
}

function extractAnthropic(value: unknown, requestedModel: string): ModelResult {
  if (!isRecord(value) || value.type !== "message" || !Array.isArray(value.content) ||
    typeof value.stop_reason !== "string") invalidResponse();
  const texts: string[] = [];
  let thinkingBlocksOmitted = 0;
  for (const block of value.content) {
    if (!isRecord(block)) invalidResponse();
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
    else if ((block.type === "thinking" && typeof block.thinking === "string") ||
      (block.type === "redacted_thinking" && typeof block.data === "string")) thinkingBlocksOmitted++;
    else invalidResponse();
  }
  const text = texts.join("");
  const completionStatus = value.stop_reason === "refusal" ? "refused" :
    ["end_turn", "stop_sequence"].includes(value.stop_reason) ? "complete" : "incomplete";
  if ((text.length === 0 && completionStatus === "complete") || text.length > 64 * 1024) invalidResponse();
  let normalizedUsage: ModelResult["usage"];
  if (isRecord(value.usage)) {
    const counts = [value.usage.input_tokens, value.usage.cache_creation_input_tokens ?? 0,
      value.usage.cache_read_input_tokens ?? 0, value.usage.output_tokens];
    if (counts.every((count) => Number.isSafeInteger(count) && (count as number) >= 0)) {
      const [input, created, read, output] = counts as [number, number, number, number];
      if (Number.isSafeInteger(input + created + read)) normalizedUsage = { inputTokens: input + created + read, outputTokens: output };
    }
  }
  return { text, model: typeof value.model === "string" && value.model ? value.model : requestedModel,
    completionStatus, finishReason: value.stop_reason, usage: normalizedUsage,
    ...(thinkingBlocksOmitted ? { thinkingBlocksOmitted } : {}) };
}

function anthropicSettings(env: Env): Partial<GenerationSettings> {
  const integer = (value: string | undefined, fallback: number, min: number, max: number) => {
    if (value === undefined) return fallback;
    if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
      throw unavailable("The native Anthropic generation settings are invalid.");
    }
    return Number(value);
  };
  if (env.ANTHROPIC_THINKING !== undefined && !["adaptive", "disabled"].includes(env.ANTHROPIC_THINKING) ||
    env.ANTHROPIC_EFFORT !== undefined && !["low", "medium", "high", "xhigh", "max"].includes(env.ANTHROPIC_EFFORT)) {
    throw unavailable("The native Anthropic generation settings are invalid.");
  }
  return {
    maxOutputTokens: integer(env.ANTHROPIC_MAX_OUTPUT_TOKENS, GENERATION_SETTINGS.maxOutputTokens, 256, 32768),
    timeoutMs: integer(env.ANTHROPIC_TIMEOUT_MS, 45000, 1000, 90000),
    ...(env.ANTHROPIC_THINKING ? { thinking: env.ANTHROPIC_THINKING as "adaptive" | "disabled" } : {}),
    ...(env.ANTHROPIC_THINKING === "adaptive" ? { thinkingDisplay: "omitted" as const } : {}),
    ...(env.ANTHROPIC_EFFORT ? { effort: env.ANTHROPIC_EFFORT as GenerationSettings["effort"] } : {}),
  };
}

function compatibleSettings(env: Env): Partial<GenerationSettings> {
  const format = env.OPENAI_COMPATIBLE_RESPONSE_FORMAT ?? "json_object";
  const effort = env.OPENAI_COMPATIBLE_REASONING_EFFORT;
  const integer = (value: string | undefined, fallback: number, min: number, max: number) => {
    if (value === undefined) return fallback;
    if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) {
      throw unavailable("The compatible generation settings are invalid.");
    }
    return Number(value);
  };
  if (!["json_object", "json_schema"].includes(format) || effort !== undefined && !["low", "medium", "high", "xhigh", "max"].includes(effort)) {
    throw unavailable("The compatible generation settings are invalid.");
  }
  return { responseFormat: format as GenerationSettings["responseFormat"],
    maxOutputTokens: integer(env.OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS, 2048, 256, 32768),
    timeoutMs: integer(env.OPENAI_COMPATIBLE_TIMEOUT_MS, 45000, 1000, 90000),
    ...(effort ? { effort: effort as GenerationSettings["effort"] } : {}),
    ...(format === "json_schema" ? { schemaTransport: "closed-object-variants" as const } : {}) };
}

async function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw unavailable();
  let abort: () => void = () => {};
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      abort = () => reject(unavailable());
      signal.addEventListener("abort", abort, { once: true });
    })]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function postJson(fetcher: Fetcher, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetcher(url, {
    method: "POST", redirect: "error", signal,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.body) void response.body.cancel().catch(() => {});
    throw unavailable();
  }
  return JSON.parse(await readLimitedText(response, 128 * 1024));
}

export function providerReadiness(env: Env) {
  return PROVIDER_IDS.map((id) => {
    const missing: string[] = [];
    if (id === "workers-ai") {
      if (!env.WORKERS_AI_MODEL) missing.push("WORKERS_AI_MODEL");
      if (!env.AI && !(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN)) missing.push("AI binding or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN");
    } else if (id === "anthropic") {
      if (!env.ANTHROPIC_MODEL) missing.push("ANTHROPIC_MODEL");
      if (!env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
    } else {
      for (const name of ["OPENAI_COMPATIBLE_MODEL", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_API_KEY"] as const) {
        if (!env[name]) missing.push(name);
      }
    }
    return { id, configured: missing.length === 0, missing };
  });
}

export function createProvider(env: Env, selection: string | undefined, fetcher: Fetcher = fetch): ModelProvider {
  if (!PROVIDER_IDS.includes(selection as ProviderId)) {
    throw unavailable("Select a configured provider or configure ADVISOR_PROVIDER.");
  }
  const readiness = providerReadiness(env).find((item) => item.id === selection)!;
  if (!readiness.configured) throw unavailable("The selected provider is not configured.");
  const id = selection as ProviderId;
  const model = id === "workers-ai" ? env.WORKERS_AI_MODEL! : id === "anthropic" ? env.ANTHROPIC_MODEL! : env.OPENAI_COMPATIBLE_MODEL!;
  let url: string | undefined;
  let tokenParameter = "max_tokens";
  if (id === "openai-compatible") {
    try {
      const base = new URL(env.OPENAI_COMPATIBLE_BASE_URL!);
      if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error();
      url = base.href.replace(/\/+$/, "") + "/chat/completions";
      tokenParameter = env.OPENAI_COMPATIBLE_TOKEN_PARAMETER ?? (base.hostname === "api.openai.com" ? "max_completion_tokens" : "max_tokens");
      if (!["max_tokens", "max_completion_tokens"].includes(tokenParameter)) throw new Error();
    } catch {
      throw unavailable("The external provider configuration is invalid.");
    }
  } else if (id === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
  } else if (!env.AI) {
    if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID!) ||
      !/^@(cf|hf)\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(model) ||
      model.split("/").some((part) => part === "." || part === "..")) throw unavailable("The Workers AI configuration is invalid.");
    url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
  }

  const settings: GenerationSettings = { ...GENERATION_SETTINGS,
    responseFormat: id === "openai-compatible" ? "json_object" : "json_schema",
    tokenParameter: tokenParameter as "max_tokens" | "max_completion_tokens",
    ...(id === "anthropic" ? anthropicSettings(env) : id === "openai-compatible" ? compatibleSettings(env) : {}) };
  const schemaForTransport = id === "openai-compatible" && settings.responseFormat === "json_schema" ? strictSchema : undefined;
  return {
    id, model, settings, ...(schemaForTransport ? { schemaForTransport } : {}),
    async generate(input: ModelInput): Promise<ModelResult> {
      const timeout = settings.timeoutMs ?? 45000;
      const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
      // A cancelled request must not start inference, including through a binding.
      if (signal.aborted) throw unavailable();
      if ((id !== "openai-compatible" || settings.responseFormat === "json_schema") && !input.responseSchema) throw unavailable("Structured output requires a server-defined response schema.");
      const messages = modelMessages(input);
      const body = id === "anthropic" ? { model, system: messages[0]!.content, messages: messages.slice(1),
        max_tokens: settings.maxOutputTokens,
        ...(settings.thinking ? { thinking: { type: settings.thinking,
          ...(settings.thinkingDisplay ? { display: settings.thinkingDisplay } : {}) } } : {}),
        output_config: { format: { type: "json_schema", schema: input.responseSchema },
          ...(settings.effort ? { effort: settings.effort } : {}) } } : { ...(id === "workers-ai" ? {} : { model }), messages,
        response_format: id === "workers-ai" ? { type: "json_schema", json_schema: input.responseSchema } :
          schemaForTransport ? { type: "json_schema", json_schema: { name: "repo_advisor", strict: true, schema: schemaForTransport(input.responseSchema!) } } : { type: "json_object" },
        ...(id === "openai-compatible" && settings.effort ? { reasoning_effort: settings.effort } : {}),
        [id === "workers-ai" ? "max_tokens" : tokenParameter]: settings.maxOutputTokens };
      try {
        let result: unknown;
        if (id === "workers-ai" && env.AI) {
          result = await bounded(env.AI.run(model, body), signal);
        } else {
          const headers: Record<string, string> = id === "anthropic" ? { "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" } :
            { Authorization: `Bearer ${id === "workers-ai" ? env.CLOUDFLARE_API_TOKEN! : env.OPENAI_COMPATIBLE_API_KEY!}` };
          result = await postJson(fetcher, url!, headers, body, signal);
          if (id === "workers-ai") {
            if (!isRecord(result) || result.success !== true) throw unavailable();
            result = result.result;
          }
        }
        return id === "anthropic" ? extractAnthropic(result, model) : extract(result, model);
      } catch (error) {
        if (error instanceof AdvisorError && error.code === "invalid_model_output") throw error;
        // SDK/provider exception text and HTTP bodies can contain credentials; never reflect them.
        throw unavailable();
      }
    },
  };
}
