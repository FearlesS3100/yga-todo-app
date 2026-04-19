-- ============================================================
-- 0. RESET — Drop everything for clean reinstall
-- ============================================================
DROP TABLE IF EXISTS licenses CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS checklist_items CASCADE;
DROP TABLE IF EXISTS todo_labels CASCADE;
DROP TABLE IF EXISTS todo_assignees CASCADE;
DROP TABLE IF EXISTS todos CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS labels CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS log_todo_activity() CASCADE;
DROP FUNCTION IF EXISTS login_or_register(text, text) CASCADE;

-- ============================================================
-- 0. MEVCUT TABLOLARI TEMİZLE (güvenli - IF EXISTS)
-- ============================================================
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS attachments CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS checklist_items CASCADE;
DROP TABLE IF EXISTS todo_labels CASCADE;
DROP TABLE IF EXISTS todo_assignees CASCADE;
DROP TABLE IF EXISTS todos CASCADE;
DROP TABLE IF EXISTS labels CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Views
DROP VIEW IF EXISTS todo_with_stats CASCADE;
DROP VIEW IF EXISTS workspace_stats CASCADE;
DROP VIEW IF EXISTS user_activity_summary CASCADE;

-- Functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS calculate_todo_progress() CASCADE;
DROP FUNCTION IF EXISTS handle_todo_completion() CASCADE;
DROP FUNCTION IF EXISTS log_todo_activity() CASCADE;
DROP FUNCTION IF EXISTS create_assignment_notification() CASCADE;
DROP FUNCTION IF EXISTS create_mention_notification() CASCADE;
DROP FUNCTION IF EXISTS create_user_preferences() CASCADE;
DROP FUNCTION IF EXISTS add_workspace_owner() CASCADE;
DROP FUNCTION IF EXISTS calculate_time_entry_duration() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_category_position() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_todo_position() CASCADE;
DROP FUNCTION IF EXISTS auto_assign_checklist_position() CASCADE;
DROP FUNCTION IF EXISTS login_or_register(VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS create_todo(UUID,UUID,VARCHAR,TEXT,VARCHAR,TIMESTAMPTZ,UUID[],UUID[],UUID,UUID) CASCADE;
DROP FUNCTION IF EXISTS move_todo(UUID,UUID,INTEGER) CASCADE;
DROP FUNCTION IF EXISTS archive_todo(UUID) CASCADE;
DROP FUNCTION IF EXISTS add_checklist_items(UUID,TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS parse_and_save_mentions(UUID,UUID,TEXT,UUID) CASCADE;
DROP FUNCTION IF EXISTS get_workspace_todos(UUID,UUID,VARCHAR,UUID,TEXT,BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS get_todo_detail(UUID) CASCADE;
DROP FUNCTION IF EXISTS add_comment(UUID,TEXT,UUID,UUID) CASCADE;
DROP FUNCTION IF EXISTS get_todo_comments(UUID) CASCADE;
DROP FUNCTION IF EXISTS reorder_categories(UUID,UUID[]) CASCADE;
DROP FUNCTION IF EXISTS reorder_todos(UUID,UUID[]) CASCADE;
DROP FUNCTION IF EXISTS get_user_notifications(UUID,BOOLEAN,INTEGER) CASCADE;
DROP FUNCTION IF EXISTS mark_notifications_read(UUID,UUID[]) CASCADE;
DROP FUNCTION IF EXISTS get_activity_feed(UUID,UUID,UUID,INTEGER) CASCADE;
DROP FUNCTION IF EXISTS toggle_time_tracking(UUID,UUID,TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_workspace_members(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_dashboard_stats(UUID,UUID) CASCADE;

-- ============================================================
-- 1. EXTENSION
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 2. TABLOLAR
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
color VARCHAR(7) DEFAULT '#3B82F6',
    status VARCHAR(20) DEFAULT 'online',
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    custom_status VARCHAR(100) DEFAULT NULL,
    offline_reason VARCHAR(200) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_name ON users(name);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '📁',
    color VARCHAR(7) DEFAULT '#6366F1',
    is_default BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '📋',
    color VARCHAR(7) DEFAULT '#10B981',
    position INTEGER DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT FALSE,
    wip_limit INTEGER,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_categories_workspace ON categories(workspace_id);
CREATE INDEX idx_categories_position ON categories(workspace_id, position);

CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#EF4444',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_labels_workspace ON labels(workspace_id);

CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES todos(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(30) DEFAULT 'todo',
    priority VARCHAR(20) DEFAULT 'medium',
    position INTEGER DEFAULT 0,
    due_date TIMESTAMPTZ,
    start_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_todos_workspace ON todos(workspace_id);
CREATE INDEX idx_todos_category ON todos(category_id);
CREATE INDEX idx_todos_parent ON todos(parent_id);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_priority ON todos(priority);
CREATE INDEX idx_todos_due_date ON todos(due_date);
CREATE INDEX idx_todos_position ON todos(category_id, position);
CREATE INDEX idx_todos_created_by ON todos(created_by);

CREATE TABLE todo_assignees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(todo_id, user_id)
);
CREATE INDEX idx_todo_assignees_todo ON todo_assignees(todo_id);
CREATE INDEX idx_todo_assignees_user ON todo_assignees(user_id);

CREATE TABLE todo_labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(todo_id, label_id)
);
CREATE INDEX idx_todo_labels_todo ON todo_labels(todo_id);
CREATE INDEX idx_todo_labels_label ON todo_labels(label_id);

CREATE TABLE checklist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_checklist_items_todo ON checklist_items(todo_id);
CREATE INDEX idx_checklist_items_position ON checklist_items(todo_id, position);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comments_todo ON comments(todo_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_created_by ON comments(created_by);

CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 days')
);
CREATE INDEX idx_attachments_todo ON attachments(todo_id);
CREATE INDEX idx_attachments_comment ON attachments(comment_id);

CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_activity_logs_workspace ON activity_logs(workspace_id);
CREATE INDEX idx_activity_logs_todo ON activity_logs(todo_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    related_todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
    related_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ============================================================
-- 3. FONKSİYONLAR VE TRİGGERLAR
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON todos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_checklist_items_updated_at BEFORE UPDATE ON checklist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION handle_todo_completion()
RETURNS TRIGGER AS $func$
BEGIN
    IF NEW.status = 'done' AND OLD.status != 'done' THEN
        NEW.completed_at := NOW();
    ELSIF NEW.status != 'done' AND OLD.status = 'done' THEN
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER handle_todo_completion_trigger
    BEFORE UPDATE ON todos
    FOR EACH ROW EXECUTE FUNCTION handle_todo_completion();

CREATE OR REPLACE FUNCTION log_todo_activity()
RETURNS TRIGGER AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE TRIGGER log_todo_activity_trigger
    AFTER INSERT OR UPDATE OR DELETE ON todos
    FOR EACH ROW EXECUTE FUNCTION log_todo_activity();

CREATE OR REPLACE FUNCTION create_assignment_notification()
RETURNS TRIGGER AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE TRIGGER create_assignment_notification_trigger
    AFTER INSERT ON todo_assignees
    FOR EACH ROW EXECUTE FUNCTION create_assignment_notification();

CREATE OR REPLACE FUNCTION add_workspace_owner()
RETURNS TRIGGER AS $func$
BEGIN
    IF NEW.created_by IS NOT NULL THEN
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (NEW.id, NEW.created_by, 'owner')
        ON CONFLICT (workspace_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER add_workspace_owner_trigger
    AFTER INSERT ON workspaces
    FOR EACH ROW EXECUTE FUNCTION add_workspace_owner();

CREATE OR REPLACE FUNCTION auto_assign_category_position()
RETURNS TRIGGER AS $func$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM categories WHERE workspace_id = NEW.workspace_id
        );
    END IF;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_category_position_trigger
    BEFORE INSERT ON categories
    FOR EACH ROW EXECUTE FUNCTION auto_assign_category_position();

CREATE OR REPLACE FUNCTION auto_assign_todo_position()
RETURNS TRIGGER AS $func$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM todos WHERE category_id = NEW.category_id
        );
    END IF;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

CREATE TRIGGER auto_assign_todo_position_trigger
    BEFORE INSERT ON todos
    FOR EACH ROW EXECUTE FUNCTION auto_assign_todo_position();

CREATE OR REPLACE FUNCTION auto_assign_checklist_position()
RETURNS TRIGGER AS $func$
BEGIN
    IF NEW.position IS NULL OR NEW.position = 0 THEN
        NEW.position := (
            SELECT COALESCE(MAX(position), 0) + 1
            FROM checklist_items WHERE todo_id = NEW.todo_id
        );
    END IF;
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

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

-- ============================================================
-- 5. YARDIMCI FONKSİYONLAR
-- ============================================================

CREATE OR REPLACE FUNCTION login_or_register(p_name VARCHAR(100))
RETURNS TABLE (user_id UUID, user_name VARCHAR(100), is_new_user BOOLEAN) AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_todo(
    p_workspace_id UUID, p_category_id UUID, p_title VARCHAR(500),
    p_description TEXT DEFAULT NULL, p_priority VARCHAR(20) DEFAULT 'medium',
    p_due_date TIMESTAMPTZ DEFAULT NULL, p_assignee_ids UUID[] DEFAULT '{}',
    p_label_ids UUID[] DEFAULT '{}', p_parent_id UUID DEFAULT NULL, p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION move_todo(p_todo_id UUID, p_new_category_id UUID, p_new_position INTEGER DEFAULT NULL)
RETURNS BOOLEAN AS $func$
DECLARE v_max_position INTEGER;
BEGIN
    IF p_new_position IS NULL THEN
        SELECT COALESCE(MAX(position), 0) + 1 INTO v_max_position FROM todos WHERE category_id = p_new_category_id;
        p_new_position := v_max_position;
    END IF;
    UPDATE todos SET category_id = p_new_category_id, position = p_new_position WHERE id = p_todo_id;
    RETURN TRUE;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_checklist_items(p_todo_id UUID, p_items TEXT[])
RETURNS INTEGER AS $func$
DECLARE v_item TEXT; v_count INTEGER := 0;
BEGIN
    FOREACH v_item IN ARRAY p_items LOOP
        INSERT INTO checklist_items (todo_id, content) VALUES (p_todo_id, v_item);
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END;
$func$ LANGUAGE plpgsql;

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
) AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_todo_detail(p_todo_id UUID)
RETURNS JSON AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_comment(p_todo_id UUID, p_content TEXT, p_parent_id UUID DEFAULT NULL, p_created_by UUID DEFAULT NULL)
RETURNS UUID AS $func$
DECLARE v_comment_id UUID;
BEGIN
    INSERT INTO comments (todo_id, parent_id, content, created_by)
    VALUES (p_todo_id, p_parent_id, p_content, p_created_by)
    RETURNING id INTO v_comment_id;
    RETURN v_comment_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_todo_comments(p_todo_id UUID)
RETURNS JSON AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_categories(p_workspace_id UUID, p_category_ids UUID[])
RETURNS BOOLEAN AS $func$
DECLARE v_position INTEGER := 1; v_category_id UUID;
BEGIN
    FOREACH v_category_id IN ARRAY p_category_ids LOOP
        UPDATE categories SET position = v_position WHERE id = v_category_id AND workspace_id = p_workspace_id;
        v_position := v_position + 1;
    END LOOP;
    RETURN TRUE;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reorder_todos(p_category_id UUID, p_todo_ids UUID[])
RETURNS BOOLEAN AS $func$
DECLARE v_position INTEGER := 1; v_todo_id UUID;
BEGIN
    FOREACH v_todo_id IN ARRAY p_todo_ids LOOP
        UPDATE todos SET position = v_position WHERE id = v_todo_id AND category_id = p_category_id;
        v_position := v_position + 1;
    END LOOP;
    RETURN TRUE;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_notifications(p_user_id UUID, p_unread_only BOOLEAN DEFAULT FALSE, p_limit INTEGER DEFAULT 50)
RETURNS JSON AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION mark_notifications_read(p_user_id UUID, p_notification_ids UUID[] DEFAULT NULL)
RETURNS INTEGER AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_activity_feed(p_workspace_id UUID, p_todo_id UUID DEFAULT NULL, p_user_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 50)
RETURNS JSON AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_workspace_members(p_workspace_id UUID)
RETURNS JSON AS $func$
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
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_workspace_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSON AS $func$
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
$func$ LANGUAGE plpgsql;

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
RETURNS TRIGGER AS $func$
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
$func$ LANGUAGE plpgsql;

-- ============================================================
-- 10. EK OTOMATIK SİLME (5 gün sonra)
-- ============================================================

-- Storage'dan eski ekleri silen fonksiyon
CREATE OR REPLACE FUNCTION cleanup_old_attachments()
RETURNS void AS $func$
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
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- pg_cron ile her gün gece yarısı çalıştır (eğer pg_cron aktifse)
-- Supabase'de pg_cron varsayılan olarak aktiftir
DO $func$
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
$func$;

-- Aktivite log fonksiyonu güncelleme (DELETE FK fix)
CREATE OR REPLACE FUNCTION log_todo_activity()
RETURNS TRIGGER AS $func$
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
$func$ LANGUAGE plpgsql;

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
DO $func$ BEGIN
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
END $func$;

-- ============================================================
-- 10. MIGRATIONS
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_status VARCHAR(100) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS offline_reason VARCHAR(200) DEFAULT NULL;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT FALSE;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- ============================================================
-- 11. COMMENT REACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS comment_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  emoji      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT comment_reactions_unique UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions (comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id    ON comment_reactions (user_id);

ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comment_reactions' AND policyname='comment_reactions_select') THEN
    CREATE POLICY "comment_reactions_select" ON comment_reactions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comment_reactions' AND policyname='comment_reactions_insert') THEN
    CREATE POLICY "comment_reactions_insert" ON comment_reactions FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comment_reactions' AND policyname='comment_reactions_delete') THEN
    CREATE POLICY "comment_reactions_delete" ON comment_reactions FOR DELETE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comment_reactions' AND policyname='comment_reactions_update') THEN
    CREATE POLICY "comment_reactions_update" ON comment_reactions FOR UPDATE USING (true);
  END IF;
END $$;

-- Realtime için publication'a ekle (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'comment_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_reactions;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.comment_reactions REPLICA IDENTITY FULL;

-- Ensure full row is sent in realtime UPDATE events for todos
ALTER TABLE IF EXISTS public.todos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.todo_assignees REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.checklist_items REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.todo_labels REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.attachments REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.comments REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.users REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.categories REPLICA IDENTITY FULL;
