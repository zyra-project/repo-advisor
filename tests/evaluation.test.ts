// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { captureEvaluation, compareEvaluation, digest, estimateCost, type EvaluationCase, type EvaluationSnapshot, type TokenRates } from "../src/evaluation";
import { draft, fakeProvider, sourceFixture } from "./answer-fixtures";
import { ANSWER_SCHEMA, PROMPT_VERSION, modelMessages } from "../src/prompts";

const cases: EvaluationCase[] = [{ id: "overview", projects: ["zyra"], question: "What is Zyra?", checks: ["Cite the overview"], sources: [] }];
const rates: TokenRates = { model: "test-model", inputPerMillion: 1, outputPerMillion: 2, currency: "USD", sourceUrl: "https://provider.example/pricing", asOf: "2026-10-26" };

describe("reproducible provider comparison", () => {
  it("feeds both providers the same frozen evidence and records raw responses, usage, and hashes", async () => {
    const { github, calls } = sourceFixture();
    const snapshot = await captureEvaluation(cases, { zyra: "main" }, github);
    const native = fakeProvider([draft()], "a");
    const providerA = { ...native, settings: { ...native.settings, responseFormat: "json_schema" as const } };
    const providerB = fakeProvider([draft()], "b");
    const report = await compareEvaluation(snapshot, [providerA, providerB], { a: rates });
    expect(modelMessages(providerA.inputs[0]!)).toEqual(modelMessages(providerB.inputs[0]!));
    expect(providerA.inputs[0]?.responseSchema).toEqual(ANSWER_SCHEMA);
    expect(report.records[0]?.evidenceSha256).toBe(report.records[1]?.evidenceSha256);
    expect(report.records[0]?.outputSchemaSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.records[1]?.outputSchemaSha256).toBeNull();
    expect(report.records.every((record) => record.snapshotSha256 === report.snapshotSha256)).toBe(true);
    expect(report.records[0]).toMatchObject({ outcome: "answered", usage: { inputTokens: 100, outputTokens: 50 }, humanQualityScores: null });
    expect(report.records[0]?.estimatedTokenCost).toBeCloseTo(0.0002);
    expect(report.records[1]?.estimatedTokenCost).toBeNull();
    expect(report.records[0]?.rawModelResponses[0]?.text).toBe(JSON.stringify(draft()));
    expect(report.defaultProvider).toBeNull();
    expect(calls.filter((url) => url.startsWith("https://api.github.com/"))).toHaveLength(1);
  });

  it("records guard failures without disguising them as quality passes", async () => {
    const { github } = sourceFixture();
    const snapshot = await captureEvaluation(cases, { zyra: "main" }, github);
    const invalid = draft({ summary: { text: "A fabricated citation.", kind: "current", evidence: ["E99"] } });
    const bad = fakeProvider([invalid, invalid]);
    const report = await compareEvaluation(snapshot, [bad]);
    expect(report.records[0]).toMatchObject({ outcome: "rejected", error: { code: "invalid_model_output" }, humanQualityScores: null });
  });

  it("keeps unavailable usage/cost unknown and redacts failed provider details", async () => {
    const { github } = sourceFixture();
    const snapshot = await captureEvaluation(cases, { zyra: "main" }, github);
    const provider = fakeProvider([new Error("provider credential secret")]);
    const report = await compareEvaluation(snapshot, [provider], { fake: rates });
    expect(report.records[0]).toMatchObject({ outcome: "rejected", usage: null, estimatedTokenCost: null });
    expect(JSON.stringify(report)).not.toContain("credential secret");
    expect(estimateCost([], rates)).toBeNull();
  });

  it("requires explicit refs and a matching prompt/snapshot version", async () => {
    const { github } = sourceFixture();
    await expect(captureEvaluation(cases, {}, github)).rejects.toThrow("explicit ref");
    const snapshot = await captureEvaluation(cases, { zyra: "main" }, github);
    await expect(compareEvaluation({ ...snapshot, promptVersion: "future-version" }, [])).rejects.toThrow("versions must match");
  });

  it("requires deliberate prompt-change opt-in and preserves the frozen snapshot and evidence", async () => {
    const { github } = sourceFixture();
    const captured = await captureEvaluation(cases, { zyra: "main" }, github);
    const frozen = { ...captured, promptVersion: "answers-v1" };
    const original = JSON.stringify(frozen);
    const provider = fakeProvider([draft()]);
    await expect(compareEvaluation(frozen, [provider])).rejects.toThrow("versions must match");
    expect(provider.inputs).toHaveLength(0);
    const report = await compareEvaluation(frozen, [provider], {}, { allowPromptChange: true });
    expect(report).toMatchObject({ snapshotSha256: await digest(frozen), snapshotPromptVersion: "answers-v1",
      promptVersion: PROMPT_VERSION, promptChangeAccepted: true });
    expect(report.records[0]).toMatchObject({ snapshotPromptVersion: "answers-v1", promptChangeAccepted: true });
    expect(report.records[0]?.dataMessageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(frozen)).toBe(original);
    await expect(compareEvaluation({ ...frozen, version: 2 } as unknown as EvaluationSnapshot, [], {}, { allowPromptChange: true })).rejects.toThrow();
  });

  it("rejects incomplete completions but retains their raw text and reported usage", async () => {
    const { github } = sourceFixture();
    const snapshot = await captureEvaluation(cases, { zyra: "main" }, github);
    const provider = fakeProvider([]);
    provider.generate = async () => ({ text: "{}", model: "test-model", completionStatus: "incomplete", finishReason: "length", usage: { inputTokens: 100, outputTokens: 50 } });
    const report = await compareEvaluation(snapshot, [provider], { fake: rates });
    expect(report.records[0]).toMatchObject({ outcome: "rejected", error: { code: "invalid_model_output" }, usage: { inputTokens: 100, outputTokens: 50 } });
    expect(report.records[0]?.estimatedTokenCost).toBeCloseTo(0.0002);
    expect(report.records[0]?.rawModelResponses[0]).toMatchObject({ text: "{}", completionStatus: "incomplete" });
  });

  it("rejects mismatched pricing and incomplete source snapshots before inference", async () => {
    const { github } = sourceFixture();
    const snapshot = await captureEvaluation(cases, { zyra: "main" }, github);
    const provider = fakeProvider([draft()]);
    await expect(compareEvaluation(snapshot, [provider], { fake: { ...rates, model: "different-model" } })).rejects.toThrow("rates must match");
    const incomplete = { ...snapshot, sources: { version: 1 as const, responses: {} } };
    await expect(compareEvaluation(incomplete, [provider])).rejects.toMatchObject({ code: "source_unavailable" });
    expect(provider.inputs).toHaveLength(0);
  });
});
