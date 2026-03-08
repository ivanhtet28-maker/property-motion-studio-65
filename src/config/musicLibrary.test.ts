import { describe, it, expect } from "vitest";
import { MUSIC_LIBRARY, getMusicUrl, getTracksByCategory } from "./musicLibrary";

describe("Music Library", () => {
  describe("MUSIC_LIBRARY", () => {
    it("should have 13 music tracks matching Supabase Storage files", () => {
      const trackCount = Object.keys(MUSIC_LIBRARY).length;
      expect(trackCount).toBe(13);
    });

    it("should have valid URLs for all tracks", () => {
      Object.entries(MUSIC_LIBRARY).forEach(([_id, track]) => {
        expect(track.url).toMatch(/^https:\/\//);
        expect(track.url).toContain("supabase.co");
        expect(track.url).toContain("/storage/v1/object/public/video-assets/music/");
      });
    });

    it("should have valid durations", () => {
      Object.values(MUSIC_LIBRARY).forEach((track) => {
        expect(track.duration).toBeGreaterThan(0);
        expect(track.duration).toBeLessThan(300);
      });
    });

    it("should have unique names", () => {
      const names = Object.values(MUSIC_LIBRARY).map((track) => track.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("should have all required track IDs", () => {
      const requiredIds = [
        "cinematic-epic-1",
        "cinematic-epic-2",
        "cinematic-epic-3",
        "luxury-1",
        "modern-chill-1",
        "modern-chill-2",
        "lofi-2",
        "upbeat-energetic-3",
        "upbeat-1",
        "classical-elegant-1",
        "classical-elegant-2",
        "ambient-relaxing-1",
        "ambient-relaxing-2",
      ];

      requiredIds.forEach((id) => {
        expect(MUSIC_LIBRARY[id]).toBeDefined();
      });
    });
  });

  describe("getMusicUrl", () => {
    it("should return correct URL for valid track ID", () => {
      const url = getMusicUrl("cinematic-epic-1");
      expect(url).toBe(MUSIC_LIBRARY["cinematic-epic-1"].url);
    });

    it("should return null for invalid track ID", () => {
      const url = getMusicUrl("non-existent-track");
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
    it("should return cinematic tracks", () => {
      const tracks = getTracksByCategory("cinematic");
      expect(tracks.length).toBeGreaterThanOrEqual(3);
    });

    it("should return modern tracks", () => {
      const tracks = getTracksByCategory("modern");
      expect(tracks.length).toBeGreaterThanOrEqual(2);
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
      Object.entries(MUSIC_LIBRARY).forEach(([_id, track]) => {
        expect(track).toHaveProperty("url");
        expect(track).toHaveProperty("name");
        expect(track).toHaveProperty("duration");
        expect(track).toHaveProperty("category");
      });
    });

    it("should have valid category values", () => {
      const validCategories = ["modern", "ambient", "cinematic", "energetic", "classical"];
      Object.values(MUSIC_LIBRARY).forEach((track) => {
        expect(validCategories).toContain(track.category);
      });
    });
  });
});
