// SPDX-License-Identifier: Apache-2.0

import { AdvisorError } from "./errors";
import { generateAnswer, parseAnswerRequest, serviceAnswer, guidedAnswer } from "./answers";
import { integrationTask } from "./integration-guidance";
import { collectEvidence, parseEvidenceRequest } from "./evidence";
import { GitHubSources, readLimitedText } from "./github";
import { profiles } from "./profiles";
import { createProvider } from "./providers";
import type { Env, Fetcher } from "./types";

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function createApp(fetcher: Fetcher = fetch) {
  return {
    async fetch(request: Request, env: Env = {}): Promise<Response> {
      try {
        const path = new URL(request.url).pathname;
        const method = path === "/health" || path === "/v1/projects" ? "GET" :
          path === "/v1/evidence" || path === "/v1/answer" ? "POST" : undefined;
        if (!method) return json({ error: { code: "not_found", message: "Route not found." } }, 404);
        if (request.method !== method) {
          return json({ error: { code: "method_not_allowed", message: `Use ${method} for this route.` } }, 405, { Allow: method });
        }
        if (path === "/health") return json({ status: "ok", service: "repo-advisor", stage: "answers-preview" });
        if (path === "/v1/projects") return json({ projects: profiles });
        if (request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
          throw new AdvisorError("unsupported_media_type", "Use Content-Type: application/json.", 415);
        }
        let body: string;
        try {
          body = await readLimitedText(new Response(request.body), 16 * 1024);
        } catch (error) {
          if (error instanceof AdvisorError) throw error;
          throw new AdvisorError("invalid_request", "Body must contain valid UTF-8 JSON.", 400);
        }
        let input: unknown;
        try {
          input = JSON.parse(body);
        } catch {
          throw new AdvisorError("invalid_request", "Body must contain valid JSON.", 400);
        }
        if (path === "/v1/answer") {
          const parsed = parseAnswerRequest(input);
          const policy = serviceAnswer(parsed);
          if (policy) return json(policy);
          const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90_000)]);
          const github = new GitHubSources(fetcher, env.GITHUB_TOKEN, signal);
          if (integrationTask(parsed)) return json(await guidedAnswer(parsed, github));
          const provider = createProvider(env, parsed.provider ?? env.ADVISOR_PROVIDER, fetcher);
          return json(await generateAnswer(parsed, provider, github, signal));
        }
        const evidence = await collectEvidence(parseEvidenceRequest(input), new GitHubSources(fetcher, env.GITHUB_TOKEN));
        return json(evidence);
      } catch (error) {
        if (error instanceof AdvisorError) return json({ error: { code: error.code, message: error.message } }, error.status);
        return json({ error: { code: "internal_error", message: "Request could not be completed." } }, 500);
      }
    },
  };
}

export default createApp();
