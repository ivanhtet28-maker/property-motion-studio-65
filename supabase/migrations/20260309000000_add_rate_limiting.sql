-- Rate limiting table for edge functions.
-- Tracks requests per user/IP to prevent abuse.
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key TEXT NOT NULL,           -- e.g. "generate-video:user:uuid" or "signup:ip:1.2.3.4"
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window
  ON rate_limits (key, window_start);

-- Auto-cleanup: delete entries older than 24 hours.
-- Supabase pg_cron can call this, or it runs on each check.
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
  DELETE FROM rate_limits WHERE window_start < now() - interval '24 hours';
$$ LANGUAGE sql;

-- Track signup IPs to detect multi-account abuse.
-- Stores a hash of the IP, not the raw IP (privacy-friendly).
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS signup_ip_hash TEXT;

-- Index for looking up how many accounts share an IP
CREATE INDEX IF NOT EXISTS idx_user_preferences_signup_ip
  ON user_preferences (signup_ip_hash)
  WHERE signup_ip_hash IS NOT NULL;

-- Atomic increment for video usage counter (prevents race conditions)
CREATE OR REPLACE FUNCTION increment_video_count(p_user_id UUID)
RETURNS void AS $$
  UPDATE user_preferences
  SET videos_used_this_period = COALESCE(videos_used_this_period, 0) + 1
  WHERE user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER;

COMMENT ON TABLE rate_limits IS 'Request rate limiting for edge functions. Entries auto-expire after 24h.';
COMMENT ON COLUMN user_preferences.signup_ip_hash IS 'SHA-256 hash of signup IP for multi-account abuse detection';
