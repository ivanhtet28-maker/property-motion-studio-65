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
  // ─── Cinematic (5 tracks) ──────────────────────────
  "cinematic-1": {
    url: `${MUSIC_BASE}/cinematic-1.mp3`,
    name: "Horizon - Epic Journey",
    duration: 165,
    category: "cinematic",
  },
  "cinematic-2": {
    url: `${MUSIC_BASE}/cinematic-2.mp3`,
    name: "Summit - Orchestral Rise",
    duration: 192,
    category: "cinematic",
  },
  "cinematic-3": {
    url: `${MUSIC_BASE}/cinematic-3.mp3`,
    name: "Grand Estate - Dramatic Reveal",
    duration: 150,
    category: "cinematic",
  },
  "cinematic-4": {
    url: `${MUSIC_BASE}/cinematic-4.mp3`,
    name: "Prestige - Luxury Showcase",
    duration: 178,
    category: "cinematic",
  },
  "cinematic-5": {
    url: `${MUSIC_BASE}/cinematic-5.mp3`,
    name: "Skyline - Aerial Sweep",
    duration: 185,
    category: "cinematic",
  },

  // ─── Modern (5 tracks) ─────────────────────────────
  "modern-1": {
    url: `${MUSIC_BASE}/modern-1.mp3`,
    name: "Daylight - Acoustic Pop",
    duration: 160,
    category: "modern",
  },
  "modern-2": {
    url: `${MUSIC_BASE}/modern-2.mp3`,
    name: "Waves - Lo-fi Beats",
    duration: 175,
    category: "modern",
  },
  "modern-3": {
    url: `${MUSIC_BASE}/modern-3.mp3`,
    name: "Sunset - Acoustic Vibes",
    duration: 190,
    category: "modern",
  },
  "modern-4": {
    url: `${MUSIC_BASE}/modern-4.mp3`,
    name: "Cornerstone - Indie Folk",
    duration: 168,
    category: "modern",
  },
  "modern-5": {
    url: `${MUSIC_BASE}/modern-5.mp3`,
    name: "Blueprint - Minimal House",
    duration: 180,
    category: "modern",
  },

  // ─── Energetic (5 tracks) ──────────────────────────
  "energetic-1": {
    url: `${MUSIC_BASE}/energetic-1.mp3`,
    name: "Open Door - Upbeat Pop",
    duration: 155,
    category: "energetic",
  },
  "energetic-2": {
    url: `${MUSIC_BASE}/energetic-2.mp3`,
    name: "Drive - Electronic",
    duration: 170,
    category: "energetic",
  },
  "energetic-3": {
    url: `${MUSIC_BASE}/energetic-3.mp3`,
    name: "Welcome Home - Feel Good",
    duration: 162,
    category: "energetic",
  },
  "energetic-4": {
    url: `${MUSIC_BASE}/energetic-4.mp3`,
    name: "First Look - Bright & Fun",
    duration: 148,
    category: "energetic",
  },
  "energetic-5": {
    url: `${MUSIC_BASE}/energetic-5.mp3`,
    name: "Move In - Happy Bounce",
    duration: 175,
    category: "energetic",
  },

  // ─── Classical (5 tracks) ──────────────────────────
  "classical-1": {
    url: `${MUSIC_BASE}/classical-1.mp3`,
    name: "Nocturne - Piano Solo",
    duration: 200,
    category: "classical",
  },
  "classical-2": {
    url: `${MUSIC_BASE}/classical-2.mp3`,
    name: "Adagio - String Quartet",
    duration: 225,
    category: "classical",
  },
  "classical-3": {
    url: `${MUSIC_BASE}/classical-3.mp3`,
    name: "Heritage - Piano & Cello",
    duration: 195,
    category: "classical",
  },
  "classical-4": {
    url: `${MUSIC_BASE}/classical-4.mp3`,
    name: "Elegance - Chamber Music",
    duration: 210,
    category: "classical",
  },
  "classical-5": {
    url: `${MUSIC_BASE}/classical-5.mp3`,
    name: "Manor - Harp & Strings",
    duration: 190,
    category: "classical",
  },

  // ─── Ambient (5 tracks) ────────────────────────────
  "ambient-1": {
    url: `${MUSIC_BASE}/ambient-1.mp3`,
    name: "Drift - Ambient Tones",
    duration: 180,
    category: "ambient",
  },
  "ambient-2": {
    url: `${MUSIC_BASE}/ambient-2.mp3`,
    name: "Serenity - Soft Pads",
    duration: 205,
    category: "ambient",
  },
  "ambient-3": {
    url: `${MUSIC_BASE}/ambient-3.mp3`,
    name: "Retreat - Nature & Keys",
    duration: 195,
    category: "ambient",
  },
  "ambient-4": {
    url: `${MUSIC_BASE}/ambient-4.mp3`,
    name: "Sanctuary - Warm Textures",
    duration: 220,
    category: "ambient",
  },
  "ambient-5": {
    url: `${MUSIC_BASE}/ambient-5.mp3`,
    name: "Harbour - Coastal Calm",
    duration: 185,
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
