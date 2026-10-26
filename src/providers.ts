// SPDX-License-Identifier: Apache-2.0

import { AdvisorError, isRecord } from "./errors";
import { readLimitedText } from "./github";
import { modelMessages } from "./prompts";
import type { Env, Fetcher, ModelInput, ModelProvider, ModelResult } from "./types";

export const GENERATION_SETTINGS = Object.freeze({ maxOutputTokens: 2048, responseFormat: "json_object" as const, temperature: "provider-default" as const });
export const PROVIDER_IDS = ["workers-ai", "openai-compatible"] as const;
export type ProviderId = typeof PROVIDER_IDS[number];

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

async function postJson(fetcher: Fetcher, url: string, key: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetcher(url, {
    method: "POST", redirect: "error", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
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
    throw unavailable("Select a configured provider explicitly; no default model has been chosen.");
  }
  const readiness = providerReadiness(env).find((item) => item.id === selection)!;
  if (!readiness.configured) throw unavailable("The selected provider is not configured.");
  const id = selection as ProviderId;
  const model = id === "workers-ai" ? env.WORKERS_AI_MODEL! : env.OPENAI_COMPATIBLE_MODEL!;
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
  } else if (!env.AI) {
    if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID!) ||
      !/^@(cf|hf)\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(model) ||
      model.split("/").some((part) => part === "." || part === "..")) throw unavailable("The Workers AI configuration is invalid.");
    url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
  }

  return {
    id, model, settings: { ...GENERATION_SETTINGS, tokenParameter: (id === "workers-ai" ? "max_tokens" : tokenParameter) as "max_tokens" | "max_completion_tokens" },
    async generate(input: ModelInput): Promise<ModelResult> {
      const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000);
      // A cancelled request must not start inference, including through a binding.
      if (signal.aborted) throw unavailable();
      const messages = modelMessages(input);
      const body = { ...(id === "workers-ai" ? {} : { model }), messages, response_format: { type: "json_object" },
        [id === "workers-ai" ? "max_tokens" : tokenParameter]: GENERATION_SETTINGS.maxOutputTokens };
      try {
        let result: unknown;
        if (id === "workers-ai" && env.AI) {
          result = await bounded(env.AI.run(model, body), signal);
        } else {
          result = await postJson(fetcher, url!, id === "workers-ai" ? env.CLOUDFLARE_API_TOKEN! : env.OPENAI_COMPATIBLE_API_KEY!, body, signal);
          if (id === "workers-ai") {
            if (!isRecord(result) || result.success !== true) throw unavailable();
            result = result.result;
          }
        }
        return extract(result, model);
      } catch (error) {
        if (error instanceof AdvisorError && error.code === "invalid_model_output") throw error;
        // SDK/provider exception text and HTTP bodies can contain credentials; never reflect them.
        throw unavailable();
      }
    },
  };
}
