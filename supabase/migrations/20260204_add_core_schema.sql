-- Core schema for Property Motion video generator
-- Tables: properties, videos, scraping_jobs, user_preferences

-- ============================================================================
-- PROPERTIES TABLE
-- Stores scraped or manually entered property information
-- ============================================================================
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Property Details
  address TEXT NOT NULL,
  suburb TEXT,
  state TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'AU',

  price TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  parking INTEGER,
  land_size TEXT,

  -- Listing Information
  source_url TEXT, -- Original listing URL (for scraped properties)
  source_website TEXT, -- domain.com.au, realtor.com.au, etc.
  listing_id TEXT, -- External listing ID if available

  -- Features and Description
  features TEXT[], -- Array of property features
  description TEXT, -- Full property description

  -- Media
  image_urls TEXT[], -- Array of image URLs from scraping or upload

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  CONSTRAINT unique_source_listing UNIQUE(source_website, listing_id)
);

-- Enable Row Level Security
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Users can only see their own properties
CREATE POLICY "Users can view own properties"
  ON properties FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own properties
CREATE POLICY "Users can insert own properties"
  ON properties FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own properties
CREATE POLICY "Users can update own properties"
  ON properties FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own properties
CREATE POLICY "Users can delete own properties"
  ON properties FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_properties_user_id ON properties(user_id);
CREATE INDEX idx_properties_created_at ON properties(created_at DESC);
CREATE INDEX idx_properties_source ON properties(source_website, listing_id);

-- ============================================================================
-- VIDEOS TABLE
-- Stores generated video information and metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,

  -- Video Generation Details
  provider TEXT NOT NULL DEFAULT 'shotstack', -- shotstack, luma, etc.
  provider_job_id TEXT, -- External job ID from provider

  -- Video Configuration
  template TEXT,
  style TEXT,
  voice_id TEXT,
  music_id TEXT,
  color_scheme TEXT,
  aspect_ratio TEXT DEFAULT '9:16', -- 9:16 (mobile) or 16:9 (desktop)

  -- Generated Content
  script TEXT, -- Video script/narration
  video_url TEXT, -- Final video download URL
  thumbnail_url TEXT, -- Video thumbnail
  duration INTEGER, -- Duration in seconds

  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'queued', -- queued, processing, completed, failed
  progress INTEGER DEFAULT 0, -- 0-100 percentage
  error_message TEXT,

  -- Agent Information
  agent_name TEXT,
  agent_company TEXT,
  agent_phone TEXT,
  agent_email TEXT,
  agent_photo_url TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Social Media Sharing
  shared_to_platforms TEXT[], -- ['instagram', 'facebook', 'tiktok']
  view_count INTEGER DEFAULT 0
);

-- Enable Row Level Security
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Users can only see their own videos
CREATE POLICY "Users can view own videos"
  ON videos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own videos
CREATE POLICY "Users can insert own videos"
  ON videos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own videos
CREATE POLICY "Users can update own videos"
  ON videos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own videos
CREATE POLICY "Users can delete own videos"
  ON videos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_videos_user_id ON videos(user_id);
CREATE INDEX idx_videos_property_id ON videos(property_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX idx_videos_provider_job ON videos(provider, provider_job_id);

-- ============================================================================
-- SCRAPING JOBS TABLE
-- Tracks ScraperAPI requests and responses
-- ============================================================================
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,

  -- Scraping Details
  source_url TEXT NOT NULL,
  source_website TEXT NOT NULL, -- domain.com.au, realtor.com.au

  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed

  -- Results
  images_found INTEGER DEFAULT 0,
  images_scraped TEXT[], -- URLs of scraped images
  property_data JSONB, -- Raw scraped data

  -- Error Handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own scraping jobs
CREATE POLICY "Users can view own scraping jobs"
  ON scraping_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own scraping jobs
CREATE POLICY "Users can insert own scraping jobs"
  ON scraping_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own scraping jobs
CREATE POLICY "Users can update own scraping jobs"
  ON scraping_jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_scraping_jobs_user_id ON scraping_jobs(user_id);
CREATE INDEX idx_scraping_jobs_property_id ON scraping_jobs(property_id);
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_created_at ON scraping_jobs(created_at DESC);

-- ============================================================================
-- USER PREFERENCES TABLE
-- Stores user settings and API usage tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Default Video Settings
  default_template TEXT,
  default_voice_id TEXT,
  default_music_id TEXT,
  default_color_scheme TEXT,
  default_aspect_ratio TEXT DEFAULT '9:16',

  -- Agent Defaults
  default_agent_name TEXT,
  default_agent_company TEXT,
  default_agent_phone TEXT,
  default_agent_email TEXT,
  default_agent_photo_url TEXT,

  -- API Usage Tracking
  videos_generated INTEGER DEFAULT 0,
  properties_scraped INTEGER DEFAULT 0,
  total_render_time INTEGER DEFAULT 0, -- Total seconds

  -- Subscription/Credits (for future use)
  subscription_tier TEXT DEFAULT 'free', -- free, pro, enterprise
  credits_remaining INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only see their own preferences
CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraping_jobs_updated_at
  BEFORE UPDATE ON scraping_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Function to create default user preferences on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create preferences for new users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
