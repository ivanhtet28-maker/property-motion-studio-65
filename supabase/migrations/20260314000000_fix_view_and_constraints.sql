-- Fix: subscription_plan constraint missing 'pro', users view missing signup_ip_hash + subscription_tier
-- Context: Edge functions write to 'user_preferences' directly but PostgREST only exposes 'users' (the view).
-- This migration:
-- 1. Adds 'pro' to subscription_plan CHECK constraint
-- 2. Adds signup_ip_hash + subscription_tier to the users view
-- 3. Grants service_role direct access to user_preferences

-- 1. Fix subscription_plan CHECK constraint — add 'pro' (it was missing)
ALTER TABLE user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_subscription_plan_check;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_subscription_plan_check
  CHECK (subscription_plan IN ('starter', 'growth', 'pro', 'enterprise'));

-- 2. Recreate users view to include signup_ip_hash and subscription_tier
CREATE OR REPLACE VIEW users AS
SELECT
  up.user_id AS id,
  au.email,
  up.subscription_tier AS plan,
  up.videos_generated AS videos_used,
  up.videos_limit,
  up.default_agent_name AS agent_name,
  up.default_agent_photo_url AS agent_photo_url,
  up.default_agent_phone AS agent_phone,
  up.default_agent_email AS agent_email,
  up.default_agent_company AS agency_logo_url,
  up.stripe_customer_id,
  up.stripe_subscription_id,
  up.created_at,
  up.subscription_status,
  up.subscription_plan,
  up.subscription_tier,
  up.subscription_period_start,
  up.subscription_period_end,
  up.subscription_cancel_at_period_end,
  up.videos_used_this_period,
  up.period_reset_date,
  up.payment_method_last4,
  up.payment_method_brand,
  up.free_video_used,
  up.signup_ip_hash
FROM user_preferences up
JOIN auth.users au ON au.id = up.user_id;

-- Keep security_invoker so RLS on user_preferences is enforced for authenticated users
ALTER VIEW users SET (security_invoker = true);

-- 3. Grant service_role direct access to user_preferences so edge functions can use it
GRANT SELECT, INSERT, UPDATE, DELETE ON user_preferences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_preferences TO authenticated;

-- Also ensure service_role can update videos
GRANT SELECT, INSERT, UPDATE, DELETE ON videos TO service_role;

COMMENT ON VIEW users IS 'Full compatibility view over user_preferences + auth.users. Used by frontend and edge functions.';
