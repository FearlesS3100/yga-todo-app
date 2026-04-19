-- ============================================
-- YARDIMCI FONKSİYONLAR (API için)
-- ============================================

-- ============================================
-- 1. KULLANICI GİRİŞİ / KAYDI (Basit İsim ile)
-- ============================================
CREATE OR REPLACE FUNCTION login_or_register(p_name VARCHAR(100))
RETURNS TABLE (
    user_id UUID,
    user_name VARCHAR(100),
    is_new_user BOOLEAN
) AS $$
DECLARE
    v_user_id UUID;
    v_is_new BOOLEAN := FALSE;
BEGIN
    -- Kullanıcı var mı kontrol et
    SELECT id INTO v_user_id FROM users WHERE LOWER(name) = LOWER(p_name);
    
    -- Yoksa oluştur
    IF v_user_id IS NULL THEN
        INSERT INTO users (name, color)
        VALUES (p_name, '#' || LPAD(TO_HEX((RANDOM() * 16777215)::INT), 6, '0'))
        RETURNING id INTO v_user_id;
        v_is_new := TRUE;
        
        -- Varsayılan workspace'e ekle
        INSERT INTO workspace_members (workspace_id, user_id, role)
        SELECT id, v_user_id, 'member'
        FROM workspaces
        WHERE is_default = TRUE;
    END IF;
    
    -- Son görülme güncelle
    UPDATE users SET last_seen = NOW(), status = 'online' WHERE id = v_user_id;
    
    RETURN QUERY
    SELECT v_user_id, (SELECT name FROM users WHERE id = v_user_id), v_is_new;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. TODO OLUŞTURMA (Tam Özellikli)
