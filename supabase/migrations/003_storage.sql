-- Storage buckets and policies
-- Create buckets in Supabase Dashboard if this fails:
--   references (public)
--   model-clips (public)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('references', 'references', true, 52428800, ARRAY['audio/mpeg','audio/wav','audio/mp4','audio/aac','audio/ogg','audio/webm']),
  ('model-clips', 'model-clips', true, 52428800, ARRAY['audio/mpeg','audio/wav','audio/mp4','audio/aac','audio/ogg','audio/webm'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read references bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'references');

CREATE POLICY "public read model-clips bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'model-clips');

CREATE POLICY "admin upload references"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'references' AND is_admin());

CREATE POLICY "admin update references"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'references' AND is_admin());

CREATE POLICY "admin delete references"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'references' AND is_admin());

CREATE POLICY "admin upload model-clips"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'model-clips' AND is_admin());

CREATE POLICY "admin update model-clips"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'model-clips' AND is_admin());

CREATE POLICY "admin delete model-clips"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'model-clips' AND is_admin());
