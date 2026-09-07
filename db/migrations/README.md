# Migrations (S2+)

S2 owns `0001_init.sql` (DATA-DESIGN §2–§4, forward-only via Wrangler D1).
Seed data is never in migrations — it runs through provision/reset
(DATA-DESIGN §7).

`worker/migrations` is a symlink here: Wrangler resolves the migrations
directory next to its config file. This directory stays canonical.
