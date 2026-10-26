// SPDX-License-Identifier: Apache-2.0

import { AdvisorError, isRecord } from "./errors";
import type { Citation, Fetcher } from "./types";

const MAX_SOURCE_BYTES = 512 * 1024;
const SHA = /^[a-f0-9]{40}$/;

/** Public response bodies only; headers and credentials are never captured. */
export interface SourceSnapshot {
  version: 1;
  responses: Record<string, string>;
}

/** Bound the bytes actually read, including chunked responses without Content-Length. */
export async function readLimitedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        // Cancellation of a tee/clone can wait for its other branch. Do not let
        // cleanup hold an error response open indefinitely.
        void reader.cancel().catch(() => {});
        throw new AdvisorError("content_too_large", "Content exceeds the configured size limit.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export class GitHubSources {
  private readonly revisions = new Map<string, Promise<string>>();
  private readonly files = new Map<string, Promise<{ text: string; citation: Citation }>>();
  private readonly captured: Record<string, string> = {};

  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly token?: string,
    private readonly signal?: AbortSignal,
  ) {}

  snapshot(): SourceSnapshot {
    return { version: 1, responses: { ...this.captured } };
  }

  static fromSnapshot(snapshot: SourceSnapshot): GitHubSources {
    if (snapshot.version !== 1 || !isRecord(snapshot.responses) ||
      Object.values(snapshot.responses).some((value) => typeof value !== "string")) {
      throw new AdvisorError("invalid_snapshot", "Source snapshot format is invalid.", 400);
    }
    return new GitHubSources(async (input) => {
      const url = String(input);
      return Object.hasOwn(snapshot.responses, url)
        ? new Response(snapshot.responses[url])
        : new Response(null, { status: 404 });
    });
  }

  private async read(url: string, api: boolean): Promise<string> {
    try {
      const headers: Record<string, string> = { "User-Agent": "zyra-project-repo-advisor" };
      if (api) {
        headers.Accept = "application/vnd.github+json";
        headers["X-GitHub-Api-Version"] = "2022-11-28";
        if (this.token) headers.Authorization = `Bearer ${this.token}`;
      }
      const response = await this.fetcher(url, {
        headers,
        redirect: "error",
        signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        if (response.body) void response.body.cancel().catch(() => {});
        throw new AdvisorError(
          "source_unavailable",
          `GitHub returned HTTP ${response.status}. Source contents were not verified.`,
          502,
        );
      }
      return await readLimitedText(response, MAX_SOURCE_BYTES);
    } catch (error) {
      if (error instanceof AdvisorError) {
        // An oversized upstream source is a retrieval failure, not a bad client request.
        if (error.code !== "content_too_large") throw error;
      }
      // Never return response bodies, token values, or raw network errors to a client.
      throw new AdvisorError("source_unavailable", "Could not retrieve the source. Its contents were not verified.", 502);
    }
  }

  async resolveRevision(repository: string, ref: string): Promise<string> {
    const url = `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`;
    let revision = this.revisions.get(url);
    if (!revision) {
      revision = this.loadRevision(url);
      this.revisions.set(url, revision);
    }
    return revision;
  }

  private async loadRevision(url: string): Promise<string> {
    const text = await this.read(url, true);
    const data = this.parseJson(text);
    if (!isRecord(data) || typeof data.sha !== "string" || !SHA.test(data.sha)) {
      throw new AdvisorError("invalid_source", "GitHub did not return a valid commit revision.", 502);
    }
    this.captured[url] = JSON.stringify({ sha: data.sha });
    return data.sha;
  }

  async file(repository: string, commitSha: string, path: string): Promise<{ text: string; citation: Citation }> {
    // Check derived manifest paths too: a repository file cannot redirect retrieval elsewhere.
    if (!SHA.test(commitSha) || !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
      path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new AdvisorError("invalid_source", "Source location is invalid.", 502);
    }
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = `https://raw.githubusercontent.com/${repository}/${commitSha}/${encodedPath}`;
    let file = this.files.get(url);
    if (!file) {
      file = this.loadFile(url, repository, commitSha, path, encodedPath);
      this.files.set(url, file);
    }
    return file;
  }

  private async loadFile(url: string, repository: string, commitSha: string, path: string, encodedPath: string) {
    const text = await this.read(url, false);
    this.captured[url] = text;
    return {
      text,
      citation: {
        repository,
        path,
        commitSha,
        url: `https://github.com/${repository}/blob/${commitSha}/${encodedPath}`,
        retrievedAt: new Date().toISOString(),
      },
    };
  }

  parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      throw new AdvisorError("invalid_source", "Source did not contain valid JSON.", 502);
    }
  }
}
