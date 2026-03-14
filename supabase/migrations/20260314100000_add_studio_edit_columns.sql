-- Add studio editing columns to videos table

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS original_render_id TEXT,
  ADD COLUMN IF NOT EXISTS current_render_id TEXT,
  ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_editing BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shotstack_composition JSONB;

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_videos_current_render_id ON videos(current_render_id);
CREATE INDEX IF NOT EXISTS idx_videos_original_render_id ON videos(original_render_id);
CREATE INDEX IF NOT EXISTS idx_videos_is_editing ON videos(is_editing);

-- Add comments
COMMENT ON COLUMN videos.original_render_id IS 'Initial Shotstack render ID (before any edits)';
COMMENT ON COLUMN videos.current_render_id IS 'Latest Shotstack render ID (may differ if edited)';
COMMENT ON COLUMN videos.edit_history IS 'Array of {timestamp, changes, renderId} objects tracking all edits';
COMMENT ON COLUMN videos.is_editing IS 'Flag indicating video is currently being re-rendered in Studio';
COMMENT ON COLUMN videos.shotstack_composition IS 'Cached Shotstack composition XML/JSON for re-editing without full re-composition';
