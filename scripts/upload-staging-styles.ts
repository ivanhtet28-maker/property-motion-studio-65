/**
 * Upload staging style images to Supabase Storage.
 *
 * Usage:
 *   SUPABASE_URL=https://pxhpfewunsetuxygeprp.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npx tsx scripts/upload-staging-styles.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = "staging-styles";
const IMAGE_DIR = path.resolve(__dirname, "../public/images/staging-styles");

const FILES = [
  "modern.jpg",
  "scandinavian.jpg",
  "luxury-modern.jpg",
  "farmhouse.jpg",
  "minimalist.jpg",
  "industrial.jpg",
  "coastal.jpg",
  "artdeco.jpg",
  "boho.jpg",
  "contemporary.jpg",
];

async function main() {
  // Ensure bucket exists (public)
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
  });
  if (bucketError && !bucketError.message.includes("already exists")) {
    throw bucketError;
  }
  console.log(`Bucket "${BUCKET}" ready`);

  for (const file of FILES) {
    const filePath = path.join(IMAGE_DIR, file);
    const fileBuffer = fs.readFileSync(filePath);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(file, fileBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (error) {
      console.error(`Failed to upload ${file}:`, error.message);
    } else {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(file);
      console.log(`Uploaded ${file}: ${data.publicUrl}`);
    }
  }
}

main().catch(console.error);
