
-- ============================================================
-- 6. VARSAYILAN VERİLER (workspace + kategoriler + etiketler)
-- ============================================================

INSERT INTO workspaces (id, name, description, icon, color, is_default, settings)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Ana Workspace',
    'Tüm ekibin kullandığı ana çalışma alanı',
    '🏢',
    '#6366F1',
    TRUE,
    '{"allowGuestAccess": false, "defaultView": "board"}'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, workspace_id, name, description, icon, color, position, wip_limit) VALUES
    ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'Bekleyen',    'Henüz başlanmamış görevler',          '📋', '#94A3B8', 1, NULL),
    ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'Devam Eden',  'Üzerinde çalışılan görevler',          '🔄', '#3B82F6', 2, 5),
    ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'İncelemede',  'Gözden geçirilmesi gereken görevler',  '👀', '#F59E0B', 3, 3),
    ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'Tamamlandı',  'Bitmiş görevler',                      '✅', '#10B981', 4, NULL),
    ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'Arşiv',       'Arşivlenmiş görevler',                 '📦', '#6B7280', 5, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO labels (id, workspace_id, name, color, description) VALUES
    ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001', 'Bug',           '#EF4444', 'Hata düzeltme'),
    ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001', 'Feature',       '#10B981', 'Yeni özellik'),
    ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001', 'Enhancement',   '#3B82F6', 'İyileştirme'),
    ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000001', 'Documentation', '#8B5CF6', 'Dokümantasyon'),
    ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000001', 'Design',        '#EC4899', 'Tasarım'),
    ('00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0000-000000000001', 'Urgent',        '#DC2626', 'Acil'),
    ('00000000-0000-0000-0002-000000000007', '00000000-0000-0000-0000-000000000001', 'Backend',       '#059669', 'Backend geliştirme'),
    ('00000000-0000-0000-0002-000000000008', '00000000-0000-0000-0000-000000000001', 'Frontend',      '#2563EB', 'Frontend geliştirme'),
    ('00000000-0000-0000-0002-000000000009', '00000000-0000-0000-0000-000000000001', 'Testing',       '#7C3AED', 'Test'),
    ('00000000-0000-0000-0002-000000000010', '00000000-0000-0000-0000-000000000001', 'DevOps',        '#0891B2', 'DevOps işleri')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_members;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE todos;
ALTER PUBLICATION supabase_realtime ADD TABLE todo_assignees;
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_items;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

-- ============================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select" ON users FOR SELECT USING (true);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "users_update" ON users FOR UPDATE USING (true);

CREATE POLICY "workspaces_select" ON workspaces FOR SELECT USING (true);
CREATE POLICY "workspaces_insert" ON workspaces FOR INSERT WITH CHECK (true);
CREATE POLICY "workspaces_update" ON workspaces FOR UPDATE USING (true);

CREATE POLICY "workspace_members_select" ON workspace_members FOR SELECT USING (true);
CREATE POLICY "workspace_members_insert" ON workspace_members FOR INSERT WITH CHECK (true);
CREATE POLICY "workspace_members_update" ON workspace_members FOR UPDATE USING (true);
CREATE POLICY "workspace_members_delete" ON workspace_members FOR DELETE USING (true);

CREATE POLICY "categories_select" ON categories FOR SELECT USING (true);
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "categories_update" ON categories FOR UPDATE USING (true);
CREATE POLICY "categories_delete" ON categories FOR DELETE USING (true);

CREATE POLICY "todos_select" ON todos FOR SELECT USING (true);
CREATE POLICY "todos_insert" ON todos FOR INSERT WITH CHECK (true);
CREATE POLICY "todos_update" ON todos FOR UPDATE USING (true);
CREATE POLICY "todos_delete" ON todos FOR DELETE USING (true);

CREATE POLICY "todo_assignees_select" ON todo_assignees FOR SELECT USING (true);
CREATE POLICY "todo_assignees_insert" ON todo_assignees FOR INSERT WITH CHECK (true);
CREATE POLICY "todo_assignees_delete" ON todo_assignees FOR DELETE USING (true);

CREATE POLICY "todo_labels_select" ON todo_labels FOR SELECT USING (true);
CREATE POLICY "todo_labels_insert" ON todo_labels FOR INSERT WITH CHECK (true);
CREATE POLICY "todo_labels_delete" ON todo_labels FOR DELETE USING (true);

