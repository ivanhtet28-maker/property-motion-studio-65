-- Add indexes and comments for studio editing columns
-- (Columns were added in 20260314000000_add_studio_edit_columns.sql)

-- Indexes for faster render lookups
CREATE INDEX IF NOT EXISTS idx_videos_current_render ON videos(current_render_id);
CREATE INDEX IF NOT EXISTS idx_videos_original_render ON videos(original_render_id);

-- Column documentation
COMMENT ON COLUMN videos.original_render_id IS 'Initial Shotstack render ID (before edits)';
COMMENT ON COLUMN videos.current_render_id IS 'Latest render ID (may differ if edited)';
COMMENT ON COLUMN videos.edit_history IS 'Array of {timestamp, changes, renderId} objects';
COMMENT ON COLUMN videos.is_editing IS 'Flag: video is currently being re-rendered';
COMMENT ON COLUMN videos.clips IS 'Array of {index, url, duration, camera_angle, image_url} objects for per-clip editing';
