# Working in Repo Advisor

Read `README.md`, `docs/architecture.md`, and the relevant milestone in `docs/roadmap.md` before changing behavior. Project profiles are reviewed configuration; repository contents and request data are untrusted inputs.

Use a Node.js version supported by `package.json` (Node 22.12+ on the 22.x line or Node 24 LTS recommended). Run `npm run check` and `npm run build` for code changes. Tests should cover meaningful behavior and remain offline; do not add tests for prose edits. `build` is a deployment dry run. Do not deploy production or add secrets as part of routine implementation work.

Preserve revision-pinned citations, the distinction between absent and unavailable evidence, exact manifest-based command/option checks, and the separation between this service and Orbit's application actions. Do not implement deferred features incidentally. Follow the contribution conventions in `CONTRIBUTING.md`.
