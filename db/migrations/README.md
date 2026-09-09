# Migrations (S2+)

S2 owns `0001_init.sql` (DATA-DESIGN §2–§4, forward-only via Wrangler D1).
Seed data is never in migrations — it runs through provision/reset
(DATA-DESIGN §7).

`db/migrations` is the canonical directory. The Worker Wrangler config points
to it explicitly with `migrations_dir`, so local development does not depend on
the optional `worker/migrations` filesystem symlink (which may be unavailable
on Windows checkouts).