-- ============================================
CREATE OR REPLACE FUNCTION create_todo(
    p_workspace_id UUID,
    p_category_id UUID,
    p_title VARCHAR(500),
    p_description TEXT DEFAULT NULL,
    p_priority VARCHAR(20) DEFAULT 'medium',
    p_due_date TIMESTAMPTZ DEFAULT NULL,
    p_assignee_ids UUID[] DEFAULT '{}',
    p_label_ids UUID[] DEFAULT '{}',
    p_parent_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_todo_id UUID;
    v_assignee_id UUID;
    v_label_id UUID;
BEGIN
    -- Todo oluştur
    INSERT INTO todos (
        workspace_id, category_id, parent_id, title, description, 
        priority, due_date, created_by
    )
    VALUES (
        p_workspace_id, p_category_id, p_parent_id, p_title, p_description,
        p_priority, p_due_date, p_created_by
    )
    RETURNING id INTO v_todo_id;
    
    -- Atanan kişileri ekle
    FOREACH v_assignee_id IN ARRAY p_assignee_ids
    LOOP
        INSERT INTO todo_assignees (todo_id, user_id, assigned_by)
        VALUES (v_todo_id, v_assignee_id, p_created_by);
    END LOOP;
    
    -- Etiketleri ekle
    FOREACH v_label_id IN ARRAY p_label_ids
    LOOP
        INSERT INTO todo_labels (todo_id, label_id)
        VALUES (v_todo_id, v_label_id);
    END LOOP;
    
    RETURN v_todo_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. TODO TAŞIMA (Kategori Değiştir)
-- ============================================
CREATE OR REPLACE FUNCTION move_todo(
    p_todo_id UUID,
    p_new_category_id UUID,
    p_new_position INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_max_position INTEGER;
BEGIN
    -- Yeni pozisyonu hesapla
    IF p_new_position IS NULL THEN
        SELECT COALESCE(MAX(position), 0) + 1 INTO v_max_position
        FROM todos WHERE category_id = p_new_category_id;
        p_new_position := v_max_position;
    END IF;
    
    -- Todo'yu güncelle
    UPDATE todos
    SET category_id = p_new_category_id, position = p_new_position
    WHERE id = p_todo_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. TODO SİL (Soft Delete / Archive)
-- ============================================
CREATE OR REPLACE FUNCTION archive_todo(p_todo_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE todos
    SET is_archived = TRUE, status = 'archived'
    WHERE id = p_todo_id;
    
    -- Alt görevleri de arşivle
    UPDATE todos
    SET is_archived = TRUE, status = 'archived'
    WHERE parent_id = p_todo_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. CHECKLIST ITEM EKLE
-- ============================================
CREATE OR REPLACE FUNCTION add_checklist_items(
    p_todo_id UUID,
    p_items TEXT[]
)
RETURNS INTEGER AS $$
DECLARE
    v_item TEXT;
    v_count INTEGER := 0;
BEGIN
    FOREACH v_item IN ARRAY p_items
    LOOP
        INSERT INTO checklist_items (todo_id, content)
        VALUES (p_todo_id, v_item);
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 6. MENTION PARSE ET VE KAYDET
-- ============================================
CREATE OR REPLACE FUNCTION parse_and_save_mentions(
    p_todo_id UUID,
    p_comment_id UUID,
    p_content TEXT,
    p_mentioned_by UUID
)
RETURNS INTEGER AS $$
DECLARE
    v_mention TEXT;
    v_user_id UUID;
    v_count INTEGER := 0;
    v_mentions TEXT[];
BEGIN
    -- @username formatındaki mention'ları bul
    SELECT ARRAY(
        SELECT DISTINCT (REGEXP_MATCHES(p_content, '@([a-zA-Z0-9_]+)', 'g'))[1]
    ) INTO v_mentions;
    
    -- Her mention için kayıt oluştur
    FOREACH v_mention IN ARRAY v_mentions
    LOOP
        SELECT id INTO v_user_id FROM users WHERE LOWER(name) = LOWER(v_mention);
        
        IF v_user_id IS NOT NULL AND v_user_id != p_mentioned_by THEN
            INSERT INTO mentions (todo_id, comment_id, mentioned_user_id, mentioned_by)
            VALUES (p_todo_id, p_comment_id, v_user_id, p_mentioned_by)
            ON CONFLICT DO NOTHING;
            v_count := v_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. WORKSPACE TODO LİSTESİ GETİR
-- ============================================
CREATE OR REPLACE FUNCTION get_workspace_todos(
    p_workspace_id UUID,
    p_category_id UUID DEFAULT NULL,
    p_status VARCHAR(30) DEFAULT NULL,
    p_assignee_id UUID DEFAULT NULL,
    p_search_term TEXT DEFAULT NULL,
    p_include_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    id UUID,
    category_id UUID,
    category_name VARCHAR(100),
    title VARCHAR(500),
    description TEXT,
    status VARCHAR(30),
    priority VARCHAR(20),
    due_date TIMESTAMPTZ,
    progress INTEGER,
    position INTEGER,
    is_pinned BOOLEAN,
    created_at TIMESTAMPTZ,
    subtask_count BIGINT,
    completed_subtask_count BIGINT,
    checklist_count BIGINT,
    completed_checklist_count BIGINT,
    comment_count BIGINT,
    attachment_count BIGINT,
    assignees JSON,
    labels JSON,
    created_by_name VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.category_id,
        c.name as category_name,
        t.title,
        t.description,
        t.status,
        t.priority,
        t.due_date,
        t.progress,
        t.position,
        t.is_pinned,
        t.created_at,
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
        u.name as created_by_name
    FROM todos t
    JOIN categories c ON t.category_id = c.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.workspace_id = p_workspace_id
      AND t.parent_id IS NULL
      AND (p_category_id IS NULL OR t.category_id = p_category_id)
      AND (p_status IS NULL OR t.status = p_status)
      AND (p_include_archived OR t.is_archived = FALSE)
      AND (p_assignee_id IS NULL OR EXISTS (
          SELECT 1 FROM todo_assignees ta WHERE ta.todo_id = t.id AND ta.user_id = p_assignee_id
      ))
      AND (p_search_term IS NULL OR 
           t.title ILIKE '%' || p_search_term || '%' OR 
           t.description ILIKE '%' || p_search_term || '%')
    ORDER BY c.position, t.is_pinned DESC, t.position;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. TODO DETAY GETİR
-- ============================================
CREATE OR REPLACE FUNCTION get_todo_detail(p_todo_id UUID)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    SELECT json_build_object(
        'id', t.id,
        'workspace_id', t.workspace_id,
        'category_id', t.category_id,
        'category_name', c.name,
        'parent_id', t.parent_id,
        'title', t.title,
        'description', t.description,
        'status', t.status,
        'priority', t.priority,
        'due_date', t.due_date,
        'start_date', t.start_date,
        'completed_at', t.completed_at,
        'reminder_at', t.reminder_at,
        'progress', t.progress,
        'position', t.position,
        'estimated_hours', t.estimated_hours,
        'actual_hours', t.actual_hours,
        'is_recurring', t.is_recurring,
        'recurrence_rule', t.recurrence_rule,
        'color', t.color,
        'cover_image', t.cover_image,
        'is_pinned', t.is_pinned,
        'is_archived', t.is_archived,
        'created_at', t.created_at,
        'updated_at', t.updated_at,
        'created_by', json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url),
        'assignees', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', au.id, 'name', au.name, 'avatar_url', au.avatar_url, 'color', au.color
            )), '[]')
            FROM todo_assignees ta JOIN users au ON ta.user_id = au.id WHERE ta.todo_id = t.id
        ),
        'labels', (
            SELECT COALESCE(json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color)), '[]')
            FROM todo_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.todo_id = t.id
        ),
        'checklist_items', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', ci.id, 'content', ci.content, 'is_completed', ci.is_completed, 'position', ci.position
            ) ORDER BY ci.position), '[]')
            FROM checklist_items ci WHERE ci.todo_id = t.id
        ),
        'subtasks', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', st.id, 'title', st.title, 'status', st.status, 'priority', st.priority
            ) ORDER BY st.position), '[]')
            FROM todos st WHERE st.parent_id = t.id
        ),
        'attachments', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', a.id, 'file_name', a.file_name, 'file_type', a.file_type, 
                'file_size', a.file_size, 'file_url', a.file_url
            )), '[]')
            FROM attachments a WHERE a.todo_id = t.id AND a.comment_id IS NULL
        ),
        'custom_fields', (
            SELECT COALESCE(json_agg(json_build_object(
                'field_id', cf.id, 'field_name', cf.name, 'field_type', cf.field_type, 'value', tcfv.value
            )), '[]')
            FROM todo_custom_field_values tcfv 
            JOIN custom_fields cf ON tcfv.field_id = cf.id 
            WHERE tcfv.todo_id = t.id
        ),
        'dependencies', (
            SELECT COALESCE(json_agg(json_build_object(
                'id', td.id, 'depends_on_id', td.depends_on_id, 
                'depends_on_title', dt.title, 'dependency_type', td.dependency_type
            )), '[]')
            FROM todo_dependencies td 
            JOIN todos dt ON td.depends_on_id = dt.id 
            WHERE td.todo_id = t.id
        ),
        'total_time_minutes', (
            SELECT COALESCE(SUM(te.duration_minutes), 0) FROM time_entries te WHERE te.todo_id = t.id
        )
    ) INTO v_result
    FROM todos t
    JOIN categories c ON t.category_id = c.id
    LEFT JOIN users u ON t.created_by = u.id
    WHERE t.id = p_todo_id;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. YORUM EKLE (Mention ile)
