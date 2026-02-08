-- Add Stripe fields to user_preferences table
-- Migration: Add Stripe customer and subscription tracking

ALTER TABLE user_preferences
  -- Stripe Customer
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,

  -- Subscription Details
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT CHECK (subscription_status IN ('active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid')),
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT CHECK (subscription_plan IN ('starter', 'growth', 'enterprise')),
  ADD COLUMN IF NOT EXISTS subscription_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN DEFAULT FALSE,

  -- Usage Tracking
  ADD COLUMN IF NOT EXISTS videos_used_this_period INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_reset_date TIMESTAMPTZ,

  -- Payment Method
  ADD COLUMN IF NOT EXISTS payment_method_last4 TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_brand TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_stripe_customer
  ON user_preferences(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_stripe_subscription
  ON user_preferences(stripe_subscription_id);

-- Update subscription_tier to match new plan names
UPDATE user_preferences
SET subscription_tier = 'starter'
WHERE subscription_tier = 'free';

-- Comment on columns
COMMENT ON COLUMN user_preferences.stripe_customer_id IS 'Stripe customer ID (cus_xxx)';
COMMENT ON COLUMN user_preferences.stripe_subscription_id IS 'Stripe subscription ID (sub_xxx)';
COMMENT ON COLUMN user_preferences.subscription_status IS 'Current Stripe subscription status';
COMMENT ON COLUMN user_preferences.subscription_plan IS 'Current subscription plan tier';
COMMENT ON COLUMN user_preferences.videos_used_this_period IS 'Number of videos generated in current billing period';
COMMENT ON COLUMN user_preferences.period_reset_date IS 'Date when video count resets';
