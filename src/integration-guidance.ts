// SPDX-License-Identifier: Apache-2.0

import type { AnswerDraft, AnswerRequest } from "./answers";
import type { Evidence, EvidenceRequest } from "./types";

export const INTEGRATION_GUIDANCE_VERSION = "integration-guidance-v1";
export type IntegrationTask = "ownership" | "implementation-plan" | "publishing-handoff";

export function integrationTask(request: AnswerRequest): IntegrationTask | undefined {
  if (!request.projects.some((p) => p.id === "zyra") || !request.projects.some((p) => p.id === "terraviz")) return;
  const text = request.question.normalize("NFKC").toLowerCase();
  if (/\b(?:which (?:repo(?:sitory)?|project)|who should (?:fix|change)|where should .{0,40}(?:fix|change))\b/.test(text) &&
    /\b(?:metadata|convert\w*|conversion|reject\w*|error|fail\w*)\b/.test(text)) return "ownership";
  if (/\bplan\b/.test(text) && /\b(?:implement\w*|coordinat\w*|workflow|both)\b/.test(text)) return "implementation-plan";
  if (/\b(?:prepar\w*|produc\w*|export\w*|pipeline|handoff)\b/.test(text) && /\bpublish\w*\b/.test(text)) return "publishing-handoff";
}

/** Curated selectors, never paths derived from the question or a model. */
export function integrationSelections(task: IntegrationTask): Omit<EvidenceRequest, "ref">[] {
  return [
    { project: "zyra", source: task === "ownership" ? "domain-schema" : "pipeline-schema" },
    { project: "terraviz", source: "catalog-validators" },
    { project: "terraviz", source: "dataset-mutations" },
    ...(task === "implementation-plan" ? [
      { project: "zyra", source: "contributing" }, { project: "terraviz", source: "contributing" },
    ] : [{ project: "terraviz", source: "catalog-development" }]),
  ];
}

/** A conditional review scaffold, not a claim that the two implementations interoperate. */
export function integrationDraft(task: IntegrationTask, evidence: Evidence[]): (Omit<AnswerDraft, "commands"> & { commands: [] }) | undefined {
  const selections = integrationSelections(task);
  const ids = selections.map((selection) => {
    const i = evidence.findIndex((e) => e.project === selection.project && e.source === selection.source && e.status === "evidence");
    return i < 0 ? undefined : `E${i + 1}`;
  });
  // Missing or unavailable contracts cannot silently become compatibility evidence.
  if (ids.some((id) => !id)) return;
  const claim = (text: string, refs: string[] = []): AnswerDraft["summary"] => ({ text, kind: "uncertain", evidence: refs });
  const producer = [ids[0]!], consumer = [ids[1]!, ids[2]!];
  const requestInputs = claim("Provide the intended workflow, exact rejection status and error body if any, Zyra and TerraViz versions or commits, and representative producer output and consumer request metadata. Redact credentials and private data.");
  const producerWork = claim("Zyra work: compare the producer output and argument/schema contract with the agreed handoff. Change conversion, export or metadata generation only if that output violates the agreed contract; add a regression fixture for the failing payload.", producer);
  const consumerWork = claim("TerraViz work: compare the received payload with draft, update and publish validation and dataset mutation rules. Change the consumer only if its documented contract must change or its validation is incorrect; preserve existing valid clients and add rejection and acceptance tests.", consumer);
  const validation = claim("Integration validation: agree on a versioned handoff example, then test a valid payload, missing and malformed metadata, incompatible versions and source failures against both sides. Check actual data assets and publishing prerequisites rather than treating successful conversion or shared JSON as proof of compatibility.", [...producer, ...consumer]);
  const coordination = claim("Coordinate separate reviewed changes in each affected repository. Cross-reference verified issues or PRs, document the handoff and migration path, update examples and release notes, and sequence releases only after the contract is agreed. No duplicate search or submission has run.");
  return {
    summary: claim(task === "ownership"
      ? "A successful conversion and a metadata rejection do not identify which repository should change. Diagnose the exact producer-consumer contract before assigning ownership."
      : task === "implementation-plan"
        ? "Start with this conditional cross-project implementation plan. The exact code changes depend on the missing workflow requirements and an agreed producer-consumer contract."
        : "A Zyra-to-TerraViz publishing handoff needs contract review. This checklist does not establish that a ready-made integration exists or that a particular output can be published."),
    details: [producerWork, consumerWork, validation, coordination], commands: [],
    nextSteps: [requestInputs, claim("Inspect the linked sources at their independently pinned revisions, agree on the expected input and output, and identify the smallest failing example before proposing code changes.", ids as string[])],
  };
}
