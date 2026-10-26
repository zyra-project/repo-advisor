// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createProvider, providerReadiness } from "../src/providers";
import type { Env, ModelInput } from "../src/types";

const input: ModelInput = { instructions: "Return JSON.", question: "Explain the project.", evidence: [] };
const external: Env = {
  OPENAI_COMPATIBLE_MODEL: "configured-model", OPENAI_COMPATIBLE_BASE_URL: "https://external.example/v1",
  OPENAI_COMPATIBLE_API_KEY: "external-test-secret",
};

describe("model adapters", () => {
  it("normalizes Workers AI object JSON responses and usage through a binding", async () => {
    const calls: { model: string; body: Record<string, unknown> }[] = [];
    const provider = createProvider({ WORKERS_AI_MODEL: "@cf/test/model", AI: { async run(model, body) {
      calls.push({ model, body });
      return { response: { answer: "A result" }, usage: { prompt_tokens: 10, completion_tokens: 4 } };
    } } }, "workers-ai");
    const result = await provider.generate(input);
    expect(JSON.parse(result.text)).toEqual({ answer: "A result" });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
    expect(calls[0]).toMatchObject({ model: "@cf/test/model", body: { response_format: { type: "json_object" }, max_tokens: 2048 } });
  });

  it("supports Workers AI's REST envelope for the Node evaluation runner", async () => {
    let target = "";
    const provider = createProvider({ WORKERS_AI_MODEL: "@cf/test/model", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "cf-secret" }, "workers-ai", async (url, init) => {
      target = String(url);
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer cf-secret");
      return Response.json({ success: true, result: { response: '{"ok":true}' } });
    });
    expect((await provider.generate(input)).text).toBe('{"ok":true}');
    expect(target).toBe(`https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/ai/run/@cf/test/model`);
  });

  it("uses an explicit external URL/model and preserves input data separation", async () => {
    const provider = createProvider(external, "openai-compatible", async (url, init) => {
      expect(String(url)).toBe("https://external.example/v1/chat/completions");
      expect(init?.redirect).toBe("error");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model: "configured-model", max_tokens: 2048, response_format: { type: "json_object" } });
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[0].content).not.toContain(input.question);
      return Response.json({ model: "reported-model", choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 5 } });
    });
    expect(await provider.generate(input)).toMatchObject({ model: "reported-model", usage: { inputTokens: 20, outputTokens: 5 } });
  });

  it("uses the current completion-token parameter for OpenAI and permits a compatible override", async () => {
    for (const override of [undefined, "max_tokens"]) {
      const provider = createProvider({ ...external, OPENAI_COMPATIBLE_BASE_URL: "https://api.openai.com/v1", OPENAI_COMPATIBLE_TOKEN_PARAMETER: override }, "openai-compatible", async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body[override ?? "max_completion_tokens"]).toBe(2048);
        return Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] });
      });
      await provider.generate(input);
    }
  });

  it.each([
    { response: "" },
    { unexpected: "shape" },
    { response: "x".repeat(65 * 1024) },
  ])("rejects malformed or oversized responses", async (response) => {
    const provider = createProvider(external, "openai-compatible", async () => Response.json(response));
    await expect(provider.generate(input)).rejects.toMatchObject({ code: "invalid_model_output", status: 502 });
  });

  it.each([
    { status: "incomplete", message: { content: "{}" }, finish: "length" },
    { status: "refused", message: { content: null, refusal: "Refused" }, finish: "stop" },
  ])("preserves reported usage for $status completions so orchestration can reject them", async ({ status, message, finish }) => {
    const provider = createProvider(external, "openai-compatible", async () => Response.json({
      choices: [{ message, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 2 },
    }));
    expect(await provider.generate(input)).toMatchObject({ completionStatus: status, usage: { inputTokens: 10, outputTokens: 2 } });
  });

  it.each([403, 429, 500])("redacts provider HTTP %i bodies", async (status) => {
    const provider = createProvider(external, "openai-compatible", async () => new Response("external-test-secret", { status }));
    await expect(provider.generate(input)).rejects.toMatchObject({ code: "provider_unavailable", status: 503 });
    await expect(provider.generate(input)).rejects.not.toThrow("external-test-secret");
  });

  it("redacts binding errors and does not infer token counts that were not supplied", async () => {
    const failing = createProvider({ WORKERS_AI_MODEL: "model", AI: { async run() { throw new Error("secret-value"); } } }, "workers-ai");
    await expect(failing.generate(input)).rejects.not.toThrow("secret-value");
    const missingUsage = createProvider(external, "openai-compatible", async () => Response.json({ response: "{}", usage: { prompt_tokens: "10", completion_tokens: 4 } }));
    expect((await missingUsage.generate(input)).usage).toBeUndefined();
  });

  it("does not start binding inference after cancellation", async () => {
    let called = false;
    const provider = createProvider({ WORKERS_AI_MODEL: "model", AI: { async run() { called = true; return { response: "{}" }; } } }, "workers-ai");
    await expect(provider.generate({ ...input, signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(called).toBe(false);
  });

  it("returns on cancellation while an in-flight binding is still pending", async () => {
    const controller = new AbortController();
    const provider = createProvider({ WORKERS_AI_MODEL: "model", AI: { run: () => new Promise(() => {}) } }, "workers-ai");
    const result = provider.generate({ ...input, signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it.each(["http://external.example/v1", "https://user:password@external.example/v1", "https://external.example/v1?key=secret", "https://external.example/v1#fragment"])("rejects unsafe external configuration: %s", (url) => {
    expect(() => createProvider({ ...external, OPENAI_COMPATIBLE_BASE_URL: url }, "openai-compatible")).toThrow();
  });

  it("leaves the default unset and reports missing configuration without values", () => {
    expect(() => createProvider(external, undefined)).toThrow();
    expect(() => createProvider({}, "workers-ai")).toThrow();
    expect(providerReadiness({}).every((provider) => !provider.configured)).toBe(true);
    expect(JSON.stringify(providerReadiness(external))).not.toContain("external-test-secret");
  });
});
