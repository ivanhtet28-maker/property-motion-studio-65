-- Add clips JSONB column to videos table for individual clip tracking
-- Each clip stores its index, URL, duration, camera angle, and source image URL
-- Example: [{"index": 0, "url": "...", "duration": 5, "camera_angle": "push-in", "image_url": "..."}]

ALTER TABLE videos ADD COLUMN IF NOT EXISTS clips JSONB DEFAULT '[]'::jsonb;
