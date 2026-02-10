/**
 * Music Library Configuration
 *
 * This file maps music IDs to their storage URLs.
 * After uploading music files to Supabase Storage (video-assets/music/),
 * update the URLs below with your project's storage URLs.
 *
 * URL format: https://[your-project].supabase.co/storage/v1/object/public/video-assets/music/[filename].mp3
 */

interface MusicTrack {
  url: string;
  name: string;
  duration: number; // seconds
  category: "modern" | "ambient" | "luxury" | "energetic" | "classical";
}

export const MUSIC_LIBRARY: Record<string, MusicTrack> = {
  // Upbeat/Modern tracks
  "upbeat-modern-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-modern-1.mp3",
    name: "Upbeat Modern 1",
    duration: 120,
    category: "modern",
  },
  "upbeat-modern-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-modern-2.mp3",
    name: "Upbeat Modern 2",
    duration: 130,
    category: "modern",
  },
  "upbeat-modern-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-modern-3.mp3",
    name: "Upbeat Modern 3",
    duration: 125,
    category: "modern",
  },

  // Calm/Ambient tracks
  "calm-ambient-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/calm-ambient-1.mp3",
    name: "Calm Ambient 1",
    duration: 150,
    category: "ambient",
  },
  "calm-ambient-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/calm-ambient-2.mp3",
    name: "Calm Ambient 2",
    duration: 140,
    category: "ambient",
  },
  "calm-ambient-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/calm-ambient-3.mp3",
    name: "Calm Ambient 3",
    duration: 145,
    category: "ambient",
  },

  // Luxury/Elegant tracks
  "luxury-elegant-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/luxury-elegant-1.mp3",
    name: "Luxury Elegant 1",
    duration: 135,
    category: "luxury",
  },
  "luxury-elegant-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/luxury-elegant-2.mp3",
    name: "Luxury Elegant 2",
    duration: 128,
    category: "luxury",
  },
  "luxury-elegant-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/luxury-elegant-3.mp3",
    name: "Luxury Elegant 3",
    duration: 142,
    category: "luxury",
  },

  // Energetic/Pop tracks
  "energetic-pop-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/energetic-pop-1.mp3",
    name: "Energetic Pop 1",
    duration: 118,
    category: "energetic",
  },
  "energetic-pop-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/energetic-pop-2.mp3",
    name: "Energetic Pop 2",
    duration: 122,
    category: "energetic",
  },
  "energetic-pop-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/energetic-pop-3.mp3",
    name: "Energetic Pop 3",
    duration: 115,
    category: "energetic",
  },

  // Classical/Sophisticated tracks
  "classical-sophisticated-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-sophisticated-1.mp3",
    name: "Classical Sophisticated 1",
    duration: 160,
    category: "classical",
  },
  "classical-sophisticated-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-sophisticated-2.mp3",
    name: "Classical Sophisticated 2",
    duration: 155,
    category: "classical",
  },
  "classical-sophisticated-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-sophisticated-3.mp3",
    name: "Classical Sophisticated 3",
    duration: 148,
    category: "classical",
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
  category: "modern" | "ambient" | "luxury" | "energetic" | "classical"
): string[] => {
  return Object.entries(MUSIC_LIBRARY)
    .filter(([_, track]) => track.category === category)
    .map(([id]) => id);
};
