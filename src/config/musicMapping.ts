// Supabase Storage base URL for music assets
// Upload MP3 files to: video-assets/music/{id}.mp3
const MUSIC_BASE_URL =
  "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music";

// Map frontend music track names → Shotstack-compatible audio URLs.
// Each track is an MP3 hosted in Supabase Storage under video-assets/music/.
// To add a new track: upload the MP3 to the bucket and add an entry here.
export const MUSIC_TRACK_MAPPING: Record<string, { id: string; url: string }> = {
  // ─── Cinematic ──────────────────────────────────────
  "Horizon - Epic Journey":       { id: "cinematic-1", url: `${MUSIC_BASE_URL}/cinematic-1.mp3` },
  "Summit - Orchestral Rise":     { id: "cinematic-2", url: `${MUSIC_BASE_URL}/cinematic-2.mp3` },
  "Grand Estate - Dramatic Reveal": { id: "cinematic-3", url: `${MUSIC_BASE_URL}/cinematic-3.mp3` },
  "Prestige - Luxury Showcase":   { id: "cinematic-4", url: `${MUSIC_BASE_URL}/cinematic-4.mp3` },
  "Skyline - Aerial Sweep":       { id: "cinematic-5", url: `${MUSIC_BASE_URL}/cinematic-5.mp3` },

  // ─── Modern ─────────────────────────────────────────
  "Daylight - Acoustic Pop":      { id: "modern-1", url: `${MUSIC_BASE_URL}/modern-1.mp3` },
  "Waves - Lo-fi Beats":          { id: "modern-2", url: `${MUSIC_BASE_URL}/modern-2.mp3` },
  "Sunset - Acoustic Vibes":      { id: "modern-3", url: `${MUSIC_BASE_URL}/modern-3.mp3` },
  "Cornerstone - Indie Folk":     { id: "modern-4", url: `${MUSIC_BASE_URL}/modern-4.mp3` },
  "Blueprint - Minimal House":    { id: "modern-5", url: `${MUSIC_BASE_URL}/modern-5.mp3` },

  // ─── Energetic ──────────────────────────────────────
  "Open Door - Upbeat Pop":       { id: "energetic-1", url: `${MUSIC_BASE_URL}/energetic-1.mp3` },
  "Drive - Electronic":           { id: "energetic-2", url: `${MUSIC_BASE_URL}/energetic-2.mp3` },
  "Welcome Home - Feel Good":     { id: "energetic-3", url: `${MUSIC_BASE_URL}/energetic-3.mp3` },
  "First Look - Bright & Fun":    { id: "energetic-4", url: `${MUSIC_BASE_URL}/energetic-4.mp3` },
  "Move In - Happy Bounce":       { id: "energetic-5", url: `${MUSIC_BASE_URL}/energetic-5.mp3` },

  // ─── Classical ──────────────────────────────────────
  "Nocturne - Piano Solo":        { id: "classical-1", url: `${MUSIC_BASE_URL}/classical-1.mp3` },
  "Adagio - String Quartet":      { id: "classical-2", url: `${MUSIC_BASE_URL}/classical-2.mp3` },
  "Heritage - Piano & Cello":     { id: "classical-3", url: `${MUSIC_BASE_URL}/classical-3.mp3` },
  "Elegance - Chamber Music":     { id: "classical-4", url: `${MUSIC_BASE_URL}/classical-4.mp3` },
  "Manor - Harp & Strings":       { id: "classical-5", url: `${MUSIC_BASE_URL}/classical-5.mp3` },

  // ─── Ambient ────────────────────────────────────────
  "Drift - Ambient Tones":        { id: "ambient-1", url: `${MUSIC_BASE_URL}/ambient-1.mp3` },
  "Serenity - Soft Pads":         { id: "ambient-2", url: `${MUSIC_BASE_URL}/ambient-2.mp3` },
  "Retreat - Nature & Keys":      { id: "ambient-3", url: `${MUSIC_BASE_URL}/ambient-3.mp3` },
  "Sanctuary - Warm Textures":    { id: "ambient-4", url: `${MUSIC_BASE_URL}/ambient-4.mp3` },
  "Harbour - Coastal Calm":       { id: "ambient-5", url: `${MUSIC_BASE_URL}/ambient-5.mp3` },
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
