// SPDX-License-Identifier: Apache-2.0

import { readFile, writeFile, open } from "node:fs/promises";
import { captureEvaluation, compareEvaluation, type EvaluationCase, type EvaluationSnapshot, type TokenRates } from "../src/evaluation";
import { AdvisorError, isRecord } from "../src/errors";
import { GitHubSources, type SourceSnapshot } from "../src/github";
import { createProvider, providerReadiness, PROVIDER_IDS } from "../src/providers";
import type { Env } from "../src/types";

const env: Env = Object.fromEntries([
  "GITHUB_TOKEN", "WORKERS_AI_MODEL", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN",
  "OPENAI_COMPATIBLE_MODEL", "OPENAI_COMPATIBLE_BASE_URL", "OPENAI_COMPATIBLE_API_KEY", "OPENAI_COMPATIBLE_TOKEN_PARAMETER",
].map((key) => [key, process.env[key]]));

const [command, ...args] = process.argv.slice(2);
function flag(name: string): string | undefined {
  return args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}
function required(name: string): string {
  const value = flag(name);
  if (!value) throw new AdvisorError("invalid_arguments", `Supply --${name}=...`, 400);
  return value;
}
async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  if (text.length > 20 * 1024 * 1024) throw new Error("Input file exceeds 20 MiB.");
  return JSON.parse(text);
}

async function main() {
  if (command === "check") {
    const readiness = providerReadiness(env);
    const configured = readiness.every((item) => item.configured);
    console.log(JSON.stringify({ status: configured ? "configured-not-evaluated" : "blocked", providers: readiness,
      liveRuns: 0, defaultProvider: null }, null, 2));
    if (!configured) process.exitCode = 1;
    return;
  }
  if (command === "capture") {
    const corpus = await readJson("evals/questions.json");
    if (!isRecord(corpus) || !Array.isArray(corpus.cases)) throw new Error("Invalid evaluation corpus.");
    const refs = { zyra: required("zyra-ref"), terraviz: required("terraviz-ref") };
    const sources = flag("sources");
    const github = sources ? GitHubSources.fromSnapshot(await readJson(sources) as SourceSnapshot) : new GitHubSources(fetch, env.GITHUB_TOKEN);
    const snapshot = await captureEvaluation(corpus.cases as EvaluationCase[], refs, github);
    await writeFile(required("out"), JSON.stringify(snapshot, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ status: "captured", cases: snapshot.cases.length, responses: Object.keys(snapshot.sources.responses).length }));
    return;
  }
  if (command === "run") {
    const out = required("out");
    // Validate both provider configurations before making any inference calls.
    const providers = PROVIDER_IDS.map((id) => createProvider(env, id));
    const snapshot = await readJson(required("snapshot")) as EvaluationSnapshot;
    let rates: Record<string, TokenRates> = {};
    if (flag("rates")) {
      const supplied = await readJson(required("rates"));
      if (!isRecord(supplied)) throw new Error("Invalid token rates.");
      for (const [id, entry] of Object.entries(supplied)) {
        if (!PROVIDER_IDS.includes(id as typeof PROVIDER_IDS[number]) || !isRecord(entry) || entry.currency !== "USD" ||
          typeof entry.model !== "string" || !entry.model ||
          typeof entry.inputPerMillion !== "number" || !Number.isFinite(entry.inputPerMillion) || entry.inputPerMillion < 0 ||
          typeof entry.outputPerMillion !== "number" || !Number.isFinite(entry.outputPerMillion) || entry.outputPerMillion < 0 ||
          typeof entry.sourceUrl !== "string" || !entry.sourceUrl.startsWith("https://") ||
          typeof entry.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.asOf)) throw new Error("Rates need nonnegative prices, currency, source URL, and date.");
      }
      rates = supplied as unknown as Record<string, TokenRates>;
    }
    // Reserve the destination before inference so a missing directory or existing
    // report cannot discard paid results at the end of a run.
    const output = await open(out, "wx");
    try {
      const report = await compareEvaluation(snapshot, providers, rates);
      await output.writeFile(JSON.stringify(report, null, 2) + "\n");
      console.log(JSON.stringify({ status: "completed", records: report.records.length, snapshotSha256: report.snapshotSha256, defaultProvider: null }));
    } finally {
      await output.close();
    }
    return;
  }
  throw new Error("Use check, capture, or run. See evals/README.md for arguments.");
}

main().catch((error: unknown) => {
  const message = error instanceof AdvisorError ? `${error.code}: ${error.message}` :
    error instanceof Error && !error.message.includes("\n") && !error.message.includes("token") && !error.message.includes("Bearer")
      ? "Evaluation could not complete. Check the command arguments and input files." : "Evaluation could not complete.";
  console.error(message);
  process.exitCode = 1;
});
