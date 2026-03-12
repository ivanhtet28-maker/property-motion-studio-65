-- Add column to store the Autoenhance.ai image ID for async polling
ALTER TABLE photo_jobs ADD COLUMN IF NOT EXISTS external_id TEXT;
