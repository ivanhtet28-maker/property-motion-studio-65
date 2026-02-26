-- Add error_message column to videos table
-- This column was defined in the initial schema but not applied to the live database
ALTER TABLE videos ADD COLUMN IF NOT EXISTS error_message TEXT;

COMMENT ON COLUMN videos.error_message IS 'Error message when video generation fails';
