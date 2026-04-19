-- ============================================================

CREATE OR REPLACE FUNCTION login_or_register(p_name VARCHAR(100))
RETURNS TABLE (user_id UUID, user_name VARCHAR(100), is_new_user BOOLEAN) AS $$
DECLARE
    v_user_id UUID;
    v_is_new BOOLEAN := FALSE;
BEGIN
    SELECT id INTO v_user_id FROM users WHERE LOWER(name) = LOWER(p_name);
    IF v_user_id IS NULL THEN
        INSERT INTO users (name, color)
        VALUES (p_name, '#' || LPAD(TO_HEX((RANDOM() * 16777215)::INT), 6, '0'))
        RETURNING id INTO v_user_id;
        v_is_new := TRUE;
        INSERT INTO workspace_members (workspace_id, user_id, role)
        SELECT id, v_user_id, 'member' FROM workspaces WHERE is_default = TRUE;
    END IF;
    UPDATE users SET last_seen = NOW(), status = 'online' WHERE id = v_user_id;
    RETURN QUERY SELECT v_user_id, (SELECT name FROM users WHERE id = v_user_id), v_is_new;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_todo(
    p_workspace_id UUID, p_category_id UUID, p_title VARCHAR(500),
    p_description TEXT DEFAULT NULL, p_priority VARCHAR(20) DEFAULT 'medium',
    p_due_date TIMESTAMPTZ DEFAULT NULL, p_assignee_ids UUID[] DEFAULT '{}',
    p_label_ids UUID[] DEFAULT '{}', p_parent_id UUID DEFAULT NULL, p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_todo_id UUID;
    v_assignee_id UUID;
    v_label_id UUID;
BEGIN
    INSERT INTO todos (workspace_id, category_id, parent_id, title, description, priority, due_date, created_by)
    VALUES (p_workspace_id, p_category_id, p_parent_id, p_title, p_description, p_priority, p_due_date, p_created_by)
    RETURNING id INTO v_todo_id;
    FOREACH v_assignee_id IN ARRAY p_assignee_ids LOOP
        INSERT INTO todo_assignees (todo_id, user_id, assigned_by) VALUES (v_todo_id, v_assignee_id, p_created_by);
    END LOOP;
    FOREACH v_label_id IN ARRAY p_label_ids LOOP
        INSERT INTO todo_labels (todo_id, label_id) VALUES (v_todo_id, v_label_id);
    END LOOP;
    RETURN v_todo_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION move_todo(p_todo_id UUID, p_new_category_id UUID, p_new_position INTEGER DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE v_max_position INTEGER;
BEGIN
    IF p_new_position IS NULL THEN
        SELECT COALESCE(MAX(position), 0) + 1 INTO v_max_position FROM todos WHERE category_id = p_new_category_id;
        p_new_position := v_max_position;
    END IF;
    UPDATE todos SET category_id = p_new_category_id, position = p_new_position WHERE id = p_todo_id;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_checklist_items(p_todo_id UUID, p_items TEXT[])
RETURNS INTEGER AS $$
DECLARE v_item TEXT; v_count INTEGER := 0;
BEGIN
    FOREACH v_item IN ARRAY p_items LOOP
        INSERT INTO checklist_items (todo_id, content) VALUES (p_todo_id, v_item);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_workspace_todos(
    p_workspace_id UUID, p_category_id UUID DEFAULT NULL, p_status VARCHAR(30) DEFAULT NULL,
    p_assignee_id UUID DEFAULT NULL, p_search_term TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID, category_id UUID, category_name VARCHAR(100), title VARCHAR(500), todo_description TEXT,
    todo_status VARCHAR(30), todo_priority VARCHAR(20), due_date TIMESTAMPTZ, todo_position INTEGER,
    created_at TIMESTAMPTZ, subtask_count BIGINT, completed_subtask_count BIGINT,
    checklist_count BIGINT, completed_checklist_count BIGINT, comment_count BIGINT, attachment_count BIGINT,
    assignees JSON, labels JSON, created_by_name VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT t.id, t.category_id, c.name, t.title, t.description, t.status, t.priority, t.due_date,
        t.position, t.created_at,
        (SELECT COUNT(*) FROM todos st WHERE st.parent_id = t.id),
        (SELECT COUNT(*) FROM todos st WHERE st.parent_id = t.id AND st.status = 'done'),
        (SELECT COUNT(*) FROM checklist_items ci WHERE ci.todo_id = t.id),
        (SELECT COUNT(*) FROM checklist_items ci WHERE ci.todo_id = t.id AND ci.is_completed = TRUE),
        (SELECT COUNT(*) FROM comments cm WHERE cm.todo_id = t.id),
        (SELECT COUNT(*) FROM attachments a WHERE a.todo_id = t.id),
        (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url, 'color', u.color))
         FROM todo_assignees ta JOIN users u ON ta.user_id = u.id WHERE ta.todo_id = t.id),
        (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
         FROM todo_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.todo_id = t.id),
        u.name
    FROM todos t JOIN categories c ON t.category_id = c.id LEFT JOIN users u ON t.created_by = u.id
    WHERE t.workspace_id = p_workspace_id AND t.parent_id IS NULL
      AND (p_category_id IS NULL OR t.category_id = p_category_id)
      AND (p_status IS NULL OR t.status = p_status)
      AND (p_assignee_id IS NULL OR EXISTS (SELECT 1 FROM todo_assignees ta WHERE ta.todo_id = t.id AND ta.user_id = p_assignee_id))
      AND (p_search_term IS NULL OR t.title ILIKE '%' || p_search_term || '%' OR t.description ILIKE '%' || p_search_term || '%')
    ORDER BY c.position, t.position;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_todo_detail(p_todo_id UUID)
RETURNS JSON AS $$
DECLARE v_result JSON;
BEGIN
SELECT json_build_object(
        'id', t.id, 'workspace_id', t.workspace_id, 'category_id', t.category_id,
        'category_name', c.name, 'parent_id', t.parent_id, 'title', t.title,
        'description', t.description, 'status', t.status, 'priority', t.priority,
        'due_date', t.due_date, 'start_date', t.start_date, 'completed_at', t.completed_at,
        'position', t.position,
        'created_at', t.created_at, 'updated_at', t.updated_at,
        'created_by', json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url),
        'assignees', (SELECT COALESCE(json_agg(json_build_object('id', au.id, 'name', au.name, 'avatar_url', au.avatar_url, 'color', au.color)), '[]')
            FROM todo_assignees ta JOIN users au ON ta.user_id = au.id WHERE ta.todo_id = t.id),
        'labels', (SELECT COALESCE(json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color)), '[]')
            FROM todo_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.todo_id = t.id),
        'checklist_items', (SELECT COALESCE(json_agg(json_build_object('id', ci.id, 'content', ci.content, 'is_completed', ci.is_completed, 'position', ci.position) ORDER BY ci.position), '[]')
            FROM checklist_items ci WHERE ci.todo_id = t.id),
        'subtasks', (SELECT COALESCE(json_agg(json_build_object('id', st.id, 'title', st.title, 'status', st.status, 'priority', st.priority) ORDER BY st.position), '[]')
            FROM todos st WHERE st.parent_id = t.id),
        'attachments', (SELECT COALESCE(json_agg(json_build_object('id', a.id, 'file_name', a.file_name, 'file_type', a.file_type, 'file_size', a.file_size, 'file_url', a.file_url)), '[]')
            FROM attachments a WHERE a.todo_id = t.id AND a.comment_id IS NULL)
    ) INTO v_result
    FROM todos t JOIN categories c ON t.category_id = c.id LEFT JOIN users u ON t.created_by = u.id
    WHERE t.id = p_todo_id;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_comment(p_todo_id UUID, p_content TEXT, p_parent_id UUID DEFAULT NULL, p_created_by UUID DEFAULT NULL)
