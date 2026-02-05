import { describe, it, expect } from "vitest";
import { MUSIC_LIBRARY, getMusicUrl, getTracksByCategory } from "./musicLibrary";

describe("Music Library", () => {
  describe("MUSIC_LIBRARY", () => {
    it("should have 15 music tracks", () => {
      const trackCount = Object.keys(MUSIC_LIBRARY).length;
      expect(trackCount).toBe(15);
    });

    it("should have 3 tracks per category", () => {
      const categories = ["modern", "ambient", "luxury", "energetic", "classical"];

      categories.forEach((category) => {
        const tracks = Object.values(MUSIC_LIBRARY).filter(
          (track) => track.category === category
        );
        expect(tracks).toHaveLength(3);
      });
    });

    it("should have valid URLs for all tracks", () => {
      Object.entries(MUSIC_LIBRARY).forEach(([id, track]) => {
        expect(track.url).toMatch(/^https:\/\//);
        expect(track.url).toContain("acpkhbjgnlenjfiswftx.supabase.co");
        expect(track.url).toContain("/storage/v1/object/public/video-assets/music/");
        expect(track.url).toContain(".mp3");
      });
    });

    it("should have correct URL format matching track ID", () => {
      Object.entries(MUSIC_LIBRARY).forEach(([id, track]) => {
        expect(track.url).toContain(`${id}.mp3`);
      });
    });

    it("should have valid durations", () => {
      Object.values(MUSIC_LIBRARY).forEach((track) => {
        expect(track.duration).toBeGreaterThan(0);
        expect(track.duration).toBeLessThan(300); // Max 5 minutes
      });
    });

    it("should have unique names", () => {
      const names = Object.values(MUSIC_LIBRARY).map((track) => track.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("should have all required track IDs", () => {
      const requiredIds = [
        "upbeat-modern-1",
        "upbeat-modern-2",
        "upbeat-modern-3",
        "calm-ambient-1",
        "calm-ambient-2",
        "calm-ambient-3",
        "luxury-elegant-1",
        "luxury-elegant-2",
        "luxury-elegant-3",
        "energetic-pop-1",
        "energetic-pop-2",
        "energetic-pop-3",
        "classical-sophisticated-1",
        "classical-sophisticated-2",
        "classical-sophisticated-3",
      ];

      requiredIds.forEach((id) => {
        expect(MUSIC_LIBRARY[id]).toBeDefined();
      });
    });
  });

  describe("getMusicUrl", () => {
    it("should return correct URL for valid track ID", () => {
      const url = getMusicUrl("upbeat-modern-1");
      expect(url).toBe(MUSIC_LIBRARY["upbeat-modern-1"].url);
    });

    it("should return null for invalid track ID", () => {
      const url = getMusicUrl("non-existent-track");
      expect(url).toBeNull();
    });

    it("should handle empty string", () => {
      const url = getMusicUrl("");
      expect(url).toBeNull();
    });

    it("should work for all valid track IDs", () => {
      Object.keys(MUSIC_LIBRARY).forEach((id) => {
        const url = getMusicUrl(id);
        expect(url).toBe(MUSIC_LIBRARY[id].url);
      });
    });
  });

  describe("getTracksByCategory", () => {
    it("should return 3 tracks for 'modern' category", () => {
      const tracks = getTracksByCategory("modern");
      expect(tracks).toHaveLength(3);
      expect(tracks).toContain("upbeat-modern-1");
      expect(tracks).toContain("upbeat-modern-2");
      expect(tracks).toContain("upbeat-modern-3");
    });

    it("should return 3 tracks for 'ambient' category", () => {
      const tracks = getTracksByCategory("ambient");
      expect(tracks).toHaveLength(3);
      expect(tracks).toContain("calm-ambient-1");
      expect(tracks).toContain("calm-ambient-2");
      expect(tracks).toContain("calm-ambient-3");
    });

    it("should return 3 tracks for 'luxury' category", () => {
      const tracks = getTracksByCategory("luxury");
      expect(tracks).toHaveLength(3);
      expect(tracks).toContain("luxury-elegant-1");
      expect(tracks).toContain("luxury-elegant-2");
      expect(tracks).toContain("luxury-elegant-3");
    });

    it("should return 3 tracks for 'energetic' category", () => {
      const tracks = getTracksByCategory("energetic");
      expect(tracks).toHaveLength(3);
      expect(tracks).toContain("energetic-pop-1");
      expect(tracks).toContain("energetic-pop-2");
      expect(tracks).toContain("energetic-pop-3");
    });

    it("should return 3 tracks for 'classical' category", () => {
      const tracks = getTracksByCategory("classical");
      expect(tracks).toHaveLength(3);
      expect(tracks).toContain("classical-sophisticated-1");
      expect(tracks).toContain("classical-sophisticated-2");
      expect(tracks).toContain("classical-sophisticated-3");
    });

    it("should only return track IDs from the specified category", () => {
      const modernTracks = getTracksByCategory("modern");

      modernTracks.forEach((trackId) => {
        const track = MUSIC_LIBRARY[trackId];
        expect(track.category).toBe("modern");
      });
    });
  });

  describe("Track Structure", () => {
    it("should have required properties for each track", () => {
      Object.entries(MUSIC_LIBRARY).forEach(([id, track]) => {
        expect(track).toHaveProperty("url");
        expect(track).toHaveProperty("name");
        expect(track).toHaveProperty("duration");
        expect(track).toHaveProperty("category");
      });
    });

    it("should have valid category values", () => {
      const validCategories = ["modern", "ambient", "luxury", "energetic", "classical"];

      Object.values(MUSIC_LIBRARY).forEach((track) => {
        expect(validCategories).toContain(track.category);
      });
    });
  });
});
