-- A full sync can now exceed a single serverless invocation's time budget for
-- large libraries. runSync() persists progress here (pagination offsets, ids
-- collected so far, etc.) so a follow-up invocation resumes mid-pass instead
-- of restarting from scratch. Null means no chunked run is in progress.
alter table sync_runs add column cursor jsonb;