RETURNS UUID AS $$
DECLARE v_comment_id UUID;
BEGIN
    INSERT INTO comments (todo_id, parent_id, content, created_by)
    VALUES (p_todo_id, p_parent_id, p_content, p_created_by)
    RETURNING id INTO v_comment_id;
    RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_todo_comments(p_todo_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(json_build_object(
            'id', c.id, 'parent_id', c.parent_id, 'content', c.content,
            'is_edited', c.is_edited, 'created_at', c.created_at,
            'created_by', json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url, 'color', u.color),
            'replies', (SELECT COALESCE(json_agg(json_build_object('id', r.id, 'content', r.content, 'created_at', r.created_at,
                'created_by', json_build_object('id', ru.id, 'name', ru.name)) ORDER BY r.created_at), '[]')
                FROM comments r LEFT JOIN users ru ON r.created_by = ru.id WHERE r.parent_id = c.id)
        ) ORDER BY c.created_at), '[]')
        FROM comments c LEFT JOIN users u ON c.created_by = u.id
        WHERE c.todo_id = p_todo_id AND c.parent_id IS NULL
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_categories(p_workspace_id UUID, p_category_ids UUID[])
RETURNS BOOLEAN AS $$
DECLARE v_position INTEGER := 1; v_category_id UUID;
BEGIN
    FOREACH v_category_id IN ARRAY p_category_ids LOOP
        UPDATE categories SET position = v_position WHERE id = v_category_id AND workspace_id = p_workspace_id;
        v_position := v_position + 1;
    END LOOP;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_todos(p_category_id UUID, p_todo_ids UUID[])
