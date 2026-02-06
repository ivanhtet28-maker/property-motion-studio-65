// Map frontend music track names to backend music IDs
export const MUSIC_TRACK_MAPPING: Record<string, string> = {
  // Cinematic & Epic
  "Horizon - Epic Journey": "cinematic-epic-1",
  "Summit - Orchestral Rise": "cinematic-epic-2",
  "Vast - Dramatic Sweep": "cinematic-epic-3",

  // Modern & Chill
  "Asteroid - Modern & Chill": "modern-chill-1",
  "Waves - Lo-fi Beats": "modern-chill-2",
  "Sunset - Acoustic Vibes": "modern-chill-3",

  // Upbeat & Energetic
  "Pulse - Dance Pop": "upbeat-energetic-1",
  "Drive - Electronic": "upbeat-energetic-2",
  "Spark - Indie Rock": "upbeat-energetic-3",

  // Classical Elegance
  "Nocturne - Piano Solo": "classical-elegant-1",
  "Adagio - String Quartet": "classical-elegant-2",
  "Grace - Chamber Music": "classical-elegant-3",

  // Ambient Relaxing
  "Drift - Ambient Tones": "ambient-relaxing-1",
  "Serenity - Nature Sounds": "ambient-relaxing-2",
  "Flow - Meditation": "ambient-relaxing-3",
};

// Convert frontend track name to backend ID
export function getMusicId(trackName: string): string | null {
  return MUSIC_TRACK_MAPPING[trackName] || null;
}
