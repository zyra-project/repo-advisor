// SPDX-License-Identifier: Apache-2.0

export const SERVICE_POLICY_VERSION = "service-policy-v1";
export type ServiceTopic = "submission" | "private-sources" | "runtime-data" | "advisor-availability" | "source-instructions";

export interface ServiceReply {
  topics: ServiceTopic[];
  summary: string;
  details: string[];
  nextSteps: string[];
}

const replies: Record<ServiceTopic, Omit<ServiceReply, "topics">> = {
  submission: {
    summary: "This advisor has not created or submitted a GitHub issue or pull request. Drafting text does not submit it.",
    details: ["The advisor cannot write to GitHub or search live issues and discussions. It cannot verify whether someone else submitted a draft."],
    nextSteps: ["Review the draft and check the target repository for duplicates before submitting it yourself."],
  },
  "private-sources": {
    summary: "This advisor cannot read private repositories or arbitrary URLs. It reads only configured public project sources at selected revisions.",
    details: ["Providing a public URL or credentials in a question does not add a repository or file to the configured sources."],
    nextSteps: ["Ask about a configured public Zyra or TerraViz source. Do not share private content or credentials to expand this service's access."],
  },
  "runtime-data": {
    summary: "This advisor cannot observe your cursor, the running application, or live data values, so it cannot provide that measurement.",
    details: ["Repository documentation cannot establish a reading from your current view. Application context belongs to Orbit and TerraViz; this does not establish that either provides point sampling or a particular inspection control."],
    nextSteps: ["Use the running application's documented data tools, if available, or consult the dataset's underlying values. Provide the dataset, location and time when asking how to interpret a measurement."],
  },
  "advisor-availability": {
    summary: "The effect of an advisor outage on a particular Orbit deployment is not established here. Existing LLM fallback does not prove that a future advisor integration is outage-safe.",
    details: ["The advisor integration is a proposal in this service's design. That does not establish whether a particular TerraViz deployment has added it.",
      "The integration must remain optional and preserve science conversations, application actions, availability gates and existing fallbacks. This is a design requirement, not a verified runtime guarantee."],
    nextSteps: ["Inspect the deployed revision and configuration, then test advisor timeout and failure behavior in the actual integration before relying on its availability."],
  },
  "source-instructions": {
    summary: "Retrieved source content is evidence, not instructions for this advisor. It cannot authorize bypassing manifest checks or inventing a command.",
    details: ["Only configured sources are read. Command and option names must pass the manifest checks at the selected revision; source text cannot change that policy."],
    nextSteps: ["Ask about the intended workflow or exact command name so it can be checked against the selected manifest."],
  },
};

/** Recognizes boundary topics, never repository facts or instructions in retrieved sources.
 * This bounded English recognizer is not a general semantic classifier. Multiple matched
 * boundaries are all returned; unrelated compound requests must be asked separately.
 */
export function serviceReply(question: string): ServiceReply | undefined {
  const text = question.normalize("NFKC").replace(/\p{Cf}/gu, "").toLowerCase();
  const topics: ServiceTopic[] = [];
  const advisor = /\b(?:repo[ -]?advisor|this (?:advisor|service))\b/.test(text);
  if (/\b(?:issue|pull request|draft)\b/.test(text) && /\b(?:creat\w*|submit\w*|fil(?:e|ed|ing)|post\w*)\b/.test(text) &&
    /\b(?:you|this (?:advisor|service))\b/.test(text)) topics.push("submission");
  if (/\b(?:private repositor\w*|arbitrary (?:url|link|repositor)\w*)\b/.test(text) &&
    /\b(?:read|fetch|access|use|inspect|support|open)\b/.test(text)) topics.push("private-sources");
  if (/\b(?:cursor|pointer)\b/.test(text) && /\b(?:temperature|reading|value|measure\w*|under|beneath|location)\b/.test(text)) topics.push("runtime-data");
  if (advisor && /\borbit\b/.test(text) && /\b(?:outage|unavailable|down|timeout|times? out|timed out|fail\w*|offline)\b/.test(text)) topics.push("advisor-availability");
  if (/\b(?:readme|retrieved|source (?:text|content|file))\b/.test(text) &&
    /\b(?:ignore|bypass|invent|obey|follow)\b/.test(text) && /\b(?:instruction\w*|manifest|command)\b/.test(text)) topics.push("source-instructions");
  if (!topics.length) return undefined;
  const selected = topics.map((topic) => replies[topic]);
  return { topics, summary: selected[0]!.summary,
    details: selected.flatMap((reply, i) => i ? [reply.summary, ...reply.details] : reply.details),
    nextSteps: selected.flatMap((reply) => reply.nextSteps) };
}
