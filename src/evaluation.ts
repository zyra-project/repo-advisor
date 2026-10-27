// SPDX-License-Identifier: Apache-2.0

import { answerPrepared, parseAnswerRequest, prepareSources, type AnswerRequest, type ModelCall } from "./answers";
import { AdvisorError } from "./errors";
import { GitHubSources, type SourceSnapshot } from "./github";
import { ANSWER_INSTRUCTIONS, ANSWER_SCHEMA, modelMessages, PROMPT_VERSION } from "./prompts";
import { SERVICE_POLICY_VERSION } from "./service-policy";
import { INTEGRATION_GUIDANCE_VERSION } from "./integration-guidance";
import type { EvidenceRequest, ModelProvider } from "./types";

export interface EvaluationCase {
  id: string;
  projects: string[];
  question: string;
  checks: string[];
  sources: Omit<EvidenceRequest, "ref">[];
}

export interface EvaluationSnapshot {
  version: 1;
  capturedAt: string;
  promptVersion: string;
  refs: Record<string, string>;
  cases: EvaluationCase[];
  sources: SourceSnapshot;
}

export interface TokenRates {
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
  currency: "USD";
  sourceUrl: string;
  asOf: string;
}

export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requestFor(test: EvaluationCase, refs: Record<string, string>): AnswerRequest {
  return parseAnswerRequest({ question: test.question, projects: test.projects.map((id) => {
    if (!refs[id]) throw new Error("Every evaluated project needs an explicit ref.");
    return { id, ref: refs[id] };
  }) });
}

function validateCases(cases: EvaluationCase[], refs: Record<string, string>) {
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > 100 ||
    new Set(cases.map((test) => test.id)).size !== cases.length) throw new Error("Evaluation cases must have unique IDs and a bounded count.");
  for (const test of cases) {
    if (typeof test.id !== "string" || !test.id || !Array.isArray(test.projects) ||
      !Array.isArray(test.sources) || !Array.isArray(test.checks) ||
      test.checks.some((check) => typeof check !== "string")) throw new Error("Invalid evaluation case.");
    requestFor(test, refs);
  }
}

export async function captureEvaluation(cases: EvaluationCase[], refs: Record<string, string>, github: GitHubSources): Promise<EvaluationSnapshot> {
  validateCases(cases, refs);
  // One adapter instance pins mutable refs once for the whole corpus, not once per case.
  for (const test of cases) await prepareSources(requestFor(test, refs), test.sources, github);
  return { version: 1, capturedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, refs, cases, sources: github.snapshot() };
}

export function estimateCost(calls: ModelCall[], rates?: TokenRates): number | null {
  if (!rates || calls.length === 0 || calls.some((call) => !call.result.usage)) return null;
  return calls.reduce((sum, call) => sum + (call.result.usage!.inputTokens * rates.inputPerMillion +
    call.result.usage!.outputTokens * rates.outputPerMillion) / 1_000_000, 0);
}

