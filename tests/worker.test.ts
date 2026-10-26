// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createApp } from "../src/index";
import { profiles } from "../src/profiles";
import type { Evidence, Fetcher } from "../src/types";

const SHA = "a".repeat(40);
const INDEX_PATH = "src/zyra/wizard/zyra_capabilities/zyra_capabilities_index.json";
const DOMAIN_PATH = "src/zyra/wizard/zyra_capabilities/acquire.json";

// Published Zyra structure: root command keys, string/object option descriptions,
// and aliases owned by an index rather than separate import.json files.
const index = {
  version: "1.0",
  domains: { acquire: { file: "acquire.json", aliases: ["import"] }, narrate: "narrate.json" },
  aliases: { import: "acquire" },
};
const command = {
  description: "Call a REST API endpoint with headers/params/body. Supports cursor/page pagination.",
  options: { "--url": "Target endpoint URL (may be set by preset)", "--output": { help: "Output path", type: "path", default: "-" } },
  positionals: [],
};

function harness(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fixtures: Record<string, unknown> = {
    [INDEX_PATH]: index,
    [DOMAIN_PATH]: { "acquire api": command, "import api": command },
    "README.md": "# Project documentation",
    "ROADMAP.md": "# Planned capabilities",
    ...overrides,
  };
  const fetcher: Fetcher = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://api.github.com/")) return Response.json({ sha: SHA });
    const marker = `/${SHA}/`;
    const path = decodeURIComponent(url.split(marker)[1] ?? "");
    const value = fixtures[path];
    if (value instanceof Response) return value.clone();
    if (value === undefined) return new Response("Not Found", { status: 404 });
    return new Response(typeof value === "string" ? value : JSON.stringify(value));
  };
  const app = createApp(fetcher);
  const post = (body: unknown, env = {}) => app.fetch(new Request("https://advisor.test/v1/evidence", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), env);
  return { app, post, calls };
}

describe("source evidence", () => {
  it("pins the index and domain to the same resolved commit and links both", async () => {
    const { post, calls } = harness();
    const response = await post({ project: "zyra", source: "cli", command: "acquire api", options: ["--url", "--output"], ref: "v0.1.0" });
    const body = await response.json() as Evidence;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "supported", requestedRef: "v0.1.0", commitSha: SHA, validation: "command-and-option-names-only" });
    expect(calls[0]?.url).toBe("https://api.github.com/repos/NOAA-GSL/zyra/commits/v0.1.0");
    expect(calls.slice(1).every((call) => call.url.includes(`/${SHA}/`))).toBe(true);
    expect(body.citations.map((citation) => citation.path)).toEqual([INDEX_PATH, DOMAIN_PATH]);
    expect(body.citations.every((citation) => citation.url.includes(`/blob/${SHA}/`))).toBe(true);
  });

  it("looks up an alias in its canonical domain without inventing an alias file", async () => {
    const { post, calls } = harness();
    const response = await post({ project: "zyra", source: "cli", command: "import api" });
    expect(await response.json()).toMatchObject({ status: "supported", command: "import api", canonicalCommand: "acquire api" });
    expect(calls.at(-1)?.url).toContain("/acquire.json");
    expect(calls.some((call) => call.url.includes("/import.json"))).toBe(false);
  });

  it("rejects unknown option names and does not claim to validate values", async () => {
    const { post } = harness();
    const response = await post({ project: "zyra", source: "cli", command: "acquire api", options: ["--invented", "--output", "--invented"] });
    expect(await response.json()).toMatchObject({ status: "unsupported_options", unsupportedOptions: ["--invented"], validation: "command-and-option-names-only" });
  });

  it.each(["acquire nonexistent", "invented command", "constructor"])("reports absence only after a successful lookup: %s", async (name) => {
    const { post } = harness();
    const response = await post({ project: "zyra", source: "cli", command: name });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "not_in_manifest", commitSha: SHA });
  });

  it.each([404, 403, 429, 500])("does not turn upstream HTTP %i into a capability gap", async (status) => {
    const { post } = harness({ [DOMAIN_PATH]: new Response("upstream detail", { status }) });
    const response = await post({ project: "zyra", source: "cli", command: "acquire api" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "source_unavailable" } });
  });

  it.each([
    { [INDEX_PATH]: { commands: [] } },
    { [DOMAIN_PATH]: { commands: [] } },
    { [DOMAIN_PATH]: "not JSON" },
    { [INDEX_PATH]: { ...index, domains: { acquire: "../../secret.json" } } },
  ])("treats malformed or unsafe manifest sources as unverified", async (overrides) => {
    const { post, calls } = harness(overrides);
    const response = await post({ project: "zyra", source: "cli", command: "acquire api" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_source" } });
    expect(calls.some((call) => call.url.includes("secret.json"))).toBe(false);
  });

  it.each([
    { name: "nested properties", options: { properties: { "--url": "Target URL" } } },
    { name: "null descriptor", options: { "--url": null } },
    { name: "array descriptor", options: { "--url": [] } },
    { name: "boolean descriptor", options: { "--url": false } },
    { name: "number descriptor", options: { "--url": 1 } },
    { name: "non-option key", options: { url: "Target URL" } },
  ])("rejects malformed option catalogs ($name)", async ({ options }) => {
    const { post } = harness({ [DOMAIN_PATH]: { "acquire api": { ...command, options } } });
    const response = await post({ project: "zyra", source: "cli", command: "acquire api", options: ["--url"] });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_source" } });
  });

  it("keeps roadmap evidence explicitly classified as vision", async () => {
    const { post } = harness();
    const response = await post({ project: "terraviz", source: "roadmap" });
    expect(await response.json()).toMatchObject({ status: "evidence", classification: "vision", content: "# Planned capabilities", commitSha: SHA });
  });

  it("sends a configured GitHub token only to the API and never returns it", async () => {
    const { post, calls } = harness();
    const response = await post({ project: "terraviz", source: "readme" }, { GITHUB_TOKEN: "test-token-do-not-return" });
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe("Bearer test-token-do-not-return");
    expect(new Headers(calls[1]?.init?.headers).has("Authorization")).toBe(false);
    expect(await response.text()).not.toContain("test-token-do-not-return");
  });

  it("bounds source bodies even without Content-Length", async () => {
    const { post } = harness({ "README.md": "x".repeat(512 * 1024 + 1) });
    const response = await post({ project: "terraviz", source: "readme" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "source_unavailable" } });
  });

  it("redacts network errors rather than reflecting credentials", async () => {
    const app = createApp(async () => { throw new Error("connection failed: secret-token"); });
    const response = await app.fetch(new Request("https://advisor.test/v1/evidence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: "terraviz", source: "readme" }),
    }));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret-token");
  });
});

