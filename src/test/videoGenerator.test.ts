import { describe, it, expect } from "vitest";

/**
 * Tests for video generation logic
 * These test the business logic that would be used in the edge functions
 */

describe("Video Generator Logic", () => {
  describe("Timeline Duration Calculations", () => {
    it("should calculate slideshow duration correctly", () => {
      // Each image shows for 3.5 seconds with 0.5s transitions
      const calculateSlideshowDuration = (imageCount: number): number => {
        if (imageCount === 0) return 0;
        return imageCount * 3.5 - (imageCount - 1) * 0.5;
      };

      expect(calculateSlideshowDuration(5)).toBe(15.5); // 5*3.5 - 4*0.5 = 15.5
      expect(calculateSlideshowDuration(10)).toBe(30.5); // 10*3.5 - 9*0.5 = 30.5
      expect(calculateSlideshowDuration(8)).toBe(24.5); // 8*3.5 - 7*0.5 = 24.5
      expect(calculateSlideshowDuration(1)).toBe(3.5); // Single image
      expect(calculateSlideshowDuration(0)).toBe(0); // No images
    });

    it("should calculate total duration with Luma intro", () => {
      const calculateTotalDuration = (
        imageCount: number,
        hasLumaIntro: boolean
      ): number => {
        const slideshowDuration =
          imageCount * 3.5 - Math.max(0, imageCount - 1) * 0.5;
        const lumaIntroDuration = hasLumaIntro ? 5 : 0;
        return slideshowDuration + lumaIntroDuration;
      };

      expect(calculateTotalDuration(5, false)).toBe(15.5);
      expect(calculateTotalDuration(5, true)).toBe(20.5); // 15.5 + 5
      expect(calculateTotalDuration(10, true)).toBe(35.5); // 30.5 + 5
    });

    it("should calculate clip start times with offset", () => {
      const calculateClipStartTimes = (
        imageCount: number,
        lumaOffset: number
      ): number[] => {
        const startTimes: number[] = [];
        const clipDuration = 3.5;
        const transitionDuration = 0.5;
        for (let i = 0; i < imageCount; i++) {
          const baseStart = i * (clipDuration - transitionDuration);
          startTimes.push(baseStart + lumaOffset);
        }
        return startTimes;
      };

      // Without Luma intro (offset = 0)
      const withoutLuma = calculateClipStartTimes(3, 0);
      expect(withoutLuma).toEqual([0, 3, 6]);

      // With Luma intro (offset = 5)
      const withLuma = calculateClipStartTimes(3, 5);
      expect(withLuma).toEqual([5, 8, 11]);
    });
  });

  describe("Image Validation", () => {
    it("should validate minimum image count", () => {
      const validateImageCount = (count: number): boolean => {
        return count >= 5;
      };

      expect(validateImageCount(5)).toBe(true);
      expect(validateImageCount(10)).toBe(true);
      expect(validateImageCount(4)).toBe(false);
      expect(validateImageCount(0)).toBe(false);
    });

    it("should validate maximum image count", () => {
      const validateImageCount = (count: number): boolean => {
        return count <= 10;
      };

      expect(validateImageCount(10)).toBe(true);
      expect(validateImageCount(8)).toBe(true);
      expect(validateImageCount(11)).toBe(false);
      expect(validateImageCount(20)).toBe(false);
    });

    it("should validate image URLs", () => {
      const validateImageUrl = (url: string): boolean => {
        try {
          new URL(url);
          return url.startsWith("http://") || url.startsWith("https://");
        } catch {
          return false;
        }
      };

      expect(validateImageUrl("https://example.com/image.jpg")).toBe(true);
      expect(validateImageUrl("http://example.com/image.jpg")).toBe(true);
      expect(validateImageUrl("not-a-url")).toBe(false);
      expect(validateImageUrl("")).toBe(false);
    });
  });

  describe("Property Data Formatting", () => {
    it("should format property address correctly", () => {
      const formatAddress = (
        street: string,
        suburb: string,
        state: string
      ): string => {
        return `${street}, ${suburb}, ${state}`;
      };

      expect(formatAddress("123 Main St", "Sydney", "NSW")).toBe(
        "123 Main St, Sydney, NSW"
      );
      expect(formatAddress("456 Park Ave", "Melbourne", "VIC")).toBe(
        "456 Park Ave, Melbourne, VIC"
      );
    });

    it("should format price with currency", () => {
      const formatPrice = (price: string | number): string => {
        const numPrice =
          typeof price === "string" ? parseInt(price.replace(/\D/g, "")) : price;
        return `$${numPrice.toLocaleString()}`;
      };

      expect(formatPrice(500000)).toBe("$500,000");
      expect(formatPrice("750000")).toBe("$750,000");
      expect(formatPrice("$1,200,000")).toBe("$1,200,000");
    });

    it("should format property features as bullet points", () => {
      const formatFeatures = (features: string[]): string => {
        return features.map((f) => `• ${f}`).join("\n");
      };

      expect(formatFeatures(["Pool", "Garden", "Garage"])).toBe(
        "• Pool\n• Garden\n• Garage"
      );
      expect(formatFeatures([])).toBe("");
    });
  });

  describe("Agent Overlay Generation", () => {
    it("should generate agent card HTML", () => {
      const generateAgentCardHTML = (agent: {
        name: string;
        phone: string;
        email?: string;
        photoUrl: string;
      }): string => {
        return `
          <div style="position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);">
            <img src="${agent.photoUrl}" style="width: 60px; height: 60px; border-radius: 50%;" />
            <div>
              <div>${agent.name}</div>
              <div>${agent.phone}</div>
              ${agent.email ? `<div>${agent.email}</div>` : ""}
            </div>
          </div>
        `;
      };

      const html = generateAgentCardHTML({
        name: "John Doe",
        phone: "123-456-7890",
        email: "john@example.com",
        photoUrl: "https://example.com/photo.jpg",
      });

      expect(html).toContain("John Doe");
      expect(html).toContain("123-456-7890");
      expect(html).toContain("john@example.com");
      expect(html).toContain("https://example.com/photo.jpg");
    });

    it("should handle agent card without email", () => {
      const generateAgentCardHTML = (agent: {
        name: string;
        phone: string;
        email?: string;
        photoUrl: string;
      }): string => {
        return `
          <div>
            <div>${agent.name}</div>
            <div>${agent.phone}</div>
            ${agent.email ? `<div>${agent.email}</div>` : ""}
          </div>
        `;
      };

      const html = generateAgentCardHTML({
        name: "Jane Smith",
        phone: "987-654-3210",
        photoUrl: "https://example.com/photo.jpg",
      });

      expect(html).toContain("Jane Smith");
      expect(html).toContain("987-654-3210");
      expect(html).not.toContain("undefined");
    });
  });

  describe("Voice Selection", () => {
    const VOICE_IDS = {
      "australian-male": "TxGEqnHWrfWFTfGW9XjX",
      "british-female": "21m00Tcm4TlvDq8ikWAM",
      "american-male": "VR6AewLTigWG4xSOukaG",
      "american-female": "EXAVITQu4vr4xnSDxMaL",
    };

    it("should map voice names to ElevenLabs voice IDs", () => {
      const getVoiceId = (voiceName: string): string => {
        return (
          VOICE_IDS[voiceName as keyof typeof VOICE_IDS] ||
          VOICE_IDS["australian-male"]
        );
      };

      expect(getVoiceId("australian-male")).toBe("TxGEqnHWrfWFTfGW9XjX");
      expect(getVoiceId("british-female")).toBe("21m00Tcm4TlvDq8ikWAM");
      expect(getVoiceId("american-male")).toBe("VR6AewLTigWG4xSOukaG");
      expect(getVoiceId("american-female")).toBe("EXAVITQu4vr4xnSDxMaL");
    });

    it("should default to australian-male for unknown voice", () => {
      const getVoiceId = (voiceName: string): string => {
        return (
          VOICE_IDS[voiceName as keyof typeof VOICE_IDS] ||
          VOICE_IDS["australian-male"]
        );
      };

      expect(getVoiceId("unknown-voice")).toBe("TxGEqnHWrfWFTfGW9XjX");
      expect(getVoiceId("")).toBe("TxGEqnHWrfWFTfGW9XjX");
    });
  });

  describe("Cost Calculations", () => {
    it("should calculate video generation cost", () => {
      const calculateCost = (options: {
        hasVoice: boolean;
        hasMusic: boolean;
        hasLuma: boolean;
      }): number => {
        let cost = 0.05; // Base Shotstack cost

        if (options.hasVoice) cost += 0.1; // ElevenLabs
        if (options.hasMusic) cost += 0; // Music is free (already uploaded)
        if (options.hasLuma) cost += 0.2; // Luma AI

        cost += 0.01; // OpenAI script generation

        return parseFloat(cost.toFixed(2));
      };

      expect(calculateCost({ hasVoice: false, hasMusic: false, hasLuma: false })).toBe(
        0.06
      );
      expect(
        calculateCost({ hasVoice: true, hasMusic: true, hasLuma: false })
      ).toBe(0.16);
      expect(calculateCost({ hasVoice: true, hasMusic: true, hasLuma: true })).toBe(
        0.36
      );
    });
  });

  describe("Video Status Mapping", () => {
    it("should map Shotstack status to app status", () => {
      const mapShotstackStatus = (
        status: string
      ): "processing" | "completed" | "failed" => {
        if (status === "done") return "completed";
        if (status === "failed") return "failed";
        return "processing";
      };

      expect(mapShotstackStatus("queued")).toBe("processing");
      expect(mapShotstackStatus("fetching")).toBe("processing");
      expect(mapShotstackStatus("rendering")).toBe("processing");
      expect(mapShotstackStatus("saving")).toBe("processing");
      expect(mapShotstackStatus("done")).toBe("completed");
      expect(mapShotstackStatus("failed")).toBe("failed");
    });

    it("should map Luma status to app status", () => {
      const mapLumaStatus = (
        status: string
      ): "processing" | "completed" | "failed" => {
        if (status === "completed") return "completed";
        if (status === "failed") return "failed";
        return "processing";
      };

      expect(mapLumaStatus("pending")).toBe("processing");
      expect(mapLumaStatus("processing")).toBe("processing");
      expect(mapLumaStatus("completed")).toBe("completed");
      expect(mapLumaStatus("failed")).toBe("failed");
    });

    it("should calculate progress percentage", () => {
      const calculateProgress = (
        status: "processing" | "completed" | "failed"
      ): number => {
        if (status === "completed") return 100;
        if (status === "failed") return 0;
        return 50;
      };

      expect(calculateProgress("processing")).toBe(50);
      expect(calculateProgress("completed")).toBe(100);
      expect(calculateProgress("failed")).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("should format error messages for users", () => {
      const formatErrorMessage = (error: string): string => {
        // Remove technical details and provide user-friendly message
        const lowerError = error.toLowerCase();
        if (lowerError.includes("api")) return "Service temporarily unavailable";
        if (lowerError.includes("timeout")) return "Request timed out, please try again";
        if (lowerError.includes("unauthorized"))
          return "Authentication failed, please log in";
        if (lowerError.includes("storage")) return "Failed to upload images";
        return "An error occurred, please try again";
      };

      expect(formatErrorMessage("API error: 500")).toBe(
        "Service temporarily unavailable"
      );
      expect(formatErrorMessage("Request timeout after 30s")).toBe(
        "Request timed out, please try again"
      );
      expect(formatErrorMessage("Unauthorized access")).toBe(
        "Authentication failed, please log in"
      );
      expect(formatErrorMessage("Storage upload failed")).toBe(
        "Failed to upload images"
      );
      expect(formatErrorMessage("Unknown error")).toBe(
        "An error occurred, please try again"
      );
    });
  });

  describe("Script Length Validation", () => {
    it("should validate script length for voiceover", () => {
      const validateScriptLength = (script: string): {
        valid: boolean;
        wordCount: number;
        estimatedDuration: number;
      } => {
        const wordCount = script.trim().split(/\s+/).length;
        const estimatedDuration = (wordCount / 150) * 60; // 150 words per minute

        return {
          valid: wordCount >= 50 && wordCount <= 400,
          wordCount,
          estimatedDuration: Math.round(estimatedDuration),
        };
      };

      const shortScript = "This is too short.";
      const validScript =
        "This beautiful property features stunning architecture and modern amenities. " +
        "With spacious living areas, gourmet kitchen, and luxurious master suite, " +
        "it offers the perfect combination of style and comfort. " +
        "Located in a prime neighborhood with excellent schools and shopping nearby. " +
        "Schedule your viewing today and experience luxury living at its finest. " +
        "Contact us now to arrange a private inspection. " +
        "Don't miss this incredible opportunity to own your dream home. " +
        "This property won't last long in the current market.";
      const longScript = "word ".repeat(500);

      expect(validateScriptLength(shortScript).valid).toBe(false);
      expect(validateScriptLength(validScript).valid).toBe(true);
      expect(validateScriptLength(longScript).valid).toBe(false);

      const validResult = validateScriptLength(validScript);
      expect(validResult.wordCount).toBeGreaterThan(50);
      expect(validResult.estimatedDuration).toBeGreaterThan(10);
    });
  });
});
