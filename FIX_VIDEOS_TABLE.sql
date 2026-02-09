-- ============================================================================
-- Fix videos table - Add missing agent columns
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Add missing agent columns if they don't exist
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS agent_company TEXT,
  ADD COLUMN IF NOT EXISTS agent_phone TEXT,
  ADD COLUMN IF NOT EXISTS agent_email TEXT,
  ADD COLUMN IF NOT EXISTS agent_photo_url TEXT;

-- Add is_free_trial column if not exists (from earlier migration)
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS is_free_trial BOOLEAN DEFAULT FALSE;

-- Verify columns were added
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'videos'
  AND column_name IN ('agent_name', 'agent_company', 'agent_phone', 'agent_email', 'agent_photo_url', 'is_free_trial')
ORDER BY column_name;

-- Show result
SELECT 'Videos table fixed successfully!' AS status;
