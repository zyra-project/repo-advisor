// SPDX-License-Identifier: Apache-2.0

import { AdvisorError, invalid, isRecord } from "./errors";
import { GitHubSources } from "./github";
import { getProfile } from "./profiles";
import type { Evidence, EvidenceRequest } from "./types";

const COMMAND = /^[a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*$/;
const FLAG = /^--?[a-zA-Z0-9][a-zA-Z0-9-]*$/;

export function parseEvidenceRequest(value: unknown): EvidenceRequest {
  if (!isRecord(value)) invalid("Expected a JSON object.");
  const allowed = ["project", "source", "ref", "command", "options"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid("Unknown request field.");
  if (typeof value.project !== "string" || typeof value.source !== "string") {
    invalid("project and source must be strings.");
  }
  if (value.ref !== undefined && (typeof value.ref !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/.test(value.ref))) {
    invalid("ref must be a GitHub branch, tag, or commit identifier (maximum 200 characters).");
  }
  if (value.command !== undefined && (typeof value.command !== "string" ||
    value.command.length > 200 || !COMMAND.test(value.command))) {
    invalid("command must be a manifest command name without shell arguments.");
  }
  if (value.options !== undefined && (!Array.isArray(value.options) || value.options.length > 100 ||
    value.options.some((flag) => typeof flag !== "string" || flag.length > 100 || !FLAG.test(flag)))) {
    invalid("options must be an array of up to 100 option names without values.");
  }
  return value as unknown as EvidenceRequest;
}

function invalidManifest(): never {
  throw new AdvisorError("invalid_source", "Manifest structure was not recognized. Capabilities were not verified.", 502);
}

/** Accept only the published split-manifest shape; schema drift is not an empty catalog. */
function parseIndex(value: unknown): { files: Map<string, string>; aliases: Map<string, string> } {
  if (!isRecord(value) || !isRecord(value.domains) || !isRecord(value.aliases)) invalidManifest();
  const files = new Map<string, string>();
  for (const [domain, descriptor] of Object.entries(value.domains)) {
    if (!/^[a-z][a-z0-9-]*$/.test(domain)) invalidManifest();
    const file = typeof descriptor === "string" ? descriptor : isRecord(descriptor) ? descriptor.file : undefined;
    if (typeof file !== "string" || !/^[a-z][a-z0-9-]*\.json$/.test(file)) invalidManifest();
    files.set(domain, file);
  }
  if (files.size === 0) invalidManifest();
  const aliases = new Map<string, string>();
  for (const [alias, domain] of Object.entries(value.aliases)) {
    if (!/^[a-z][a-z0-9-]*$/.test(alias) || typeof domain !== "string" ||
      !files.has(domain) || files.has(alias)) invalidManifest();
    aliases.set(alias, domain);
  }
  return { files, aliases };
}

function parseCommands(value: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(value) || Object.keys(value).length === 0) invalidManifest();
  for (const [name, entry] of Object.entries(value)) {
    if (!COMMAND.test(name) || !isRecord(entry) || typeof entry.description !== "string" ||
      !isRecord(entry.options)) invalidManifest();
    for (const [flag, descriptor] of Object.entries(entry.options)) {
      if (!FLAG.test(flag) || (typeof descriptor !== "string" && !isRecord(descriptor))) invalidManifest();
    }
  }
  return value as Record<string, Record<string, unknown>>;
}

export async function collectEvidence(request: EvidenceRequest, github: GitHubSources): Promise<Evidence> {
  const profile = getProfile(request.project);
  if (!profile) throw new AdvisorError("unknown_project", "Project is not configured.", 404);
  const source = profile.sources.find((entry) => entry.id === request.source);
  if (!source) throw new AdvisorError("unknown_source", "Source is not configured for this project.", 404);
  if (source.kind === "cli-manifest" && !request.command) invalid("This source requires a command name.");
  if (source.kind !== "cli-manifest" && (request.command !== undefined || request.options !== undefined)) {
    invalid("command and options apply only to a CLI manifest source.");
  }

  const requestedRef = request.ref ?? profile.defaultRef;
  // Resolve once, then use this immutable revision for every file in this request.
  const commitSha = await github.resolveRevision(profile.repository, requestedRef);
  const file = await github.file(profile.repository, commitSha, source.path);
  const base = {
    project: profile.id,
    source: source.id,
    classification: source.classification,
    requestedRef,
    commitSha,
    citations: [file.citation],
  };
  if (source.kind === "document") return { ...base, status: "evidence", content: file.text };
  if (source.kind === "cli-index") {
    const index = parseIndex(github.parseJson(file.text));
    return { ...base, status: "index", domains: Object.fromEntries(index.files), aliases: Object.fromEntries(index.aliases) };
  }
  if (source.kind === "cli-catalog") {
    return { ...base, status: "catalog", commands: parseCommands(github.parseJson(file.text)) };
  }

  const index = parseIndex(github.parseJson(file.text));
  const command = request.command!;
  const [stage, ...parts] = command.split(" ");
  const domain = index.aliases.get(stage!) ?? stage!;
  const canonicalCommand = [domain, ...parts].join(" ");
  const result = {
    ...base,
    command,
    canonicalCommand,
    unsupportedOptions: [] as string[],
    validation: "command-and-option-names-only" as const,
  };
  const domainFile = index.files.get(domain);
  if (!domainFile) return { ...result, status: "not_in_manifest" };

  const directory = source.path.slice(0, source.path.lastIndexOf("/") + 1);
  const manifest = await github.file(profile.repository, commitSha, directory + domainFile);
  result.citations.push(manifest.citation);
  const commands = parseCommands(github.parseJson(manifest.text));
  const entry = Object.hasOwn(commands, command) ? commands[command] :
    Object.hasOwn(commands, canonicalCommand) ? commands[canonicalCommand] : undefined;
  if (!entry) return { ...result, status: "not_in_manifest" };

  const options = entry.options as Record<string, unknown>;
  result.unsupportedOptions = [...new Set(request.options ?? [])].filter((flag) => !Object.hasOwn(options, flag));
  return {
    ...result,
    status: result.unsupportedOptions.length ? "unsupported_options" : "supported",
    entry,
  };
}
