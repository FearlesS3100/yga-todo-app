-- ============================================================
-- 3. FONKSİYONLAR VE TRİGGERLAR
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON todos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checklist_items_updated_at BEFORE UPDATE ON checklist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION handle_todo_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        NEW.completed_at := NOW();
    ELSIF NEW.status != 'done' AND OLD.status = 'done' THEN
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_todo_completion_trigger
    BEFORE UPDATE ON todos
    FOR EACH ROW EXECUTE FUNCTION handle_todo_completion();

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

CREATE TRIGGER log_todo_activity_trigger
    AFTER INSERT OR UPDATE OR DELETE ON todos
    FOR EACH ROW EXECUTE FUNCTION log_todo_activity();

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

CREATE TRIGGER create_assignment_notification_trigger
    AFTER INSERT ON todo_assignees
    FOR EACH ROW EXECUTE FUNCTION create_assignment_notification();

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

CREATE OR REPLACE FUNCTION auto_assign_category_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM categories WHERE workspace_id = NEW.workspace_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_category_position_trigger
    BEFORE INSERT ON categories
    FOR EACH ROW EXECUTE FUNCTION auto_assign_category_position();

CREATE OR REPLACE FUNCTION auto_assign_todo_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM todos WHERE category_id = NEW.category_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_todo_position_trigger
    BEFORE INSERT ON todos
    FOR EACH ROW EXECUTE FUNCTION auto_assign_todo_position();

CREATE OR REPLACE FUNCTION auto_assign_checklist_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM checklist_items WHERE todo_id = NEW.todo_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_checklist_position_trigger
    BEFORE INSERT ON checklist_items
    FOR EACH ROW EXECUTE FUNCTION auto_assign_checklist_position();

-- ============================================================
-- 4. VİEWLAR
-- ============================================================

CREATE OR REPLACE VIEW todo_with_stats AS
SELECT t.*,
    (SELECT COUNT(*) FROM todos st WHERE st.parent_id = t.id) as subtask_count,
    (SELECT COUNT(*) FROM todos st WHERE st.parent_id = t.id AND st.status = 'done') as completed_subtask_count,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.todo_id = t.id) as checklist_count,
    (SELECT COUNT(*) FROM checklist_items ci WHERE ci.todo_id = t.id AND ci.is_completed = TRUE) as completed_checklist_count,
    (SELECT COUNT(*) FROM comments c WHERE c.todo_id = t.id) as comment_count,
    (SELECT COUNT(*) FROM attachments a WHERE a.todo_id = t.id) as attachment_count,
    (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'avatar_url', u.avatar_url, 'color', u.color))
     FROM todo_assignees ta JOIN users u ON ta.user_id = u.id WHERE ta.todo_id = t.id) as assignees,
    (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
     FROM todo_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.todo_id = t.id) as labels
FROM todos t;

CREATE OR REPLACE VIEW workspace_stats AS
SELECT w.id as workspace_id, w.name as workspace_name,
    (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as member_count,
    (SELECT COUNT(*) FROM categories c WHERE c.workspace_id = w.id) as category_count,
    (SELECT COUNT(*) FROM todos t WHERE t.workspace_id = w.id AND t.parent_id IS NULL) as todo_count,
    (SELECT COUNT(*) FROM todos t WHERE t.workspace_id = w.id AND t.status = 'done') as completed_count,
    (SELECT COUNT(*) FROM todos t WHERE t.workspace_id = w.id AND t.status != 'done' AND t.due_date < NOW()) as overdue_count
FROM workspaces w;

CREATE OR REPLACE VIEW user_activity_summary AS
SELECT u.id as user_id, u.name,
    (SELECT COUNT(*) FROM todos t WHERE t.created_by = u.id) as created_todos,
    (SELECT COUNT(*) FROM todo_assignees ta WHERE ta.user_id = u.id) as assigned_todos,
    (SELECT COUNT(*) FROM comments c WHERE c.created_by = u.id) as comments_made
FROM users u;
