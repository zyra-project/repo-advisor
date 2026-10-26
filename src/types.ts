// SPDX-License-Identifier: Apache-2.0

export interface SourceDefinition {
  id: string;
  title: string;
  path: string;
  kind: "cli-manifest" | "document";
  classification: "capability" | "documentation" | "vision" | "contribution" | "governance";
}

export interface ProjectProfile {
  id: string;
  name: string;
  repository: string;
  defaultRef: string;
  description: string;
  relatedProjects: string[];
  sources: SourceDefinition[];
  contributions: {
    guidanceSource: string;
    templateDirectory: string;
    templates: { type: string; source: string; labels: string[] }[];
    workflowGapRequirements: string[];
    searchBeforeDraft: boolean;
    submission: "human-reviewed-draft";
  };
}

export interface EvidenceRequest {
  project: string;
  source: string;
  ref?: string;
  /** A manifest command name, e.g. "acquire http", without shell arguments. */
  command?: string;
  /** Optional flag names to check, e.g. ["--output"]. Values are not validated. */
  options?: string[];
}

export interface Citation {
  repository: string;
  path: string;
  commitSha: string;
  url: string;
  retrievedAt: string;
}

interface EvidenceBase {
  project: string;
  source: string;
  classification: SourceDefinition["classification"];
  requestedRef: string;
  commitSha: string;
  citations: Citation[];
}

export interface DocumentEvidence extends EvidenceBase {
  status: "evidence";
  content: string;
}

export interface CommandEvidence extends EvidenceBase {
  status: "supported" | "not_in_manifest" | "unsupported_options";
  command: string;
  canonicalCommand: string;
  entry?: Record<string, unknown>;
  unsupportedOptions: string[];
  /** Manifest membership is not a successful execution or complete validation. */
  validation: "command-and-option-names-only";
}

export type Evidence = DocumentEvidence | CommandEvidence;

/** Future answer providers consume the same explicit evidence regardless of vendor. */
export interface ModelProvider {
  readonly id: string;
  generate(input: {
    instructions: string;
    question: string;
    evidence: readonly Evidence[];
    signal?: AbortSignal;
  }): Promise<{
    text: string;
    model: string;
    usage?: { inputTokens: number; outputTokens: number };
  }>;
}

export interface Env {
  GITHUB_TOKEN?: string;
}

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
