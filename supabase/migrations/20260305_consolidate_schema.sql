-- Consolidate schema: fix users → user_preferences, add videos_limit, add render_id
-- The frontend and edge functions were querying a "users" table that doesn't exist.
-- All user data lives in user_preferences. This migration adds any missing columns.

-- Add videos_limit column (used by CreateVideo.tsx subscription check)
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS videos_limit INTEGER DEFAULT 10;

-- Set videos_limit based on subscription_plan
UPDATE user_preferences SET videos_limit = 10 WHERE subscription_plan = 'starter' OR subscription_plan IS NULL;
UPDATE user_preferences SET videos_limit = 30 WHERE subscription_plan = 'growth';
UPDATE user_preferences SET videos_limit = 100 WHERE subscription_plan = 'enterprise';

-- Add render_id to videos (Shotstack job ID for recovery polling)
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS render_id TEXT;

-- Create a "users" view that aliases user_preferences for backward compatibility.
-- This lets existing code that queries from("users") keep working while we migrate.
-- The view maps user_preferences columns to what the frontend expects.
CREATE OR REPLACE VIEW users AS
SELECT
  user_id AS id,
  subscription_status,
  subscription_plan,
  subscription_tier,
  free_video_used,
  videos_used_this_period,
  videos_limit,
  stripe_customer_id,
  stripe_subscription_id,
  payment_method_last4,
  payment_method_brand,
  subscription_period_start,
  subscription_period_end,
  subscription_cancel_at_period_end,
  period_reset_date,
  created_at,
  updated_at
FROM user_preferences;

-- Allow authenticated users to read their own row from the view
-- (Views inherit RLS from underlying tables, but we need a policy for the view)
-- Note: Supabase views with security_invoker respect the underlying table's RLS

-- Add RLS bypass for service role updates on user_preferences
-- (edge functions use service_role key which bypasses RLS, but document this)
COMMENT ON VIEW users IS 'Compatibility view over user_preferences. Frontend queries this; Stripe webhook writes to user_preferences.';

-- Add index for render_id lookups (Dashboard recovery polling)
CREATE INDEX IF NOT EXISTS idx_videos_render_id ON videos(render_id);

COMMENT ON COLUMN videos.render_id IS 'Shotstack render job ID for status polling and recovery';
COMMENT ON COLUMN user_preferences.videos_limit IS 'Max videos per billing period based on subscription plan';
