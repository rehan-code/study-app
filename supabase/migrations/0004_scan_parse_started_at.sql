-- parse-scan stamps parse_started_at when it claims a scan. A recent stamp
-- means a parse is genuinely in flight, so duplicate parse requests are
-- rejected; a stale stamp means the edge runtime died mid-parse and a retry
-- may take the scan over instead of leaving it stranded in 'parsing'.

alter table public.scans add column parse_started_at timestamptz;
