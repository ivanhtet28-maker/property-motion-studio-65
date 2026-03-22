-- Atomic increment for videos_limit (used by top-up webhook handler)
CREATE OR REPLACE FUNCTION increment_videos_limit(p_user_id UUID, p_extra INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_preferences
  SET videos_limit = COALESCE(videos_limit, 2) + p_extra
  WHERE user_id = p_user_id;
END;
$$;
