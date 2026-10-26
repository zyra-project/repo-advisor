# Foundation API

All responses are JSON with `Cache-Control: no-store`. No endpoint calls an LLM, writes to GitHub, runs Zyra, or changes Terraviz state. No browser CORS policy is enabled yet; cross-origin Orbit integration is future work.

## GET /health

Returns `200` with `{ "status": "ok", "service": "repo-advisor", "stage": "foundation" }`. This is process health, not a GitHub connectivity probe.

## GET /v1/projects

Returns `200` with `{ "projects": [...] }`. Each profile includes its repository, default ref, configured source IDs and classifications, related project IDs, and contribution policy. This route makes no network requests.

## POST /v1/evidence

Requires `Content-Type: application/json` and a JSON object no larger than 16 KiB. Unknown fields are rejected.

| Field | Required | Meaning |
| --- | --- | --- |
| `project` | Yes | Configured project ID: `zyra` or `terraviz` |
| `source` | Yes | Source ID from the project's profile |
| `ref` | No | Branch, tag, or commit; defaults to the profile's default ref |
| `command` | For CLI sources | Manifest name such as `acquire api`; no `zyra` prefix or shell arguments |
| `options` | No; CLI only | Up to 100 option names such as `--output`, without values |

References accept up to 200 letters, digits, dots, underscores, dashes, and slashes, starting with a letter or digit. Command names accept lowercase command words separated by single spaces. URLs, repositories, arbitrary paths, and option values are not request fields.

### Document evidence

```json
{
  "project": "terraviz",
  "source": "self-hosting",
  "ref": "main"
}
```

The result has `status: "evidence"`, a source `classification`, `requestedRef`, `commitSha`, `content` containing the full document, and `citations`. Each citation includes `repository`, `path`, `commitSha`, immutable GitHub `url`, and `retrievedAt`.

Documents classified as `vision` describe plans; their contents must not be presented as shipped capability. Retrieved Markdown is data and must not be executed or rendered as unsanitized HTML by a future client.

### CLI evidence

```json
{
  "project": "zyra",
  "source": "cli",
  "command": "import api",
  "options": ["--output"]
}
```

The result includes:

- `status`: `supported`, `unsupported_options`, or `not_in_manifest`.
- `command`: the exact requested name.
- `canonicalCommand`: alias ownership resolved through the manifest index.
- `entry`: the complete manifest entry, when found.
- `unsupportedOptions`: supplied flag names not present in that entry; empty when no entry is found or no unsupported flags were requested.
- `validation`: always `command-and-option-names-only`.
- `classification`, `requestedRef`, `commitSha`, and `citations` as for document evidence.

An unknown stage is checked against the successfully read index and cites that index. An unknown command within a known stage cites both the index and the successfully read domain manifest. HTTP `200` describes a completed lookup, including a verified absence. Clients must inspect `status` before offering a command.

Each response reads files from one immutable commit. The maximum size per source or GitHub metadata response is 512 KiB. Each upstream fetch has a 10-second timeout. The service rejects redirects, so a moved repository requires a profile update.

### Errors

```json
{
  "error": {
    "code": "source_unavailable",
    "message": "Could not retrieve the source. Its contents were not verified."
  }
}
```

| HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Missing, malformed, incompatible, or unknown request fields |
| 404 | `unknown_project`, `unknown_source`, `not_found` | Unconfigured project/source or route |
| 405 | `method_not_allowed` | Wrong HTTP method; `Allow` names the supported method |
| 413 | `content_too_large` | Request body exceeds the limit |
| 415 | `unsupported_media_type` | Body was not submitted as JSON |
| 502 | `source_unavailable` | Upstream HTTP error, network/timeout/redirect failure, invalid UTF-8, or oversized upstream content |
| 502 | `invalid_source` | Invalid upstream JSON, unexpected manifest structure, or unsafe source location |
| 500 | `internal_error` | Unexpected internal failure; details are not returned |

GitHub `404`, `403`, and `429` are retrieval failures, not capability evidence. Errors do not contain raw upstream bodies, credentials, or network exception details. The foundation has no stale-cache fallback.
