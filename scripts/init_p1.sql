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