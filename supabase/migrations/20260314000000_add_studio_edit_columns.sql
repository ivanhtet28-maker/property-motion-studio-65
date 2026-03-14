-- Add studio editing support columns to videos table

-- Store the original Shotstack render ID (first render)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS original_render_id TEXT;

-- Store the current (latest) render ID after edits
ALTER TABLE videos ADD COLUMN IF NOT EXISTS current_render_id TEXT;

-- JSONB array of edit history records
-- Each entry: { "edited_at": "...", "changes": {...}, "render_id": "..." }
ALTER TABLE videos ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb;

-- Lock flag while a re-render is in progress
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_editing BOOLEAN DEFAULT false;

-- Store the full Shotstack composition for re-editing
ALTER TABLE videos ADD COLUMN IF NOT EXISTS shotstack_composition JSONB;

-- Backfill: set original_render_id from render_id where it exists
UPDATE videos SET original_render_id = render_id WHERE render_id IS NOT NULL AND original_render_id IS NULL;
UPDATE videos SET current_render_id = render_id WHERE render_id IS NOT NULL AND current_render_id IS NULL;

-- Allow service role to update videos (for edge function re-renders)
CREATE POLICY "Users can update own videos" ON videos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
