-- ============================================
-- SUPABASE STORAGE BUCKET (Dosya Yükleme için)
-- ============================================

-- Attachments bucket oluştur
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'attachments',
    'attachments',
    TRUE, -- Public erişim
    52428800, -- 50MB limit
    ARRAY[
        'image/jpeg', 
        'image/png', 
        'image/gif', 
        'image/webp',
        'image/svg+xml',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'application/zip',
        'application/x-rar-compressed',
        'video/mp4',
        'video/webm',
        'audio/mpeg',
        'audio/wav'
    ]
) ON CONFLICT (id) DO NOTHING;

-- Avatar bucket oluştur
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'avatars',
    'avatars',
    TRUE,
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Cover images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'covers',
    'covers',
    TRUE,
    10485760, -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STORAGE POLİCYLER
-- ============================================

-- Attachments bucket policies
CREATE POLICY "Attachments are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'attachments');

CREATE POLICY "Anyone can upload attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Anyone can delete attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'attachments');

-- Avatars bucket policies
CREATE POLICY "Avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can update avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can delete avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars');

-- Covers bucket policies
CREATE POLICY "Covers are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'covers');

CREATE POLICY "Anyone can upload covers"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'covers');

CREATE POLICY "Anyone can delete covers"
ON storage.objects FOR DELETE
USING (bucket_id = 'covers');