CREATE POLICY "labels_select" ON labels FOR SELECT USING (true);
CREATE POLICY "labels_insert" ON labels FOR INSERT WITH CHECK (true);
CREATE POLICY "labels_update" ON labels FOR UPDATE USING (true);
CREATE POLICY "labels_delete" ON labels FOR DELETE USING (true);

CREATE POLICY "checklist_items_select" ON checklist_items FOR SELECT USING (true);
CREATE POLICY "checklist_items_insert" ON checklist_items FOR INSERT WITH CHECK (true);
CREATE POLICY "checklist_items_update" ON checklist_items FOR UPDATE USING (true);
CREATE POLICY "checklist_items_delete" ON checklist_items FOR DELETE USING (true);

CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "comments_update" ON comments FOR UPDATE USING (true);
CREATE POLICY "comments_delete" ON comments FOR DELETE USING (true);

CREATE POLICY "attachments_select" ON attachments FOR SELECT USING (true);
CREATE POLICY "attachments_insert" ON attachments FOR INSERT WITH CHECK (true);
CREATE POLICY "attachments_delete" ON attachments FOR DELETE USING (true);

CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (true);
CREATE POLICY "notifications_insert" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (true);

CREATE POLICY "activity_logs_select" ON activity_logs FOR SELECT USING (true);
CREATE POLICY "activity_logs_insert" ON activity_logs FOR INSERT WITH CHECK (true);

-- ============================================================
-- 9. STORAGE BUCKETS
-- ============================================================

-- Drop existing storage policies to avoid duplicate errors
DROP POLICY IF EXISTS "attachments_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "attachments_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "attachments_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "avatars_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "avatars_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "covers_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "covers_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "covers_storage_delete" ON storage.objects;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('attachments', 'attachments', TRUE, 52428800,
    ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf',
          'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain','text/csv','application/zip','video/mp4','audio/mpeg'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', TRUE, 5242880, ARRAY['image/jpeg','image/png','image/gif','image/webp'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('covers', 'covers', TRUE, 10485760, ARRAY['image/jpeg','image/png','image/gif','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "attachments_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'attachments');
CREATE POLICY "attachments_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attachments');
CREATE POLICY "attachments_storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'attachments');

CREATE POLICY "avatars_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "avatars_storage_update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');
CREATE POLICY "avatars_storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars');

CREATE POLICY "covers_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'covers');
CREATE POLICY "covers_storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'covers');
CREATE POLICY "covers_storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'covers');

-- ============================================================
-- 10. EK OTOMATIK SİLME (5 gün sonra)
-- ============================================================

-- Storage'dan eski ekleri silen fonksiyon
CREATE OR REPLACE FUNCTION cleanup_old_attachments()
RETURNS void AS $$
DECLARE
    att RECORD;
    storage_path TEXT;
BEGIN
    -- 5 günden eski ekleri bul
    FOR att IN 
        SELECT id, file_url, todo_id
        FROM attachments 
        WHERE created_at < NOW() - INTERVAL '5 days'
    LOOP
        -- Storage path'i URL'den çıkar
        -- URL format: https://xxx.supabase.co/storage/v1/object/public/attachments/PATH
        storage_path := regexp_replace(
            att.file_url,
            '^.*/storage/v1/object/public/attachments/',
            ''
        );
        
        -- Storage'dan sil (Supabase storage API via http extension)
        -- Not: Bu fonksiyon sadece DB kaydını siler, storage dosyası Edge Function ile silinmeli
        DELETE FROM attachments WHERE id = att.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- pg_cron ile her gün gece yarısı çalıştır (eğer pg_cron aktifse)
-- Supabase'de pg_cron varsayılan olarak aktiftir
-- pg_cron scheduling skipped


-- ============================================================
-- 9. LICENSE SYSTEM
-- ============================================================
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_key VARCHAR(20) NOT NULL UNIQUE,
    is_used BOOLEAN DEFAULT FALSE,
    is_revoked BOOLEAN DEFAULT FALSE,
    used_by_name VARCHAR(100),
    computer_name VARCHAR(200),
    ip_address VARCHAR(45),
    activated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);

-- RLS for licenses
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "licenses_select" ON licenses FOR SELECT USING (true);
CREATE POLICY "licenses_insert" ON licenses FOR INSERT WITH CHECK (true);
CREATE POLICY "licenses_update" ON licenses FOR UPDATE USING (true);
CREATE POLICY "licenses_delete" ON licenses FOR DELETE USING (true);
