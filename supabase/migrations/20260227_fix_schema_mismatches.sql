-- Fix schema mismatches between edge functions and database columns
-- Edge functions write to columns not defined in the original migration

-- Videos table: add columns written by generate-video function
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS property_address TEXT,
  ADD COLUMN IF NOT EXISTS price TEXT,
  ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS bathrooms INTEGER,
  ADD COLUMN IF NOT EXISTS car_spaces INTEGER,
  ADD COLUMN IF NOT EXISTS template_used TEXT,
  ADD COLUMN IF NOT EXISTS music_used TEXT,
  ADD COLUMN IF NOT EXISTS photos JSONB;

-- Add RLS policy for service-role updates (edge functions use service key)
-- The existing RLS policies only allow authenticated users to update their own rows,
-- but edge functions using service_role key bypass RLS entirely.
-- No new policy needed, but document this for clarity.

COMMENT ON COLUMN videos.source IS 'How the video was created: upload or scrape';
COMMENT ON COLUMN videos.property_address IS 'Property address for display';
COMMENT ON COLUMN videos.photos IS 'JSON blob with Runway generation context for recovery';
