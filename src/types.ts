// SPDX-License-Identifier: Apache-2.0

export interface SourceDefinition {
  id: string;
  title: string;
  path: string;
  kind: "cli-manifest" | "cli-catalog" | "cli-index" | "document";
  classification: "capability" | "documentation" | "implementation" | "vision" | "contribution" | "governance";
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

export interface CatalogEvidence extends EvidenceBase {
  status: "catalog";
  commands: Record<string, Record<string, unknown>>;
}

export interface IndexEvidence extends EvidenceBase {
  status: "index";
  domains: Record<string, string>;
  aliases: Record<string, string>;
}

export type Evidence = DocumentEvidence | CommandEvidence | CatalogEvidence | IndexEvidence;

export interface ModelInput {
  instructions: string;
  question: string;
  evidence: readonly Evidence[];
  /** Server-defined output structure; never accepted from request or source data. */
  responseSchema?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ModelResult {
  text: string;
  model: string;
  completionStatus?: "complete" | "incomplete" | "refused";
  finishReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface GenerationSettings {
  maxOutputTokens: number;
  responseFormat: "json_object" | "json_schema";
  temperature?: "provider-default";
  tokenParameter?: "max_tokens" | "max_completion_tokens";
}

/** Providers consume the same explicit evidence regardless of vendor. */
export interface ModelProvider {
  readonly id: string;
  readonly model: string;
  readonly settings: GenerationSettings;
  generate(input: ModelInput): Promise<ModelResult>;
}

export interface AiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

export interface Env {
  GITHUB_TOKEN?: string;
  AI?: AiBinding;
  ADVISOR_PROVIDER?: string;
  WORKERS_AI_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  OPENAI_COMPATIBLE_MODEL?: string;
  OPENAI_COMPATIBLE_BASE_URL?: string;
  OPENAI_COMPATIBLE_API_KEY?: string;
  OPENAI_COMPATIBLE_TOKEN_PARAMETER?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
}

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
