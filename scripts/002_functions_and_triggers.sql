-- ============================================
-- FONKSİYONLAR VE TRİGGERLAR
-- ============================================

-- ============================================
-- 1. UPDATED_AT OTOMATİK GÜNCELLEME
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tüm tablolar için trigger'lar
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_todos_updated_at
    BEFORE UPDATE ON todos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_checklist_items_updated_at
    BEFORE UPDATE ON checklist_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_todo_custom_field_values_updated_at
    BEFORE UPDATE ON todo_custom_field_values
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. TODO PROGRESS HESAPLAMA (Checklist bazlı)
-- ============================================
CREATE OR REPLACE FUNCTION calculate_todo_progress()
RETURNS TRIGGER AS $$
DECLARE
    total_items INTEGER;
    completed_items INTEGER;
    new_progress INTEGER;
BEGIN
    -- Todo'nun checklist item sayısını hesapla
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE is_completed = TRUE)
    INTO total_items, completed_items
    FROM checklist_items
    WHERE todo_id = COALESCE(NEW.todo_id, OLD.todo_id);
    
    -- Progress hesapla
    IF total_items > 0 THEN
        new_progress := ROUND((completed_items::DECIMAL / total_items) * 100);
    ELSE
        new_progress := 0;
    END IF;
    
    -- Todo'yu güncelle
    UPDATE todos 
    SET progress = new_progress
    WHERE id = COALESCE(NEW.todo_id, OLD.todo_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_todo_progress_on_checklist_change
    AFTER INSERT OR UPDATE OR DELETE ON checklist_items
    FOR EACH ROW EXECUTE FUNCTION calculate_todo_progress();

-- ============================================
-- 3. TODO TAMAMLANMA DURUMU
-- ============================================
CREATE OR REPLACE FUNCTION handle_todo_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Status 'done' olduğunda completed_at'i ayarla
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        NEW.completed_at := NOW();
    -- Status 'done'dan başka bir şeye değişirse completed_at'i sıfırla
    ELSIF NEW.status != 'done' AND OLD.status = 'done' THEN
        NEW.completed_at := NULL;
        NEW.completed_by := NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_todo_completion_trigger
    BEFORE UPDATE ON todos
    FOR EACH ROW EXECUTE FUNCTION handle_todo_completion();

-- ============================================
-- 4. AKTİVİTE LOG KAYDI
-- ============================================
    AFTER INSERT OR UPDATE OR DELETE ON todos
    FOR EACH ROW EXECUTE FUNCTION log_todo_activity();

-- ============================================
-- 5. BİLDİRİM OLUŞTURMA - ATAMA
-- ============================================
CREATE OR REPLACE FUNCTION create_assignment_notification()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications (user_id, type, title, message, related_todo_id, related_user_id)
    SELECT 
        NEW.user_id,
        'assignment',
        'Yeni görev atandı',
        (SELECT title FROM todos WHERE id = NEW.todo_id),
        NEW.todo_id,
        NEW.assigned_by
    WHERE NEW.user_id != NEW.assigned_by; -- Kendine atamada bildirim gönderme
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_assignment_notification_trigger
    AFTER INSERT ON todo_assignees
    FOR EACH ROW EXECUTE FUNCTION create_assignment_notification();

-- ============================================
-- 6. BİLDİRİM OLUŞTURMA - MENTION
-- ============================================
CREATE OR REPLACE FUNCTION create_mention_notification()
RETURNS TRIGGER AS $$
DECLARE
    todo_title TEXT;
BEGIN
    SELECT title INTO todo_title FROM todos WHERE id = NEW.todo_id;
    
    INSERT INTO notifications (user_id, type, title, message, related_todo_id, related_comment_id, related_user_id)
    VALUES (
        NEW.mentioned_user_id,
        'mention',
        'Bir görevde etiketlendiniz',
        todo_title,
        NEW.todo_id,
        NEW.comment_id,
        NEW.mentioned_by
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_mention_notification_trigger
    AFTER INSERT ON mentions
    FOR EACH ROW EXECUTE FUNCTION create_mention_notification();

-- ============================================
-- 7. KULLANICI OLUŞTURULDUĞUNDA TERCİH KAYDI
-- ============================================
CREATE OR REPLACE FUNCTION create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_preferences (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_user_preferences_trigger
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_user_preferences();

-- ============================================
-- 8. WORKSPACE ÜYELİĞİ - OWNER OLARAK EKLE
-- ============================================
CREATE OR REPLACE FUNCTION add_workspace_owner()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (NEW.id, NEW.created_by, 'owner')
        ON CONFLICT (workspace_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER add_workspace_owner_trigger
    AFTER INSERT ON workspaces
    FOR EACH ROW EXECUTE FUNCTION add_workspace_owner();

-- ============================================
-- 9. ZAMAN GİRİŞİ - SÜRE HESAPLAMA
-- ============================================
CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60;
        NEW.is_running := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_time_entry_duration_trigger
    BEFORE UPDATE ON time_entries
    FOR EACH ROW EXECUTE FUNCTION calculate_time_entry_duration();

-- ============================================
-- 10. KATEGORİ POZİSYON OTOMATİK ATAMA
-- ============================================
CREATE OR REPLACE FUNCTION auto_assign_category_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM categories
            WHERE workspace_id = NEW.workspace_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_category_position_trigger
    BEFORE INSERT ON categories
    FOR EACH ROW EXECUTE FUNCTION auto_assign_category_position();

-- ============================================
-- 11. TODO POZİSYON OTOMATİK ATAMA
-- ============================================
CREATE OR REPLACE FUNCTION auto_assign_todo_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM todos
            WHERE category_id = NEW.category_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_todo_position_trigger
    BEFORE INSERT ON todos
    FOR EACH ROW EXECUTE FUNCTION auto_assign_todo_position();

-- ============================================
-- 12. CHECKLIST ITEM POZİSYON OTOMATİK ATAMA
-- ============================================
CREATE OR REPLACE FUNCTION auto_assign_checklist_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM checklist_items
            WHERE todo_id = NEW.todo_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_checklist_position_trigger
    BEFORE INSERT ON checklist_items
    FOR EACH ROW EXECUTE FUNCTION auto_assign_checklist_position();

-- ============================================
-- 13. SUBTASK SAYISI HESAPLAMA VİEW
-- ============================================
CREATE OR REPLACE VIEW todo_with_stats AS
SELECT 
    t.*,
    (SELECT COUNT(*) FROM todos st WHERE st.parent_id = t.id) as subtask_count,
    (SELECT COUNT(*) FROM todos st WHERE st.parent_id = t.id AND st.status = 'done') as completed_subtask_count,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.todo_id = t.id) as checklist_count,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.todo_id = t.id AND ci.is_completed = TRUE) as completed_checklist_count,
    (SELECT COUNT(*) FROM comments c WHERE c.todo_id = t.id) as comment_count,
    (SELECT COUNT(*) FROM attachments a WHERE a.todo_id = t.id) as attachment_count,
    (SELECT COALESCE(SUM(duration_minutes), 0) FROM time_entries te WHERE te.todo_id = t.id) as total_time_minutes,
    (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url, 'color', u.color))
     FROM todo_assignees ta JOIN users u ON ta.user_id = u.id WHERE ta.todo_id = t.id) as assignees,
    (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
     FROM todo_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.todo_id = t.id) as labels
