-- Mirrors sync_runs.cursor (see 0005): a full enrichment pass can exceed a
-- single serverless invocation's time budget, so runEnrichment() persists
-- accumulated counts here between chunks instead of losing them when a run
-- stops early. Null means no chunked run is in progress.
alter table enrichment_runs add column cursor jsonb;
