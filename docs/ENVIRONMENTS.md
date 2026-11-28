# Environments and release process

Status: **local and production exist. Staging is designed here but not created yet.** Creating it takes about 20 minutes and no money (a second free Supabase project).

## Environments

| | Local | CI | Staging (planned) | Production |
| --- | --- | --- | --- | --- |
| Purpose | Development | Every push | Try a migration or a workflow change before it touches real data | The student's real semester |
| App | `npm start` | Headless browser, demo data | Same static files, `js/config.js` pointing at staging | GitHub Pages (demo) and the student's own device (personal) |
| Database | None, or `?demo=1` | Fake Supabase in tests | Separate Supabase project with demo data only | Supabase project with real rows |
| Automations | `node automations/run-local.js` | Executed against fakes | GitHub environment `staging`, manual trigger only | GitHub environment `production`, hourly schedule |
| Secrets | `automations/.env` (git-ignored) | None | Environment-scoped GitHub secrets | Environment-scoped GitHub secrets |

## Release flow

1. Branch and pull request. CI runs lint, type check, logic, migration, automation and UI tests, and the coverage gate.
2. If the change adds a migration: run the new file in **staging** first. Check the app against it.
3. Merge to `main`. Pages deploys the demo automatically.
4. Run the same migration in **production** (SQL Editor). Migrations are safe to re-run, see [supabase/migrations/README.md](../supabase/migrations/README.md).
5. Trigger the changed workflow once by hand (Actions → automations → Run workflow) and confirm the heartbeat updated.

## Rollback

| What broke | How to go back |
| --- | --- |
| Front end | Revert the commit on `main`. Pages redeploys. Installed copies update on the next load because `VERSION` in `sw.js` changes. |
| Automation | Revert the commit. The next hourly run uses the old code. Rows are keyed uniquely, so re-running never duplicates. |
| Migration | Write a new migration that undoes it. Migrations are never edited or deleted. Take a backup first (Supabase → Database → Backups, or export each table as CSV from the table editor, plus "ייצוא גיבוי" in the app). |

## To create staging

1. New Supabase project, run `supabase/schema.sql`.
2. GitHub → Settings → Environments → create `staging` and `production`.
3. Move the existing secrets into `production`; add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `USER_ID` for `staging`.
4. In `.github/workflows/automations.yml` add `environment: production` to each job, and a manual-only copy for `staging`.

Step 4 is not done: it changes how the live automations get their secrets, so do it on a day when a missed run does not matter and trigger each workflow by hand afterwards.
