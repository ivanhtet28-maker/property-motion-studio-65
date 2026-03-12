-- ============================================================
-- Storage security: add missing bucket policies
-- ============================================================

-- 1. Create video-assets bucket (used by video generation pipeline)
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-assets', 'video-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Video assets are uploaded by edge functions using service role key,
-- so we only need public read and user-scoped delete.
CREATE POLICY "Public can view video assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'video-assets');

-- Service role can always insert (edge functions use service role key).
-- Authenticated users can insert to their own folder.
CREATE POLICY "Users upload own video assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'video-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own video assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'video-assets'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 2. Fix property-images INSERT policy: restrict uploads to user's folder
-- Drop the overly permissive policy and replace with folder-scoped one
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;

CREATE POLICY "Users upload own property images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. Add missing DELETE policies for tables
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own scraping jobs'
  ) THEN
    CREATE POLICY "Users can delete own scraping jobs"
    ON public.scraping_jobs FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own preferences'
  ) THEN
    CREATE POLICY "Users can delete own preferences"
    ON public.user_preferences FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END $$;