-- ============================================
CREATE OR REPLACE FUNCTION add_comment(
    p_todo_id UUID,
    p_content TEXT,
    p_parent_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_comment_id UUID;
BEGIN
    INSERT INTO comments (todo_id, parent_id, content, created_by)
    VALUES (p_todo_id, p_parent_id, p_content, p_created_by)
    RETURNING id INTO v_comment_id;
    
    -- Mention'ları parse et ve kaydet
    PERFORM parse_and_save_mentions(p_todo_id, v_comment_id, p_content, p_created_by);
    
    RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 10. YORUMLARI GETİR
-- ============================================
CREATE OR REPLACE FUNCTION get_todo_comments(p_todo_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', c.id,
                'parent_id', c.parent_id,
                'content', c.content,
                'is_edited', c.is_edited,
                'created_at', c.created_at,
                'created_by', json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url, 'color', u.color),
                'attachments', (
                    SELECT COALESCE(json_agg(json_build_object(
                        'id', a.id, 'file_name', a.file_name, 'file_type', a.file_type, 'file_url', a.file_url
                    )), '[]')
                    FROM attachments a WHERE a.comment_id = c.id
                ),
                'replies', (
                    SELECT COALESCE(json_agg(json_build_object(
                        'id', r.id,
                        'content', r.content,
                        'created_at', r.created_at,
                        'created_by', json_build_object('id', ru.id, 'name', ru.name, 'avatar_url', ru.avatar_url)
                    ) ORDER BY r.created_at), '[]')
                    FROM comments r LEFT JOIN users ru ON r.created_by = ru.id WHERE r.parent_id = c.id
                )
            ) ORDER BY c.created_at
        ), '[]')
        FROM comments c
        LEFT JOIN users u ON c.created_by = u.id
        WHERE c.todo_id = p_todo_id AND c.parent_id IS NULL
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 11. KATEGORİ SIRALA
-- ============================================
CREATE OR REPLACE FUNCTION reorder_categories(
    p_workspace_id UUID,
    p_category_ids UUID[]
)
RETURNS BOOLEAN AS $$
DECLARE
    v_position INTEGER := 1;
    v_category_id UUID;
