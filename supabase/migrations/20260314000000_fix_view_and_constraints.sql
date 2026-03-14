-- Fix: subscription_plan constraint missing 'pro', users table missing signup_ip_hash
-- Note: 'users' is the actual table (not user_preferences) — confirmed from live DB.

-- 1. Fix subscription_plan CHECK — add 'pro' (Stripe checkout uses 'pro' but constraint blocked it)
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_subscription_plan_check;

ALTER TABLE users
  ADD CONSTRAINT users_subscription_plan_check
  CHECK (subscription_plan IN ('starter', 'growth', 'pro', 'enterprise'));

-- 2. Add signup_ip_hash column for free trial abuse detection (used by generate-video)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_users_signup_ip_hash
  ON users (signup_ip_hash)
  WHERE signup_ip_hash IS NOT NULL;

COMMENT ON COLUMN users.signup_ip_hash IS 'SHA-256 hash of signup IP for multi-account abuse detection';
COMMENT ON COLUMN users.subscription_plan IS 'Stripe subscription plan: starter, growth, pro, enterprise';