RETURNS BOOLEAN AS $$
DECLARE v_position INTEGER := 1; v_todo_id UUID;
BEGIN
    FOREACH v_todo_id IN ARRAY p_todo_ids LOOP
        UPDATE todos SET position = v_position WHERE id = v_todo_id AND category_id = p_category_id;
        v_position := v_position + 1;
    END LOOP;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_notifications(p_user_id UUID, p_unread_only BOOLEAN DEFAULT FALSE, p_limit INTEGER DEFAULT 50)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(json_build_object(
            'id', n.id, 'type', n.type, 'title', n.title, 'message', n.message,
            'is_read', n.is_read, 'created_at', n.created_at,
            'related_todo', CASE WHEN n.related_todo_id IS NOT NULL THEN json_build_object('id', t.id, 'title', t.title) ELSE NULL END,
            'related_user', CASE WHEN n.related_user_id IS NOT NULL THEN json_build_object('id', u.id, 'name', u.name) ELSE NULL END
        ) ORDER BY n.created_at DESC), '[]')
        FROM notifications n
        LEFT JOIN todos t ON n.related_todo_id = t.id
        LEFT JOIN users u ON n.related_user_id = u.id
        WHERE n.user_id = p_user_id AND (NOT p_unread_only OR n.is_read = FALSE)
        LIMIT p_limit
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_notifications_read(p_user_id UUID, p_notification_ids UUID[] DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
    IF p_notification_ids IS NULL THEN
        UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = p_user_id AND is_read = FALSE;
    ELSE
        UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ANY(p_notification_ids) AND user_id = p_user_id;
    END IF;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_activity_feed(p_workspace_id UUID, p_todo_id UUID DEFAULT NULL, p_user_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 50)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(json_build_object(
            'id', al.id, 'action', al.action, 'entity_type', al.entity_type,
            'old_values', al.old_values, 'new_values', al.new_values, 'created_at', al.created_at,
            'user', CASE WHEN al.user_id IS NOT NULL THEN json_build_object('id', u.id, 'name', u.name) ELSE NULL END,
            'todo', CASE WHEN al.todo_id IS NOT NULL THEN json_build_object('id', t.id, 'title', t.title) ELSE NULL END
        ) ORDER BY al.created_at DESC), '[]')
        FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id LEFT JOIN todos t ON al.todo_id = t.id
        WHERE al.workspace_id = p_workspace_id
          AND (p_todo_id IS NULL OR al.todo_id = p_todo_id)
          AND (p_user_id IS NULL OR al.user_id = p_user_id)
        LIMIT p_limit
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_workspace_members(p_workspace_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(json_build_object(
            'id', u.id, 'name', u.name, 'avatar_url', u.avatar_url, 'color', u.color,
            'status', u.status, 'role', wm.role, 'joined_at', wm.joined_at, 'last_seen', u.last_seen
        ) ORDER BY CASE wm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.name), '[]')
        FROM workspace_members wm JOIN users u ON wm.user_id = u.id
        WHERE wm.workspace_id = p_workspace_id
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_workspace_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSON AS $$
BEGIN
RETURN json_build_object(
        'total_todos', (SELECT COUNT(*) FROM todos WHERE workspace_id = p_workspace_id AND parent_id IS NULL),
        'completed_todos', (SELECT COUNT(*) FROM todos WHERE workspace_id = p_workspace_id AND status = 'done' AND parent_id IS NULL),
        'overdue_todos', (SELECT COUNT(*) FROM todos WHERE workspace_id = p_workspace_id AND status != 'done' AND due_date < NOW() AND parent_id IS NULL),
        'due_today', (SELECT COUNT(*) FROM todos WHERE workspace_id = p_workspace_id AND status != 'done' AND due_date::DATE = CURRENT_DATE AND parent_id IS NULL),
        'by_category', (SELECT json_agg(json_build_object('category_id', c.id, 'category_name', c.name, 'category_color', c.color,
            'count', (SELECT COUNT(*) FROM todos t WHERE t.category_id = c.id AND t.parent_id IS NULL)))
            FROM categories c WHERE c.workspace_id = p_workspace_id ORDER BY c.position),
        'my_assigned', CASE WHEN p_user_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM todo_assignees ta JOIN todos t ON ta.todo_id = t.id
            WHERE ta.user_id = p_user_id AND t.workspace_id = p_workspace_id AND t.status != 'done'
        ) ELSE 0 END
    );