BEGIN
    FOREACH v_category_id IN ARRAY p_category_ids
    LOOP
        UPDATE categories
        SET position = v_position
        WHERE id = v_category_id AND workspace_id = p_workspace_id;
        v_position := v_position + 1;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 12. TODO SIRALA
-- ============================================
CREATE OR REPLACE FUNCTION reorder_todos(
    p_category_id UUID,
    p_todo_ids UUID[]
)
RETURNS BOOLEAN AS $$
DECLARE
    v_position INTEGER := 1;
    v_todo_id UUID;
BEGIN
    FOREACH v_todo_id IN ARRAY p_todo_ids
    LOOP
        UPDATE todos
        SET position = v_position
        WHERE id = v_todo_id AND category_id = p_category_id;
        v_position := v_position + 1;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 13. BİLDİRİMLERİ GETİR
-- ============================================
CREATE OR REPLACE FUNCTION get_user_notifications(
    p_user_id UUID,
    p_unread_only BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 50
)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', n.id,
                'type', n.type,
                'title', n.title,
                'message', n.message,
                'is_read', n.is_read,
                'created_at', n.created_at,
                'related_todo', CASE WHEN n.related_todo_id IS NOT NULL THEN
                    json_build_object('id', t.id, 'title', t.title)
                ELSE NULL END,
                'related_user', CASE WHEN n.related_user_id IS NOT NULL THEN
                    json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url)
                ELSE NULL END
            ) ORDER BY n.created_at DESC
        ), '[]')
        FROM notifications n
        LEFT JOIN todos t ON n.related_todo_id = t.id
        LEFT JOIN users u ON n.related_user_id = u.id
        WHERE n.user_id = p_user_id
          AND (NOT p_unread_only OR n.is_read = FALSE)
        LIMIT p_limit
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 14. BİLDİRİMLERİ OKUNDU İŞARETLE
-- ============================================
CREATE OR REPLACE FUNCTION mark_notifications_read(
    p_user_id UUID,
    p_notification_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_notification_ids IS NULL THEN
        -- Tümünü okundu yap
        UPDATE notifications
        SET is_read = TRUE, read_at = NOW()
        WHERE user_id = p_user_id AND is_read = FALSE;
    ELSE
        -- Belirtilenleri okundu yap
        UPDATE notifications
        SET is_read = TRUE, read_at = NOW()
        WHERE id = ANY(p_notification_ids) AND user_id = p_user_id;
    END IF;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 15. AKTİVİTE GEÇMİŞİNİ GETİR
-- ============================================
CREATE OR REPLACE FUNCTION get_activity_feed(
    p_workspace_id UUID,
    p_todo_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', al.id,
                'action', al.action,
                'entity_type', al.entity_type,
                'entity_id', al.entity_id,
                'old_values', al.old_values,
                'new_values', al.new_values,
                'created_at', al.created_at,
                'user', CASE WHEN al.user_id IS NOT NULL THEN
                    json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url)
                ELSE NULL END,
                'todo', CASE WHEN al.todo_id IS NOT NULL THEN
                    json_build_object('id', t.id, 'title', t.title)
                ELSE NULL END
            ) ORDER BY al.created_at DESC
        ), '[]')
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN todos t ON al.todo_id = t.id
        WHERE al.workspace_id = p_workspace_id
          AND (p_todo_id IS NULL OR al.todo_id = p_todo_id)
          AND (p_user_id IS NULL OR al.user_id = p_user_id)
        LIMIT p_limit
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 16. ZAMAN TAKİBİ BAŞLAT/DURDUR
-- ============================================
CREATE OR REPLACE FUNCTION toggle_time_tracking(
    p_todo_id UUID,
    p_user_id UUID,
    p_description TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_running_entry_id UUID;
    v_new_entry_id UUID;
    v_result JSON;
BEGIN
    -- Çalışan bir entry var mı?
    SELECT id INTO v_running_entry_id
    FROM time_entries
    WHERE todo_id = p_todo_id AND user_id = p_user_id AND is_running = TRUE;
    
    IF v_running_entry_id IS NOT NULL THEN
        -- Durdur
        UPDATE time_entries
        SET ended_at = NOW(), is_running = FALSE
        WHERE id = v_running_entry_id;
        
        v_result := json_build_object('action', 'stopped', 'entry_id', v_running_entry_id);
    ELSE
        -- Başlat
        INSERT INTO time_entries (todo_id, user_id, description, started_at, is_running)
        VALUES (p_todo_id, p_user_id, p_description, NOW(), TRUE)
        RETURNING id INTO v_new_entry_id;
        
        v_result := json_build_object('action', 'started', 'entry_id', v_new_entry_id);
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 17. WORKSPACE ÜYELERİNİ GETİR
-- ============================================
CREATE OR REPLACE FUNCTION get_workspace_members(p_workspace_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN (
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', u.id,
                'name', u.name,
                'avatar_url', u.avatar_url,
                'color', u.color,
                'status', u.status,
                'role', wm.role,
                'joined_at', wm.joined_at,
                'last_seen', u.last_seen
            ) ORDER BY 
                CASE wm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
                u.name
        ), '[]')
        FROM workspace_members wm
        JOIN users u ON wm.user_id = u.id
        WHERE wm.workspace_id = p_workspace_id
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 18. DASHBOARD İSTATİSTİKLERİ
-- ============================================
CREATE OR REPLACE FUNCTION get_dashboard_stats(
    p_workspace_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'total_todos', (
            SELECT COUNT(*) FROM todos 
            WHERE workspace_id = p_workspace_id AND is_archived = FALSE AND parent_id IS NULL
        ),
        'completed_todos', (
            SELECT COUNT(*) FROM todos 
            WHERE workspace_id = p_workspace_id AND status = 'done' AND parent_id IS NULL
        ),
        'overdue_todos', (
            SELECT COUNT(*) FROM todos 
            WHERE workspace_id = p_workspace_id AND status != 'done' AND due_date < NOW() AND parent_id IS NULL
        ),
        'due_today', (
            SELECT COUNT(*) FROM todos 
            WHERE workspace_id = p_workspace_id AND status != 'done' 
              AND due_date::DATE = CURRENT_DATE AND parent_id IS NULL
        ),
        'due_this_week', (
            SELECT COUNT(*) FROM todos 
            WHERE workspace_id = p_workspace_id AND status != 'done' 
              AND due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days' AND parent_id IS NULL
        ),
        'by_priority', (
            SELECT json_object_agg(priority, cnt)
            FROM (
                SELECT priority, COUNT(*) as cnt
                FROM todos
                WHERE workspace_id = p_workspace_id AND status != 'done' AND parent_id IS NULL
                GROUP BY priority
            ) x
        ),
        'by_category', (
            SELECT json_agg(json_build_object(
                'category_id', c.id,
                'category_name', c.name,
                'category_color', c.color,
                'count', (SELECT COUNT(*) FROM todos t WHERE t.category_id = c.id AND t.parent_id IS NULL)
            ))
            FROM categories c
            WHERE c.workspace_id = p_workspace_id
            ORDER BY c.position
        ),
        'my_assigned', CASE WHEN p_user_id IS NOT NULL THEN (
            SELECT COUNT(*) FROM todo_assignees ta
            JOIN todos t ON ta.todo_id = t.id
            WHERE ta.user_id = p_user_id AND t.workspace_id = p_workspace_id AND t.status != 'done'
        ) ELSE 0 END,
        'recent_activity_count', (
            SELECT COUNT(*) FROM activity_logs
            WHERE workspace_id = p_workspace_id AND created_at > NOW() - INTERVAL '24 hours'
        )
    );
END;
$$ LANGUAGE plpgsql;
