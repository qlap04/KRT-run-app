# KRT-run – app

Portal where employees of company F submit monthly running proof: Express (EJS) + Azure Function (Node 22), data in Blob/Queue/Table.

```
web/        Express monolith (UI + API + openapi.yaml)
function/   Function that processes the upload-jobs queue
pipelines/  app-deploy.yml, templates/, variables/<env>.yml
docs/       SETUP_vi.md (Vietnamese setup guide)
```

Tests: `cd web && npm run test:unit` (also `test:integration`, which needs a storage emulator and `STORAGE_CONNECTION_STRING`; it runs in CI), `cd function && npm run test:unit`.
Guide: [docs/SETUP_vi.md](docs/SETUP_vi.md). Infrastructure (Bicep) lives in the separate `infra` repo; run provision before `app-deploy`.