END;
$$ LANGUAGE plpgsql;

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
-- PATCH: Trigger güncelleme (mevcut DB'lerde de çalışır)
-- init.sql her çalıştırıldığında bu fonksiyon güncellenir.
-- ============================================================

-- Eksik kolonları mevcut DB'ye ekle (idempotent)
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 days');
ALTER TABLE categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Atama bildirim fonksiyonu güncelleme
CREATE OR REPLACE FUNCTION create_assignment_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_todo_title TEXT;
    v_assigner_name TEXT;
    v_notification_title TEXT;
    v_notification_message TEXT;
BEGIN
    SELECT title INTO v_todo_title FROM todos WHERE id = NEW.todo_id;

    IF NEW.assigned_by IS NOT NULL AND NEW.user_id != NEW.assigned_by THEN
        SELECT COALESCE(name, 'Biri') INTO v_assigner_name FROM users WHERE id = NEW.assigned_by;
        v_notification_title := COALESCE(v_assigner_name, 'Biri') || ' sizi "' || COALESCE(v_todo_title, 'bir gorev') || '" gorevine dahil etti';
        v_notification_message := COALESCE(v_assigner_name, 'Biri') || ' tarafindan atandiniz';
    ELSIF NEW.assigned_by IS NULL THEN
        SELECT COALESCE(name, 'Biri') INTO v_assigner_name FROM users WHERE id = NEW.user_id;
        v_notification_title := COALESCE(v_assigner_name, 'Biri') || ' kendinizi "' || COALESCE(v_todo_title, 'bir gorev') || '" gorevine atadin';
        v_notification_message := '"' || COALESCE(v_todo_title, 'Gorev') || '" gorevine kendinizi atadin';
    ELSE
        RETURN NEW;
    END IF;

    INSERT INTO notifications (user_id, type, title, message, related_todo_id, related_user_id)
    VALUES (NEW.user_id, 'assignment', v_notification_title, v_notification_message, NEW.todo_id, NEW.assigned_by);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'cleanup-old-attachments',
            '0 0 * * *',
            'SELECT cleanup_old_attachments();'
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- pg_cron not available, skip scheduling
    NULL;
END;
$$;

-- Aktivite log fonksiyonu güncelleme (DELETE FK fix)
CREATE OR REPLACE FUNCTION log_todo_activity()
RETURNS TRIGGER AS $$
DECLARE
    action_type VARCHAR(50);
    old_vals JSONB;
    new_vals JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_type := 'created';
        new_vals := to_jsonb(NEW);
        INSERT INTO activity_logs (workspace_id, todo_id, user_id, action, entity_type, entity_id, new_values)
        VALUES (NEW.workspace_id, NEW.id, NEW.created_by, action_type, 'todo', NEW.id, new_vals);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != NEW.status THEN
            IF NEW.status = 'done' THEN action_type := 'completed';
            ELSE action_type := 'status_changed'; END IF;
        ELSIF OLD.category_id != NEW.category_id THEN action_type := 'moved';
        ELSIF OLD.position != NEW.position THEN action_type := 'reordered';
        ELSE action_type := 'updated'; END IF;
        old_vals := jsonb_build_object('status', OLD.status, 'category_id', OLD.category_id, 'title', OLD.title, 'priority', OLD.priority);
        new_vals := jsonb_build_object('status', NEW.status, 'category_id', NEW.category_id, 'title', NEW.title, 'priority', NEW.priority);
        INSERT INTO activity_logs (workspace_id, todo_id, user_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (NEW.workspace_id, NEW.id, NEW.created_by, action_type, 'todo', NEW.id, old_vals, new_vals);
    ELSIF TG_OP = 'DELETE' THEN
        old_vals := to_jsonb(OLD);
        INSERT INTO activity_logs (workspace_id, todo_id, user_id, action, entity_type, entity_id, old_values)
        VALUES (OLD.workspace_id, NULL, OLD.created_by, 'deleted', 'todo', OLD.id, old_vals);
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='licenses' AND policyname='licenses_select') THEN
    CREATE POLICY "licenses_select" ON licenses FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='licenses' AND policyname='licenses_insert') THEN
    CREATE POLICY "licenses_insert" ON licenses FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='licenses' AND policyname='licenses_update') THEN
    CREATE POLICY "licenses_update" ON licenses FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='licenses' AND policyname='licenses_delete') THEN
    CREATE POLICY "licenses_delete" ON licenses FOR DELETE USING (true);
  END IF;
END $$;

-- ============================================================
-- 10. MIGRATIONS
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_status VARCHAR(100) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS offline_reason VARCHAR(200) DEFAULT NULL;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT FALSE;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
