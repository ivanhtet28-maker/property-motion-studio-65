-- Add free trial tracking to user_preferences table
-- Migration: Track if user has used their free video generation

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS free_video_used BOOLEAN DEFAULT FALSE;

-- Add column to track if a video was created during free trial
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS is_free_trial BOOLEAN DEFAULT FALSE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_preferences_free_trial ON user_preferences(free_video_used);
CREATE INDEX IF NOT EXISTS idx_videos_free_trial ON videos(is_free_trial);

-- Comment on columns
COMMENT ON COLUMN user_preferences.free_video_used IS 'Whether user has used their one free video generation';
COMMENT ON COLUMN videos.is_free_trial IS 'Whether this video was created during free trial (before subscription)';
