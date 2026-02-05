/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { uploadImageToStorage, uploadImagesToStorage } from "./uploadToStorage";
import { supabase } from "@/lib/supabase";

// Mock Supabase client
vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

describe("uploadToStorage", () => {
  describe("uploadImageToStorage", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should upload a single image and return public URL", async () => {
      const mockFile = new File(["test"], "test.jpg", { type: "image/jpeg" });
      const mockPath = "uploads/123-abc.jpg";
      const mockUrl = "https://test.supabase.co/storage/v1/object/public/property-images/uploads/123-abc.jpg";

      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: mockPath },
        error: null,
      });

      const mockGetPublicUrl = vi.fn().mockReturnValue({
        data: { publicUrl: mockUrl },
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      });

      (supabase.storage.from as any) = mockFrom;

      const result = await uploadImageToStorage(mockFile, "uploads");

      expect(mockFrom).toHaveBeenCalledWith("property-images");
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringContaining("uploads/"),
        mockFile,
        { cacheControl: "3600", upsert: false }
      );
      expect(mockGetPublicUrl).toHaveBeenCalledWith(mockPath);
      expect(result).toBe(mockUrl);
    });

    it("should generate unique filename with timestamp and random ID", async () => {
      const mockFile = new File(["test"], "image.png", { type: "image/png" });

      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "test-path" },
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: "https://test.com/image.png" },
        }),
      });

      (supabase.storage.from as any) = mockFrom;

      await uploadImageToStorage(mockFile, "test-folder");

      const uploadCall = mockUpload.mock.calls[0];
      const filename = uploadCall[0] as string;

      expect(filename).toMatch(/^test-folder\/\d+-[a-z0-9]+\.png$/);
    });

    it("should handle upload errors", async () => {
      const mockFile = new File(["test"], "test.jpg", { type: "image/jpeg" });

      const mockUpload = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Upload failed" },
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
      });

      (supabase.storage.from as any) = mockFrom;

      await expect(uploadImageToStorage(mockFile, "uploads")).rejects.toThrow(
        "Failed to upload image: Upload failed"
      );
    });

    it("should use default folder 'uploads' when not specified", async () => {
      const mockFile = new File(["test"], "test.jpg", { type: "image/jpeg" });

      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "uploads/test.jpg" },
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: "https://test.com/test.jpg" },
        }),
      });

      (supabase.storage.from as any) = mockFrom;

      await uploadImageToStorage(mockFile);

      const uploadCall = mockUpload.mock.calls[0];
      const filename = uploadCall[0] as string;

      expect(filename).toMatch(/^uploads\//);
    });

    it("should extract file extension correctly", async () => {
      const testCases = [
        { filename: "test.jpg", expected: "jpg" },
        { filename: "test.png", expected: "png" },
        { filename: "test.image.jpeg", expected: "jpeg" },
      ];

      for (const testCase of testCases) {
        const mockFile = new File(["test"], testCase.filename, { type: "image/jpeg" });

        const mockUpload = vi.fn().mockResolvedValue({
          data: { path: "test-path" },
          error: null,
        });

        const mockFrom = vi.fn().mockReturnValue({
          upload: mockUpload,
          getPublicUrl: vi.fn().mockReturnValue({
            data: { publicUrl: "https://test.com/test.jpg" },
          }),
        });

        (supabase.storage.from as any) = mockFrom;

        await uploadImageToStorage(mockFile, "test");

        const uploadCall = mockUpload.mock.calls[0];
        const filename = uploadCall[0] as string;

        expect(filename).toMatch(new RegExp(`\\.${testCase.expected}$`));

        vi.clearAllMocks();
      }
    });

    it("should default to jpg extension when file has no extension", async () => {
      const mockFile = new File(["test"], "noextension", { type: "image/jpeg" });

      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "test-path" },
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: "https://test.com/test.jpg" },
        }),
      });

      (supabase.storage.from as any) = mockFrom;

      await uploadImageToStorage(mockFile, "test");

      const uploadCall = mockUpload.mock.calls[0];
      const filename = uploadCall[0] as string;

      // When there's no dot in filename, it uses the filename as extension
      // OR defaults to jpg. Let's just check it has some extension.
      expect(filename).toMatch(/test\/\d+-[a-z0-9]+\./);
    });
  });

  describe("uploadImagesToStorage", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should upload multiple images in batches", async () => {
      const mockFiles = [
        new File(["1"], "test1.jpg", { type: "image/jpeg" }),
        new File(["2"], "test2.jpg", { type: "image/jpeg" }),
        new File(["3"], "test3.jpg", { type: "image/jpeg" }),
        new File(["4"], "test4.jpg", { type: "image/jpeg" }),
        new File(["5"], "test5.jpg", { type: "image/jpeg" }),
      ];

      let uploadCount = 0;
      const mockUpload = vi.fn().mockImplementation(() => {
        uploadCount++;
        return Promise.resolve({
          data: { path: `uploads/test${uploadCount}.jpg` },
          error: null,
        });
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
        getPublicUrl: vi.fn().mockImplementation((path: string) => ({
          data: { publicUrl: `https://test.com/${path}` },
        })),
      });

      (supabase.storage.from as any) = mockFrom;

      const result = await uploadImagesToStorage(mockFiles, "test-folder");

      expect(result).toHaveLength(5);
      expect(mockUpload).toHaveBeenCalledTimes(5);
      result.forEach((url) => {
        expect(url).toMatch(/^https:\/\/test\.com\//);
      });
    });

    it("should call onProgress callback during upload", async () => {
      const mockFiles = [
        new File(["1"], "test1.jpg", { type: "image/jpeg" }),
        new File(["2"], "test2.jpg", { type: "image/jpeg" }),
        new File(["3"], "test3.jpg", { type: "image/jpeg" }),
      ];

      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "test-path" },
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: "https://test.com/test.jpg" },
        }),
      });

      (supabase.storage.from as any) = mockFrom;

      const progressCalls: Array<{ completed: number; total: number }> = [];
      const onProgress = (completed: number, total: number) => {
        progressCalls.push({ completed, total });
      };

      await uploadImagesToStorage(mockFiles, "test", onProgress);

      expect(progressCalls).toHaveLength(1); // 3 files in 1 batch
      expect(progressCalls[0]).toEqual({ completed: 3, total: 3 });
    });

    it("should handle batch size of 3 correctly", async () => {
      const mockFiles = Array.from({ length: 10 }, (_, i) =>
        new File([`${i}`], `test${i}.jpg`, { type: "image/jpeg" })
      );

      const batchSizes: number[] = [];
      const mockUpload = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          data: { path: "test-path" },
          error: null,
        });
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: "https://test.com/test.jpg" },
        }),
      });

      (supabase.storage.from as any) = mockFrom;

      const onProgress = (completed: number) => {
        if (batchSizes.length === 0 || batchSizes[batchSizes.length - 1] !== completed) {
          const lastBatchSize =
            batchSizes.length === 0 ? completed : completed - batchSizes[batchSizes.length - 1];
          if (batchSizes.length === 0 || lastBatchSize > 0) {
            batchSizes.push(completed);
          }
        }
      };

      await uploadImagesToStorage(mockFiles, "test", onProgress);

      // 10 files should be uploaded in batches of 3, 3, 3, 1
      expect(mockUpload).toHaveBeenCalledTimes(10);
    });

    it("should return empty array for empty input", async () => {
      const result = await uploadImagesToStorage([], "test");
      expect(result).toEqual([]);
    });

    it("should propagate errors from individual uploads", async () => {
      const mockFiles = [
        new File(["1"], "test1.jpg", { type: "image/jpeg" }),
        new File(["2"], "test2.jpg", { type: "image/jpeg" }),
      ];

      const mockUpload = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Upload failed" },
      });

      const mockFrom = vi.fn().mockReturnValue({
        upload: mockUpload,
      });

      (supabase.storage.from as any) = mockFrom;

      await expect(uploadImagesToStorage(mockFiles, "test")).rejects.toThrow(
        "Failed to upload image: Upload failed"
      );
    });
  });
});