/** Compare answer generation against identical frozen evidence; planner quality is separate. */
export async function compareEvaluation(snapshot: EvaluationSnapshot, providers: ModelProvider[], rates: Record<string, TokenRates> = {},
  options: { allowPromptChange?: boolean } = {}) {
  if (snapshot.version !== 1 || typeof snapshot.promptVersion !== "string" || !/^answers-v[1-9][0-9]*$/.test(snapshot.promptVersion) ||
    (snapshot.promptVersion !== PROMPT_VERSION && !options.allowPromptChange)) {
    throw new Error("Snapshot and prompt versions must match this runner unless prompt-change evaluation is explicitly enabled.");
  }
  const promptChangeAccepted = snapshot.promptVersion !== PROMPT_VERSION;
  validateCases(snapshot.cases, snapshot.refs);
  for (const provider of providers) {
    if (rates[provider.id] && rates[provider.id]!.model !== provider.model) throw new Error("Token rates must match the requested model.");
  }
  const snapshotSha256 = await digest(snapshot);
  const instructionsSha256 = await digest(ANSWER_INSTRUCTIONS);
  const answerSchemaSha256 = await digest(ANSWER_SCHEMA);
  const records = [];
  // Validate all cases and their frozen sources before spending on any provider.
  const preparedCases = [];
  for (const test of snapshot.cases) {
    const preparation = GitHubSources.fromSnapshot(snapshot.sources);
    const prepared = await prepareSources(requestFor(test, snapshot.refs), test.sources, preparation);
    // Exclude wall-clock retrieval metadata; content, revisions, and ordering are frozen.
    const evidenceSha256 = await digest(prepared.evidence.map((item) => ({ ...item,
      citations: item.citations.map(({ retrievedAt: _retrievedAt, ...citation }) => citation) })));
    const messages = modelMessages({ instructions: ANSWER_INSTRUCTIONS, question: prepared.request.question, evidence: prepared.evidence });
    const inputSha256 = await digest(messages);
    const dataMessageSha256 = await digest(messages[1]!.content);
    preparedCases.push({ test, prepared, evidenceSha256, inputSha256, dataMessageSha256 });
  }
  for (const { test, prepared, evidenceSha256, inputSha256, dataMessageSha256 } of preparedCases) {
    for (const provider of providers) {
      const calls: ModelCall[] = [];
      const started = performance.now();
      let answer;
      let error: { code: string; message: string } | undefined;
      try {
        answer = await answerPrepared(prepared, provider, GitHubSources.fromSnapshot(snapshot.sources), {
          onCall: (call) => calls.push(call),
        });
      } catch (failure) {
        // Never persist raw provider/network exception details or credentials.
        error = failure instanceof AdvisorError ? { code: failure.code, message: failure.message } :
          { code: "evaluation_failed", message: "Evaluation could not complete." };
      }
      const completeUsage = calls.length > 0 && calls.every((call) => call.result.usage);
      records.push({
        caseId: test.id, question: test.question, checks: test.checks,
        provider: provider.id, requestedModel: provider.model, settings: provider.settings,
        promptVersion: PROMPT_VERSION, snapshotPromptVersion: snapshot.promptVersion, promptChangeAccepted,
        instructionsSha256, inputSha256, dataMessageSha256, evidenceSha256, snapshotSha256,
        outputSchemaSha256: answer?.generation.origin !== "model" && answer ? null : provider.settings.responseFormat === "json_schema" ? answerSchemaSha256 : null,
        outcome: answer ? "answered" : "rejected", answer: answer ?? null, error: error ?? null,
        answerOrigin: answer?.generation.origin ?? "model",
        inputSentToModel: calls.length > 0,
        servicePolicyVersion: SERVICE_POLICY_VERSION,
        integrationGuidanceVersion: INTEGRATION_GUIDANCE_VERSION,
        latencyMs: performance.now() - started,
        rawModelResponses: calls.map((call) => ({ phase: call.phase, ...call.result })),
        usage: answer && answer.generation.origin !== "model" ? { inputTokens: 0, outputTokens: 0 } : completeUsage ? calls.reduce((total, call) => ({ inputTokens: total.inputTokens + call.result.usage!.inputTokens,
          outputTokens: total.outputTokens + call.result.usage!.outputTokens }), { inputTokens: 0, outputTokens: 0 }) : null,
        estimatedTokenCost: answer && answer.generation.origin !== "model" ? 0 : estimateCost(calls, rates[provider.id]),
        rates: rates[provider.id] ?? null,
        // Automated guards establish neither factual accuracy nor task completion.
        humanQualityScores: null,
      });
    }
  }
  return { version: 1, evaluatedAt: new Date().toISOString(), snapshotSha256, promptVersion: PROMPT_VERSION,
    servicePolicyVersion: SERVICE_POLICY_VERSION,
    integrationGuidanceVersion: INTEGRATION_GUIDANCE_VERSION,
    snapshotPromptVersion: snapshot.promptVersion, promptChangeAccepted,
    scope: "answer-generation-with-fixed-evidence; excludes planner latency and usage",
    costBasis: "Optional operator-supplied token rates; excludes caching, non-token charges, and usage absent from responses.",
    defaultProvider: null, records };
}
