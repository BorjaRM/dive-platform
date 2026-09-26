# Local PostgreSQL 18 (MT-SPIKE-001)

Synthetic data only.

```bash
docker compose -f infra/docker/postgres/docker-compose.yml up -d
# wait until healthy
pnpm test:integration
```

URLs: see `.env.example`.
