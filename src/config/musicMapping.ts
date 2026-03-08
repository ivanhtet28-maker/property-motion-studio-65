// Supabase Storage base URL for music assets
// Upload MP3 files to: video-assets/music/
const MUSIC_BASE_URL =
  "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music";

// Map frontend music track names → Shotstack-compatible audio URLs.
// Filenames must match exactly what's in Supabase Storage under video-assets/music/.
export const MUSIC_TRACK_MAPPING: Record<string, { id: string; url: string }> = {
  "ambient-relaxing-1":      { id: "ambient-relaxing-1", url: `${MUSIC_BASE_URL}/ambient-relaxing-1` },
  "ambient-relaxing-2":      { id: "ambient-relaxing-2", url: `${MUSIC_BASE_URL}/ambient-relaxing-2` },
  "cinematic-epic-1":        { id: "cinematic-epic-1", url: `${MUSIC_BASE_URL}/cinematic-epic-1` },
  "cinematic-epic-2":        { id: "cinematic-epic-2", url: `${MUSIC_BASE_URL}/cinematic-epic-2` },
  "cinematic-epic-3":        { id: "cinematic-epic-3", url: `${MUSIC_BASE_URL}/cinematic-epic-3` },
  "classical-elegant-1":     { id: "classical-elegant-1", url: `${MUSIC_BASE_URL}/classical-elegant-1` },
  "classical-elegant-2":     { id: "classical-elegant-2", url: `${MUSIC_BASE_URL}/classical-elegant-2` },
  "Lofi 2 .mp3":             { id: "lofi-2", url: `${MUSIC_BASE_URL}/${encodeURIComponent("Lofi 2 .mp3")}` },
  "Luxury 1.mp3":            { id: "luxury-1", url: `${MUSIC_BASE_URL}/${encodeURIComponent("Luxury 1.mp3")}` },
  "modern-chill-1":          { id: "modern-chill-1", url: `${MUSIC_BASE_URL}/modern-chill-1` },
  "modern-chill-2":          { id: "modern-chill-2", url: `${MUSIC_BASE_URL}/modern-chill-2` },
  "Upbeat 1 .mp3":           { id: "upbeat-1", url: `${MUSIC_BASE_URL}/${encodeURIComponent("Upbeat 1 .mp3")}` },
  "upbeat-energetic-3.mp3":  { id: "upbeat-energetic-3", url: `${MUSIC_BASE_URL}/upbeat-energetic-3.mp3` },
};

/**
 * Get the music track ID (for legacy compatibility)
 */
export function getMusicId(trackName: string): string | null {
  return MUSIC_TRACK_MAPPING[trackName]?.id || null;
}

/**
 * Get the direct audio URL for Shotstack soundtrack
 */
export function getMusicUrl(trackName: string): string | null {
  return MUSIC_TRACK_MAPPING[trackName]?.url || null;
}
