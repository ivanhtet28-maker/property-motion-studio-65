// Supabase Storage base URL for music assets
// Upload MP3 files to: video-assets/music/
const MUSIC_BASE_URL =
  "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music";

// Map frontend music track names → Shotstack-compatible audio URLs.
// Filenames must match exactly what's in Supabase Storage under video-assets/music/.
export const MUSIC_TRACK_MAPPING: Record<string, { id: string; url: string }> = {
  // ─── Cinematic ──────────────────────────────────────
  "Horizon - Epic Journey":         { id: "cinematic-epic-1", url: `${MUSIC_BASE_URL}/cinematic-epic-1` },
  "Summit - Orchestral Rise":       { id: "cinematic-epic-2", url: `${MUSIC_BASE_URL}/cinematic-epic-2` },
  "Grand Estate - Dramatic Reveal": { id: "cinematic-epic-3", url: `${MUSIC_BASE_URL}/cinematic-epic-3` },
  "Luxury Showcase":                { id: "luxury-1", url: `${MUSIC_BASE_URL}/${encodeURIComponent("Luxury 1.mp3")}` },

  // ─── Modern ─────────────────────────────────────────
  "Daylight - Acoustic Pop":  { id: "modern-chill-1", url: `${MUSIC_BASE_URL}/modern-chill-1` },
  "Waves - Lo-fi Beats":      { id: "modern-chill-2", url: `${MUSIC_BASE_URL}/modern-chill-2` },
  "Lofi Chill Beats":         { id: "lofi-2", url: `${MUSIC_BASE_URL}/${encodeURIComponent("Lofi 2 .mp3")}` },

  // ─── Energetic ──────────────────────────────────────
  "Welcome Home - Feel Good":  { id: "upbeat-energetic-3", url: `${MUSIC_BASE_URL}/upbeat-energetic-3.mp3` },
  "Upbeat Energy":             { id: "upbeat-1", url: `${MUSIC_BASE_URL}/${encodeURIComponent("Upbeat 1 .mp3")}` },

  // ─── Classical ──────────────────────────────────────
  "Nocturne - Piano Solo":     { id: "classical-elegant-1", url: `${MUSIC_BASE_URL}/classical-elegant-1` },
  "Adagio - String Quartet":   { id: "classical-elegant-2", url: `${MUSIC_BASE_URL}/classical-elegant-2` },

  // ─── Ambient ────────────────────────────────────────
  "Drift - Ambient Tones":     { id: "ambient-relaxing-1", url: `${MUSIC_BASE_URL}/ambient-relaxing-1` },
  "Serenity - Soft Pads":      { id: "ambient-relaxing-2", url: `${MUSIC_BASE_URL}/ambient-relaxing-2` },
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
