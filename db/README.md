# PostgreSQL setup

The application stores all durable state in one ordinary PostgreSQL database.
PostgreSQL 13 or newer and a standard `DATABASE_URL` connection string are the
only persistence requirements. No provider SDK or database-host metadata is
used.

Apply the canonical schema to an empty database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/202608020001_initial_schema.sql
```

The migration creates published papers, evidence, clusters, digest items,
nudges, reflections, read state, notification settings, push subscriptions and
delivery state, and pipeline-run tables with their existing keys and uniqueness
constraints.

Scheduling is deliberately outside the database. Any scheduler may call these
existing endpoints with `Authorization: Bearer <CRON_SECRET>`:

- `POST /api/jobs/generate-daily`
- `POST /api/jobs/send-due`

Do not install `pg_net`, database cron, Vault, or provider-specific roles for
this application.
