/**
 * Music Library Configuration
 *
 * This file maps music IDs to their storage URLs.
 * Music files are stored in Supabase Storage at video-assets/music/
 *
 * URL format: https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/[filename].mp3
 *
 * To add a new track:
 * 1. Upload the MP3 to Supabase Storage under video-assets/music/
 * 2. Add an entry here with the matching ID
 * 3. Add a display name entry in musicMapping.ts
 * 4. Add a UI entry in StepBranding.tsx MUSIC_TRACKS array
 */

const MUSIC_BASE =
  "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music";

interface MusicTrack {
  url: string;
  name: string;
  duration: number; // seconds
  category: "modern" | "ambient" | "cinematic" | "energetic" | "classical";
}

export const MUSIC_LIBRARY: Record<string, MusicTrack> = {
  // ─── Cinematic ─────────────────────────────────────
  "cinematic-epic-1": {
    url: `${MUSIC_BASE}/cinematic-epic-1`,
    name: "Horizon - Epic Journey",
    duration: 165,
    category: "cinematic",
  },
  "cinematic-epic-2": {
    url: `${MUSIC_BASE}/cinematic-epic-2`,
    name: "Summit - Orchestral Rise",
    duration: 192,
    category: "cinematic",
  },
  "cinematic-epic-3": {
    url: `${MUSIC_BASE}/cinematic-epic-3`,
    name: "Grand Estate - Dramatic Reveal",
    duration: 150,
    category: "cinematic",
  },
  "luxury-1": {
    url: `${MUSIC_BASE}/${encodeURIComponent("Luxury 1.mp3")}`,
    name: "Luxury Showcase",
    duration: 178,
    category: "cinematic",
  },

  // ─── Modern ────────────────────────────────────────
  "modern-chill-1": {
    url: `${MUSIC_BASE}/modern-chill-1`,
    name: "Daylight - Acoustic Pop",
    duration: 160,
    category: "modern",
  },
  "modern-chill-2": {
    url: `${MUSIC_BASE}/modern-chill-2`,
    name: "Waves - Lo-fi Beats",
    duration: 175,
    category: "modern",
  },
  "lofi-2": {
    url: `${MUSIC_BASE}/${encodeURIComponent("Lofi 2 .mp3")}`,
    name: "Lofi Chill Beats",
    duration: 180,
    category: "modern",
  },

  // ─── Energetic ─────────────────────────────────────
  "upbeat-energetic-3": {
    url: `${MUSIC_BASE}/upbeat-energetic-3.mp3`,
    name: "Welcome Home - Feel Good",
    duration: 162,
    category: "energetic",
  },
  "upbeat-1": {
    url: `${MUSIC_BASE}/${encodeURIComponent("Upbeat 1 .mp3")}`,
    name: "Upbeat Energy",
    duration: 155,
    category: "energetic",
  },

  // ─── Classical ─────────────────────────────────────
  "classical-elegant-1": {
    url: `${MUSIC_BASE}/classical-elegant-1`,
    name: "Nocturne - Piano Solo",
    duration: 200,
    category: "classical",
  },
  "classical-elegant-2": {
    url: `${MUSIC_BASE}/classical-elegant-2`,
    name: "Adagio - String Quartet",
    duration: 225,
    category: "classical",
  },

  // ─── Ambient ───────────────────────────────────────
  "ambient-relaxing-1": {
    url: `${MUSIC_BASE}/ambient-relaxing-1`,
    name: "Drift - Ambient Tones",
    duration: 180,
    category: "ambient",
  },
  "ambient-relaxing-2": {
    url: `${MUSIC_BASE}/ambient-relaxing-2`,
    name: "Serenity - Soft Pads",
    duration: 205,
    category: "ambient",
  },
};

/**
 * Get music URL by music ID
 * @param musicId - The music track ID
 * @returns The music URL or null if not found
 */
export const getMusicUrl = (musicId: string): string | null => {
  const track = MUSIC_LIBRARY[musicId];
  if (!track) {
    console.warn(`Music track not found: ${musicId}`);
    return null;
  }
  return track.url;
};

/**
 * Get all tracks by category
 * @param category - The music category
 * @returns Array of track IDs in that category
 */
export const getTracksByCategory = (
  category: "modern" | "ambient" | "cinematic" | "energetic" | "classical"
): string[] => {
  return Object.entries(MUSIC_LIBRARY)
    .filter(([_, track]) => track.category === category)
    .map(([id]) => id);
};
