// SPDX-License-Identifier: Apache-2.0

import { GitHubSources } from "../src/github";
import { GENERATION_SETTINGS } from "../src/providers";
import type { Fetcher, ModelInput, ModelProvider } from "../src/types";

export const ZYRA_SHA = "a".repeat(40);
export const TERRAVIZ_SHA = "b".repeat(40);
export const INDEX_PATH = "src/zyra/wizard/zyra_capabilities/zyra_capabilities_index.json";
export const DOMAIN_PATH = "src/zyra/wizard/zyra_capabilities/acquire.json";
export const fixtureCommand = { description: "Call a REST API", options: {
  "--url": "Target URL", "--output": { help: "Output path", type: "path" }, "--timeout": { type: "int", default: 60 },
}, positionals: [] };

export function sourceFixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const fixtures: Record<string, unknown> = {
    "README.md": "# Project overview\nZyra prepares data and Terraviz displays it.\nSource documentation, not a compatibility test.",
    [INDEX_PATH]: { version: "1.0", domains: { acquire: { file: "acquire.json", aliases: ["import"] } }, aliases: { import: "acquire" } },
    [DOMAIN_PATH]: { "acquire api": fixtureCommand, "import api": fixtureCommand, "acquire http": fixtureCommand },
    "ROADMAP.md": "# Roadmap\nA proposed feature is not implemented yet.",
    "src/services/llmProvider.ts": "export interface LLMMessage { role: string; content: string }",
    ...overrides,
  };
  const fetcher: Fetcher = async (input) => {
    const url = String(input);
    calls.push(url);
    const sha = url.includes("/terraviz/") ? TERRAVIZ_SHA : ZYRA_SHA;
    if (url.startsWith("https://api.github.com/")) return Response.json({ sha });
    const path = decodeURIComponent(url.split(`/${sha}/`)[1] ?? "");
    const item = fixtures[path];
    if (item instanceof Response) return item.clone();
    if (item === undefined) return new Response(null, { status: 404 });
    return new Response(typeof item === "string" ? item : JSON.stringify(item));
  };
  return { github: new GitHubSources(fetcher), fetcher, calls };
}

export function draft(overrides: Record<string, unknown> = {}) {
  return {
    summary: { text: "Zyra documents this workflow.", kind: "current", evidence: ["E1"] },
    details: [], commands: [], nextSteps: [], ...overrides,
  };
}

export function fakeProvider(replies: unknown[], id = "fake"): ModelProvider & { inputs: ModelInput[] } {
  const inputs: ModelInput[] = [];
  return {
    id, model: "test-model", settings: GENERATION_SETTINGS, inputs,
    async generate(input) {
      inputs.push(input);
      const reply = replies[inputs.length - 1];
      if (reply instanceof Error) throw reply;
      return { text: typeof reply === "string" ? reply : JSON.stringify(reply), model: "test-model", usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
}
