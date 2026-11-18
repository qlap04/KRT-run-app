# KRT-run – `app` repo (application code)

Stack: Node.js 22 LTS, Express JSON API + React (Vite) frontend, Azure Functions Node.js v4. Infrastructure lives in the separate `infra` repo (Bicep + provision pipeline).
Storage: Blob (one container `proofs`, folders `incoming/` and `processed/`), Queue (upload-jobs), Table (Users, Runs, AuditLog).

## Layout
- `web/` – Express JSON API (src/ MVC: config/models/services/controllers/routes/middlewares, openapi.yaml, tests/)
- `frontend/` – React SPA (Vite); local proxy to the API; JWT in `Authorization: Bearer`
- `function/` – Azure Function, queue trigger `upload-jobs`
- `pipelines/` – `app-deploy.yml` + `templates/steps/` (step templates only) + `variables/<env>.yml`
- `docs/SETUP_vi.md` – environment variables + app pipeline guide (Vietnamese)

## Rules
- Storage auth: `DefaultAzureCredential` (@azure/identity) + `STORAGE_ACCOUNT_NAME`.
- No hardcoded secrets. Use env vars / variable group `krtrun-<env>`.
- NEVER deploy to Azure, run `az login` or `az deployment` without Kai's explicit OK.
- `AuditLog` is append-only (insert), never update/delete.
- New logic needs tests (`node:test`). Unit tests: `npm run test:unit` in `web/` and `function/` (pure, no network; `npm test` = unit). Integration tests: `npm run test:integration` in `web/` (CI only; needs a storage emulator and `STORAGE_CONNECTION_STRING`, skipped when it is not set). Test conventions: unit tests inject config objects or restore `process.env`, use `node:test` `mock` fakes for storage; integration tests read config only from env vars, use random per-run resource names, clean up in `after()`, and generate test secrets at runtime. Integration auth uses JWT Bearer for every authenticated step.
- Small, incremental changes. Everything in the system is English: UI text, messages, API responses, logs, comments, test names, pipeline names. Only `docs/SETUP_vi.md` is Vietnamese.
- Resource names are built in `pipelines/variables/common.yml` and must match the Bicep in the `infra` repo (`<prefix>-<environment>-web|func|apim`). `variables/<env>.yml` holds only `environment` and `serviceConnection` (one service connection per environment, read with `${{ variables.serviceConnection }}`).
- Pipeline rules (same as `infra`): stages and jobs live in `app-deploy.yml`; reusable work is step templates under `pipelines/templates/steps/`; one pool `ubuntu-latest`; deploys run in a deployment job on ADO Environment `krtrun-<env>` (approval configured in the UI). Variable group and Environment names are built as `${{ variables.projectName }}-${{ variables.environment }}`, never hardcoded. The boolean parameter `deployInfra` (default false) adds a `ProvisionInfra` stage that calls `bicep-deployment.yml@infra` for `main.bicep` (never APIM) before DeployDev.

## Environments & Git flow
Only `dev` is active for now (ADO Environment `krtrun-dev`, with approval). The app still accepts the names `sit`, `uat`, `preprod`, and `prod` in `APP_ENV` so a later environment can be added without changing the config contract.

| Branch | `app-deploy` pipeline runs |
|---|---|
| `develop` | Build → DEV |

- Feature branches start from `develop` (`feature/<name>`) and merge back through a PR.
- To add an environment later: add `pipelines/variables/<env>.yml`, a deploy stage, plus an Azure DevOps Environment and (if needed) a variable group. In the `infra` repo also add `bicep/env/<env>.bicepparam` and a provision stage.
