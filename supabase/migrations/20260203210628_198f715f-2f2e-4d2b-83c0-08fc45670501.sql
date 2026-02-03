-- Create storage bucket for property images
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-images');

-- Allow public read access to images
CREATE POLICY "Public can view property images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'property-images');

-- Allow users to delete their own uploads
CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'property-images' AND auth.uid()::text = (storage.foldername(name))[1]);