# KRT-run – `app` repo (application code)

Stack: Node.js 22 LTS, Express (EJS) monolith, Azure Functions Node.js v4. Infrastructure lives in the separate `infra` repo (Bicep + provision pipeline).
Storage: Blob (incoming, proofs), Queue (upload-jobs), Table (Users, Runs, AuditLog).

## Layout
- `web/` – Express monolith (src/ MVC: config/models/services/controllers/routes/middlewares/views, public/, openapi.yaml, tests/)
- `function/` – Azure Function, queue trigger `upload-jobs`
- `pipelines/` – `app-deploy.yml` + `templates/` + `variables/<env>.yml`
- `docs/SETUP_vi.md` – environment variables + app pipeline guide (Vietnamese)

## Rules
- Storage auth: `DefaultAzureCredential` (@azure/identity) + `STORAGE_ACCOUNT_NAME`.
- No hardcoded secrets. Use env vars / variable group `krtrun-<env>`.
- NEVER deploy to Azure, run `az login` or `az deployment` without Kai's explicit OK.
- `AuditLog` is append-only (insert), never update/delete.
- New logic needs tests (`node:test`). Unit tests: `npm run test:unit` in `web/` and `function/` (pure, no network; `npm test` = unit). Integration tests: `npm run test:integration` in `web/` (CI only; needs a storage emulator and `STORAGE_CONNECTION_STRING`, skipped when it is not set).
- Small, incremental changes. Everything in the system is English: UI text, messages, API responses, logs, comments, test names, pipeline names. Only `docs/SETUP_vi.md` is Vietnamese.
- Resource names in `pipelines/variables/<env>.yml` must match the Bicep in the `infra` repo (`<prefix>-<resourceEnv>-web|func|apim`).

## Environments & Git flow
Only `dev` is active for now (ADO Environment `krtrun-dev`, with approval). The app still accepts the names `sit`, `uat`, `preprod`, and `prod` in `APP_ENV` so a later environment can be added without changing the config contract.

| Branch | `app-deploy` pipeline runs |
|---|---|
| `develop` | Build → DEV |

- Feature branches start from `develop` (`feature/<name>`) and merge back through a PR.
- To add an environment later: add `pipelines/variables/<env>.yml`, a deploy stage, plus an Azure DevOps Environment and (if needed) a variable group. In the `infra` repo also add `bicep/env/<env>.bicepparam` and a provision stage.
