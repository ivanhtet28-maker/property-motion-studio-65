-- Enable RLS on rate_limits table (was missing).
-- Only the service_role (used by edge functions) should read/write rate_limits.
-- No authenticated user should have direct access to this table.

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically.
-- No policies needed for regular users — they get zero access, which is correct.
-- Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.

COMMENT ON TABLE rate_limits IS 'Request rate limiting for edge functions. RLS enabled — only service_role has access.';
