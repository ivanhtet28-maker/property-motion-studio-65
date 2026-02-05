/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StitchVideoRequest {
  videoUrls: string[];
  propertyData: {
    address: string;
    price: string;
    beds: number;
    baths: number;
    description?: string;
  };
  audioUrl?: string;
  musicUrl?: string;
  agentInfo?: {
    name: string;
    phone: string;
    email: string;
    photo: string | null;
  };
  videoId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { videoUrls, propertyData, audioUrl, musicUrl, agentInfo, videoId }: StitchVideoRequest = await req.json();

    console.log("Starting video stitching for", videoUrls.length, "clips");

    if (!videoUrls || videoUrls.length < 3 || videoUrls.length > 6) {
      throw new Error("Need 3-6 video clips to stitch");
    }

    // Create temp directory for processing
    const tempDir = await Deno.makeTempDir();
    console.log("Created temp directory:", tempDir);

    try {
      // Step 1: Download all video clips
      console.log("Downloading video clips...");
      const clipPaths: string[] = [];

      for (let i = 0; i < videoUrls.length; i++) {
        const clipPath = `${tempDir}/clip_${i}.mp4`;
        const response = await fetch(videoUrls[i]);

        if (!response.ok) {
          throw new Error(`Failed to download clip ${i + 1}`);
        }

        const buffer = await response.arrayBuffer();
        await Deno.writeFile(clipPath, new Uint8Array(buffer));
        clipPaths.push(clipPath);
        console.log(`Downloaded clip ${i + 1}/${videoUrls.length}`);
      }

      // Step 2: Create FFmpeg concat file
      const concatFilePath = `${tempDir}/concat.txt`;
      const concatContent = clipPaths.map(path => `file '${path}'`).join("\n");
      await Deno.writeTextFile(concatFilePath, concatContent);

      // Step 3: Download audio files if provided
      let audioPath: string | null = null;
      let musicPath: string | null = null;

      if (audioUrl) {
        console.log("Downloading voiceover audio...");
        audioPath = `${tempDir}/voiceover.mp3`;
        const audioResponse = await fetch(audioUrl);
        if (audioResponse.ok) {
          const audioBuffer = await audioResponse.arrayBuffer();
          await Deno.writeFile(audioPath, new Uint8Array(audioBuffer));
        }
      }

      if (musicUrl) {
        console.log("Downloading background music...");
        musicPath = `${tempDir}/music.mp3`;
        const musicResponse = await fetch(musicUrl);
        if (musicResponse.ok) {
          const musicBuffer = await musicResponse.arrayBuffer();
          await Deno.writeFile(musicPath, new Uint8Array(musicBuffer));
        }
      }

      // Step 4: Create text overlay filter for property details
      const overlayText = `${propertyData.address}\\n${propertyData.price}\\n${propertyData.beds} bed | ${propertyData.baths} bath`;

      // Step 5: Build FFmpeg command
      const outputPath = `${tempDir}/final_video.mp4`;
      const ffmpegArgs = [
        "-f", "concat",
        "-safe", "0",
        "-i", concatFilePath,
      ];

      // Add audio inputs
      if (musicPath) {
        ffmpegArgs.push("-i", musicPath);
      }
      if (audioPath) {
        ffmpegArgs.push("-i", audioPath);
      }

      // Build filter complex
      const filters: string[] = [];

      // Text overlay for property details (top)
      filters.push(
        `drawtext=text='${overlayText}':` +
        `fontsize=32:fontcolor=white:` +
        `x=(w-text_w)/2:y=40:` +
        `box=1:boxcolor=black@0.7:boxborderw=10`
      );

      // Agent overlay (bottom) if provided
      if (agentInfo) {
        const agentText = `${agentInfo.name}\\n${agentInfo.phone}${agentInfo.email ? '\\n' + agentInfo.email : ''}`;
        filters.push(
          `drawtext=text='${agentText}':` +
          `fontsize=24:fontcolor=white:` +
          `x=(w-text_w)/2:y=h-120:` +
          `box=1:boxcolor=black@0.8:boxborderw=10`
        );
      }

      // Apply filters
      ffmpegArgs.push("-vf", filters.join(","));

      // Audio mixing
      let audioFilterIndex = 1;
      if (musicPath && audioPath) {
        // Mix music (lower volume) with voiceover
        ffmpegArgs.push(
          "-filter_complex",
          `[1:a]volume=0.2[music];[2:a]volume=1.0[voice];[music][voice]amix=inputs=2:duration=first[aout]`,
          "-map", "0:v",
          "-map", "[aout]"
        );
      } else if (musicPath) {
        ffmpegArgs.push("-map", "0:v", "-map", "1:a", "-filter:a", "volume=0.3");
      } else if (audioPath) {
        ffmpegArgs.push("-map", "0:v", "-map", "1:a");
      } else {
        ffmpegArgs.push("-map", "0:v");
      }

      // Output settings
      ffmpegArgs.push(
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-y",
        outputPath
      );

      console.log("Running FFmpeg with args:", ffmpegArgs.join(" "));

      // Step 6: Execute FFmpeg
      const ffmpegProcess = new Deno.Command("ffmpeg", {
        args: ffmpegArgs,
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stdout, stderr } = await ffmpegProcess.output();

      if (code !== 0) {
        const errorOutput = new TextDecoder().decode(stderr);
        console.error("FFmpeg error:", errorOutput);
        throw new Error(`FFmpeg failed with code ${code}`);
      }

      console.log("FFmpeg completed successfully");

      // Step 7: Upload final video to Supabase Storage
      console.log("Uploading final video to storage...");

      const finalVideo = await Deno.readFile(outputPath);
      const fileName = `video-${videoId || Date.now()}.mp4`;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("video-assets")
        .upload(`videos/${fileName}`, finalVideo, {
          contentType: "video/mp4",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("video-assets")
        .getPublicUrl(`videos/${fileName}`);

      const finalVideoUrl = urlData.publicUrl;
      console.log("Video uploaded successfully:", finalVideoUrl);

      // Get video duration
      const duration = videoUrls.length * 5; // Each Luma clip is 5 seconds

      return new Response(
        JSON.stringify({
          success: true,
          videoUrl: finalVideoUrl,
          fileName: fileName,
          duration: duration,
          clipsStitched: videoUrls.length,
          message: "Video stitched successfully",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      // Cleanup temp directory
      try {
        await Deno.remove(tempDir, { recursive: true });
        console.log("Cleaned up temp directory");
      } catch (err) {
        console.error("Failed to cleanup temp directory:", err);
      }
    }
  } catch (error) {
    console.error("Error stitching video:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to stitch video",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