FROM todos t;

-- ============================================
-- 14. WORKSPACE İSTATİSTİKLERİ VİEW
-- ============================================
CREATE OR REPLACE VIEW workspace_stats AS
SELECT 
    w.id as workspace_id,
    w.name as workspace_name,
    (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as member_count,
    (SELECT COUNT(*) FROM categories c WHERE c.workspace_id = w.id) as category_count,
    (SELECT COUNT(*) FROM todos t WHERE t.workspace_id = w.id AND t.parent_id IS NULL) as todo_count,
    (SELECT COUNT(*) FROM todos t WHERE t.workspace_id = w.id AND t.status = 'done') as completed_count,
    (SELECT COUNT(*) FROM todos t WHERE t.workspace_id = w.id AND t.status != 'done' AND t.due_date < NOW()) as overdue_count
FROM workspaces w;

-- ============================================
-- 15. KULLANICI AKTİVİTE ÖZET VİEW
-- ============================================
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT 
    u.id as user_id,
    u.name,
    (SELECT COUNT(*) FROM todos t WHERE t.created_by = u.id) as created_todos,
    (SELECT COUNT(*) FROM todos t WHERE t.completed_by = u.id) as completed_todos,
    (SELECT COUNT(*) FROM todo_assignees ta WHERE ta.user_id = u.id) as assigned_todos,
    (SELECT COUNT(*) FROM comments c WHERE c.created_by = u.id) as comments_made,
    (SELECT COALESCE(SUM(te.duration_minutes), 0) FROM time_entries te WHERE te.user_id = u.id) as total_time_logged
FROM users u;
