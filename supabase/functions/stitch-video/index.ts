/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

interface StitchVideoRequest {
  videoUrls: string[];
  propertyData: {
    address: string;
    price: string;
    beds: number;
    baths: number;
    carSpaces?: number;
    landSize?: string;
    features?: string[];
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

    if (!videoUrls || videoUrls.length === 0) {
      throw new Error("No video URLs provided for stitching");
    }

    console.log("=== SHOTSTACK VIDEO STITCHING ===");
    console.log("Stitching", videoUrls.length, "Luma AI clips");

    // Calculate total duration (5 seconds per Luma clip)
    const totalDuration = videoUrls.length * 5;

    // Build video track with all Luma clips in sequence
    const videoClips = videoUrls.map((url, index) => ({
      asset: {
        type: "video",
        src: url,
      },
      start: index * 5, // Each clip is 5 seconds
      length: 5,
      transition: index > 0 ? {
        in: "fade",
        out: "fade",
      } : undefined,
    }));

    // Build Shotstack edit
    const edit = {
      timeline: {
        soundtrack: musicUrl ? {
          src: musicUrl,
          effect: "fadeInFadeOut",
          volume: 0.3, // Background music at 30% volume
        } : undefined,
        tracks: [
          // Voiceover track (if available)
          ...(audioUrl ? [{
            clips: [
              {
                asset: {
                  type: "audio",
                  src: audioUrl,
                  volume: 1.0, // Full volume for voiceover
                },
                start: 0,
                length: totalDuration,
              },
            ],
          }] : []),

          // Property details overlay (first 5 seconds only)
          {
            clips: [
              {
                asset: {
                  type: "html",
                  html: `
                    <div style="
                      position: absolute;
                      top: 50%;
                      left: 50%;
                      transform: translate(-50%, -50%);
                      background: rgba(0, 0, 0, 0.85);
                      backdrop-filter: blur(20px);
                      border-radius: 16px;
                      padding: 50px 60px;
                      text-align: center;
                      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
                      border: 1px solid rgba(255, 255, 255, 0.1);
                      max-width: 850px;
                    ">
                      <div style="color: white; font-family: 'Helvetica Neue', Arial, sans-serif;">
                        <!-- Property Address -->
                        <div style="
                          font-size: 32px;
                          font-weight: 300;
                          letter-spacing: 0.5px;
                          margin-bottom: 15px;
                          line-height: 1.4;
                          text-transform: uppercase;
                          opacity: 0.95;
                        ">
                          ${propertyData.address}
                        </div>

                        <!-- Divider Line -->
                        <div style="
                          width: 60px;
                          height: 2px;
                          background: white;
                          margin: 20px auto;
                          opacity: 0.3;
                        "></div>

                        <!-- Price -->
                        ${propertyData.price ? `
                          <div style="
                            font-size: 38px;
                            font-weight: 600;
                            letter-spacing: 1px;
                            margin-bottom: 30px;
                            color: white;
                          ">
                            ${propertyData.price}
                          </div>
                        ` : ''}

                        <!-- Property Stats Grid -->
                        <div style="
                          display: flex;
                          justify-content: center;
                          gap: 40px;
                          margin-top: 30px;
                          flex-wrap: wrap;
                        ">
                          <!-- Bedrooms -->
                          <div style="text-align: center;">
                            <div style="
                              font-size: 36px;
                              font-weight: 300;
                              margin-bottom: 8px;
                            ">
                              ${propertyData.beds}
                            </div>
                            <div style="
                              font-size: 11px;
                              text-transform: uppercase;
                              letter-spacing: 2px;
                              opacity: 0.6;
                              font-weight: 500;
                            ">
                              Bedrooms
                            </div>
                          </div>

                          <!-- Bathrooms -->
                          <div style="text-align: center;">
                            <div style="
                              font-size: 36px;
                              font-weight: 300;
                              margin-bottom: 8px;
                            ">
                              ${propertyData.baths}
                            </div>
                            <div style="
                              font-size: 11px;
                              text-transform: uppercase;
                              letter-spacing: 2px;
                              opacity: 0.6;
                              font-weight: 500;
                            ">
                              Bathrooms
                            </div>
                          </div>

                          <!-- Car Spaces -->
                          ${propertyData.carSpaces ? `
                            <div style="text-align: center;">
                              <div style="
                                font-size: 36px;
                                font-weight: 300;
                                margin-bottom: 8px;
                              ">
                                ${propertyData.carSpaces}
                              </div>
                              <div style="
                                font-size: 11px;
                                text-transform: uppercase;
                                letter-spacing: 2px;
                                opacity: 0.6;
                                font-weight: 500;
                              ">
                                Parking
                              </div>
                            </div>
                          ` : ''}

                          <!-- Land Size -->
                          ${propertyData.landSize ? `
                            <div style="text-align: center;">
                              <div style="
                                font-size: 36px;
                                font-weight: 300;
                                margin-bottom: 8px;
                              ">
                                ${propertyData.landSize}
                              </div>
                              <div style="
                                font-size: 11px;
                                text-transform: uppercase;
                                letter-spacing: 2px;
                                opacity: 0.6;
                                font-weight: 500;
                              ">
                                Square Meters
                              </div>
                            </div>
                          ` : ''}
                        </div>

                        <!-- Property Features (Top 3) -->
                        ${propertyData.features && propertyData.features.length > 0 ? `
                          <div style="
                            margin-top: 35px;
                            display: flex;
                            justify-content: center;
                            gap: 20px;
                            flex-wrap: wrap;
                          ">
                            ${propertyData.features.slice(0, 3).map(feature => `
                              <div style="
                                padding: 10px 20px;
                                font-size: 11px;
                                text-transform: uppercase;
                                letter-spacing: 1.5px;
                                font-weight: 500;
                                opacity: 0.7;
                                border-bottom: 1px solid rgba(255, 255, 255, 0.3);
                              ">
                                ${feature}
                              </div>
                            `).join('')}
                          </div>
                        ` : ''}
                      </div>
                    </div>
                  `,
                  css: "",
                  width: 1080,
                  height: 1920,
                },
                start: 0,
                length: 5, // Only show for first 5 seconds (first clip)
                transition: {
                  in: "fade",
                  out: "fade",
                },
              },
            ],
          },

          // Agent overlay track (if available)
          ...(agentInfo && agentInfo.name ? [{
            clips: [
              {
                asset: {
                  type: "html",
                  html: `
                    <div style="
                      position: absolute;
                      bottom: 40px;
                      left: 50%;
                      transform: translateX(-50%);
                      background: rgba(0, 0, 0, 0.85);
                      backdrop-filter: blur(10px);
                      border-radius: 20px;
                      padding: 15px 25px;
                      display: flex;
                      align-items: center;
                      gap: 15px;
                      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                      border: 1px solid rgba(255, 255, 255, 0.1);
                    ">
                      ${agentInfo.photo ? `
                        <img
                          src="${agentInfo.photo}"
                          style="
                            width: 60px;
                            height: 60px;
                            border-radius: 50%;
                            border: 2px solid white;
                            object-fit: cover;
                          "
                        />
                      ` : ''}
                      <div style="color: white; font-family: Arial, sans-serif;">
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 3px;">
                          ${agentInfo.name}
                        </div>
                        ${agentInfo.phone ? `
                          <div style="font-size: 14px; opacity: 0.9;">
                            ${agentInfo.phone}
                          </div>
                        ` : ''}
                        ${agentInfo.email ? `
                          <div style="font-size: 12px; opacity: 0.7; margin-top: 2px;">
                            ${agentInfo.email}
                          </div>
                        ` : ''}
                      </div>
                    </div>
                  `,
                  css: "",
                  width: 1080,
                  height: 1920,
                },
                start: 0,
                length: totalDuration,
                position: "bottom",
              },
            ],
          }] : []),

          // Video track with all Luma clips
          {
            clips: videoClips,
          },
        ],
      },
      output: {
        format: "mp4",
        resolution: "hd",
        aspectRatio: "9:16",
      },
    };

    console.log("Sending stitch job to Shotstack...");

    // Submit to Shotstack
    const response = await fetch("https://api.shotstack.io/v1/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SHOTSTACK_API_KEY!,
      },
      body: JSON.stringify(edit),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shotstack API error: ${error}`);
    }

    const data = await response.json();
    const jobId = data.response?.id;

    if (!jobId) {
      throw new Error("No job ID returned from Shotstack");
    }

    console.log("Shotstack stitch job started:", jobId);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: jobId,
        message: "Video stitching started with Shotstack",
        estimatedTime: 60, // ~60 seconds for stitching
        totalClips: videoUrls.length,
        duration: totalDuration,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