describe("request boundary and project discovery", () => {
  it("lists both configured projects and checks health without fetching GitHub", async () => {
    const { app, calls } = harness();
    const health = await app.fetch(new Request("https://advisor.test/health"));
    expect(await health.json()).toMatchObject({ status: "ok", stage: "foundation" });
    const response = await app.fetch(new Request("https://advisor.test/v1/projects"));
    const body = await response.json() as { projects: { id: string }[] };
    expect(body.projects.map((profile) => profile.id)).toEqual(["zyra", "terraviz"]);
    expect(calls).toHaveLength(0);
  });

  it.each([
    { project: "zyra", source: "cli" },
    { project: "terraviz", source: "readme", command: "acquire api" },
    { project: "zyra", source: "cli", command: "acquire api; curl example.com" },
    { project: "zyra", source: "cli", command: "acquire api", options: ["--output=/tmp/file"] },
    { project: "zyra", source: "cli", command: "acquire api", ref: "https://example.com" },
    { project: "zyra", source: "cli", command: "acquire api", repository: "other/repo" },
    null,
  ])("rejects invalid requests before contacting GitHub", async (body) => {
    const { post, calls } = harness();
    expect((await post(body)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it.each([
    { project: "private-repo", source: "readme" },
    { project: "terraviz", source: "../../secret" },
  ])("restricts retrieval to configured projects and source IDs", async (body) => {
    const { post, calls } = harness();
    expect((await post(body)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("enforces route methods, JSON input, valid JSON, and request size", async () => {
    const { app, post } = harness();
    const method = await app.fetch(new Request("https://advisor.test/v1/evidence"));
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("POST");
    expect((await app.fetch(new Request("https://advisor.test/missing"))).status).toBe(404);
    expect((await app.fetch(new Request("https://advisor.test/v1/evidence", { method: "POST", body: "{}" }))).status).toBe(415);
    expect((await app.fetch(new Request("https://advisor.test/v1/evidence", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
    expect((await post({ padding: "x".repeat(17 * 1024) })).status).toBe(413);
  });

  it("classifies malformed UTF-8 input as a client error", async () => {
    const { app, calls } = harness();
    const response = await app.fetch(new Request("https://advisor.test/v1/evidence", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: new Uint8Array([0xff]),
    }));
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("keeps profile source IDs and contribution references internally consistent", () => {
    for (const profile of profiles) {
      const ids = profile.sources.map((source) => source.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(profile.contributions.guidanceSource);
      for (const template of profile.contributions.templates) expect(ids).toContain(template.source);
      for (const related of profile.relatedProjects) expect(profiles.some((other) => other.id === related)).toBe(true);
    }
  });
});
