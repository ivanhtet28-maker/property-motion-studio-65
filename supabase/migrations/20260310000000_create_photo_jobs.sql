-- Photo editing and virtual staging jobs
CREATE TABLE IF NOT EXISTS photo_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  job_type TEXT NOT NULL DEFAULT 'enhance',  -- 'enhance' | 'stage'
  original_url TEXT NOT NULL,
  enhanced_url TEXT,
  sky_url TEXT,
  staged_urls JSONB DEFAULT '[]',            -- array of URLs for staging variations
  status TEXT DEFAULT 'pending',             -- pending | processing | complete | failed
  enhancements JSONB DEFAULT '{}',           -- { enhance: bool, sky: bool, sky_type: string }
  stage_options JSONB DEFAULT '{}',          -- { room_type: string, style: string }
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_jobs_user_id_idx ON photo_jobs(user_id);
CREATE INDEX IF NOT EXISTS photo_jobs_type_idx ON photo_jobs(job_type);

ALTER TABLE photo_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own jobs" ON photo_jobs;
CREATE POLICY "Users see own jobs" ON photo_jobs
  FOR ALL USING (auth.uid() = user_id);

-- Enable realtime for live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE photo_jobs;
