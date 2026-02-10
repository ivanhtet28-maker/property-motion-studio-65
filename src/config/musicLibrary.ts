/**
 * Music Library Configuration
 *
 * This file maps music IDs to their storage URLs.
 * Music files are stored in Supabase Storage at video-assets/music/
 *
 * URL format: https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/[filename].mp3
 */

interface MusicTrack {
  url: string;
  name: string;
  duration: number; // seconds
  category: "modern" | "ambient" | "cinematic" | "energetic" | "classical";
}

export const MUSIC_LIBRARY: Record<string, MusicTrack> = {
  // Modern Chill tracks
  "modern-chill-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/modern-chill-1.mp3",
    name: "Modern Chill 1",
    duration: 120,
    category: "modern",
  },
  "modern-chill-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/modern-chill-2.mp3",
    name: "Modern Chill 2",
    duration: 130,
    category: "modern",
  },
  "modern-chill-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/modern-chill-3.mp3",
    name: "Modern Chill 3",
    duration: 125,
    category: "modern",
  },

  // Ambient Relaxing tracks
  "ambient-relaxing-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/ambient-relaxing-1.mp3",
    name: "Ambient Relaxing 1",
    duration: 150,
    category: "ambient",
  },
  "ambient-relaxing-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/ambient-relaxing-2.mp3",
    name: "Ambient Relaxing 2",
    duration: 140,
    category: "ambient",
  },
  "ambient-relaxing-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/ambient-relaxing-3.mp3",
    name: "Ambient Relaxing 3",
    duration: 145,
    category: "ambient",
  },

  // Cinematic Epic tracks
  "cinematic-epic-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/cinematic-epic-1.mp3",
    name: "Cinematic Epic 1",
    duration: 135,
    category: "cinematic",
  },
  "cinematic-epic-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/cinematic-epic-2.mp3",
    name: "Cinematic Epic 2",
    duration: 128,
    category: "cinematic",
  },
  "cinematic-epic-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/cinematic-epic-3.mp3",
    name: "Cinematic Epic 3",
    duration: 142,
    category: "cinematic",
  },

  // Upbeat Energetic tracks
  "upbeat-energetic-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-energetic-1.mp3",
    name: "Upbeat Energetic 1",
    duration: 118,
    category: "energetic",
  },
  "upbeat-energetic-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-energetic-2.mp3",
    name: "Upbeat Energetic 2",
    duration: 122,
    category: "energetic",
  },
  "upbeat-energetic-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-energetic-3.mp3",
    name: "Upbeat Energetic 3",
    duration: 115,
    category: "energetic",
  },

  // Classical Elegant tracks
  "classical-elegant-1": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-elegant-1.mp3",
    name: "Classical Elegant 1",
    duration: 160,
    category: "classical",
  },
  "classical-elegant-2": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-elegant-2.mp3",
    name: "Classical Elegant 2",
    duration: 155,
    category: "classical",
  },
  "classical-elegant-3": {
    url: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-elegant-3.mp3",
    name: "Classical Elegant 3",
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
  category: "modern" | "ambient" | "cinematic" | "energetic" | "classical"
): string[] => {
  return Object.entries(MUSIC_LIBRARY)
    .filter(([_, track]) => track.category === category)
    .map(([id]) => id);
};
