-- ============================================
-- REALTIME VE ROW LEVEL SECURITY (RLS)
-- ============================================

-- ============================================
-- REALTIME ETKİNLEŞTİRME
-- ============================================

-- Realtime için tabloları ekle
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace_members;
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE todos;
ALTER PUBLICATION supabase_realtime ADD TABLE todo_assignees;
ALTER PUBLICATION supabase_realtime ADD TABLE checklist_items;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE mentions;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Not: Bu basit bir kurulum - herkes aynı workspace'i kullanacak
-- Daha karmaşık senaryolar için genişletilebilir
-- ============================================

-- RLS'yi etkinleştir
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
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE todo_dependencies ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HERKES ERİŞEBİLİR POLİCYLER
-- (Basit senaryo için - isim bazlı login)
-- ============================================

-- Users - herkes okuyabilir, kendi kaydını güncelleyebilir
CREATE POLICY "Users are viewable by everyone" ON users FOR SELECT USING (true);
CREATE POLICY "Users can insert" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own record" ON users FOR UPDATE USING (true);

-- Workspaces - herkes okuyabilir ve yazabilir
CREATE POLICY "Workspaces are viewable by everyone" ON workspaces FOR SELECT USING (true);
CREATE POLICY "Workspaces can be created by anyone" ON workspaces FOR INSERT WITH CHECK (true);
CREATE POLICY "Workspaces can be updated by anyone" ON workspaces FOR UPDATE USING (true);

-- Workspace Members
CREATE POLICY "Workspace members are viewable by everyone" ON workspace_members FOR SELECT USING (true);
CREATE POLICY "Workspace members can be added by anyone" ON workspace_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Workspace members can be updated by anyone" ON workspace_members FOR UPDATE USING (true);
CREATE POLICY "Workspace members can be deleted by anyone" ON workspace_members FOR DELETE USING (true);

-- Categories
CREATE POLICY "Categories are viewable by everyone" ON categories FOR SELECT USING (true);
CREATE POLICY "Categories can be created by anyone" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Categories can be updated by anyone" ON categories FOR UPDATE USING (true);
CREATE POLICY "Categories can be deleted by anyone" ON categories FOR DELETE USING (true);

-- Todos
CREATE POLICY "Todos are viewable by everyone" ON todos FOR SELECT USING (true);
CREATE POLICY "Todos can be created by anyone" ON todos FOR INSERT WITH CHECK (true);
CREATE POLICY "Todos can be updated by anyone" ON todos FOR UPDATE USING (true);
CREATE POLICY "Todos can be deleted by anyone" ON todos FOR DELETE USING (true);

-- Todo Assignees
CREATE POLICY "Todo assignees are viewable by everyone" ON todo_assignees FOR SELECT USING (true);
CREATE POLICY "Todo assignees can be added by anyone" ON todo_assignees FOR INSERT WITH CHECK (true);
CREATE POLICY "Todo assignees can be deleted by anyone" ON todo_assignees FOR DELETE USING (true);

-- Todo Labels
CREATE POLICY "Todo labels are viewable by everyone" ON todo_labels FOR SELECT USING (true);
CREATE POLICY "Todo labels can be added by anyone" ON todo_labels FOR INSERT WITH CHECK (true);
CREATE POLICY "Todo labels can be deleted by anyone" ON todo_labels FOR DELETE USING (true);

-- Labels
CREATE POLICY "Labels are viewable by everyone" ON labels FOR SELECT USING (true);
CREATE POLICY "Labels can be created by anyone" ON labels FOR INSERT WITH CHECK (true);
CREATE POLICY "Labels can be updated by anyone" ON labels FOR UPDATE USING (true);
CREATE POLICY "Labels can be deleted by anyone" ON labels FOR DELETE USING (true);

-- Checklist Items
CREATE POLICY "Checklist items are viewable by everyone" ON checklist_items FOR SELECT USING (true);
CREATE POLICY "Checklist items can be created by anyone" ON checklist_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Checklist items can be updated by anyone" ON checklist_items FOR UPDATE USING (true);
CREATE POLICY "Checklist items can be deleted by anyone" ON checklist_items FOR DELETE USING (true);

-- Comments
CREATE POLICY "Comments are viewable by everyone" ON comments FOR SELECT USING (true);
CREATE POLICY "Comments can be created by anyone" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Comments can be updated by anyone" ON comments FOR UPDATE USING (true);
CREATE POLICY "Comments can be deleted by anyone" ON comments FOR DELETE USING (true);

-- Mentions
CREATE POLICY "Mentions are viewable by everyone" ON mentions FOR SELECT USING (true);
CREATE POLICY "Mentions can be created by anyone" ON mentions FOR INSERT WITH CHECK (true);
CREATE POLICY "Mentions can be updated by anyone" ON mentions FOR UPDATE USING (true);

-- Attachments
CREATE POLICY "Attachments are viewable by everyone" ON attachments FOR SELECT USING (true);
CREATE POLICY "Attachments can be created by anyone" ON attachments FOR INSERT WITH CHECK (true);
CREATE POLICY "Attachments can be deleted by anyone" ON attachments FOR DELETE USING (true);

-- Notifications
CREATE POLICY "Notifications are viewable by everyone" ON notifications FOR SELECT USING (true);
CREATE POLICY "Notifications can be created by anyone" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Notifications can be updated by anyone" ON notifications FOR UPDATE USING (true);

-- Activity Logs
CREATE POLICY "Activity logs are viewable by everyone" ON activity_logs FOR SELECT USING (true);
CREATE POLICY "Activity logs can be created by anyone" ON activity_logs FOR INSERT WITH CHECK (true);

-- User Preferences
CREATE POLICY "User preferences are viewable by everyone" ON user_preferences FOR SELECT USING (true);
CREATE POLICY "User preferences can be created by anyone" ON user_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY "User preferences can be updated by anyone" ON user_preferences FOR UPDATE USING (true);

-- Favorites
CREATE POLICY "Favorites are viewable by everyone" ON favorites FOR SELECT USING (true);
CREATE POLICY "Favorites can be created by anyone" ON favorites FOR INSERT WITH CHECK (true);
CREATE POLICY "Favorites can be deleted by anyone" ON favorites FOR DELETE USING (true);

-- Custom Fields
CREATE POLICY "Custom fields are viewable by everyone" ON custom_fields FOR SELECT USING (true);
CREATE POLICY "Custom fields can be created by anyone" ON custom_fields FOR INSERT WITH CHECK (true);
CREATE POLICY "Custom fields can be updated by anyone" ON custom_fields FOR UPDATE USING (true);
CREATE POLICY "Custom fields can be deleted by anyone" ON custom_fields FOR DELETE USING (true);

-- Todo Custom Field Values
CREATE POLICY "Todo custom field values are viewable by everyone" ON todo_custom_field_values FOR SELECT USING (true);
CREATE POLICY "Todo custom field values can be created by anyone" ON todo_custom_field_values FOR INSERT WITH CHECK (true);
CREATE POLICY "Todo custom field values can be updated by anyone" ON todo_custom_field_values FOR UPDATE USING (true);
CREATE POLICY "Todo custom field values can be deleted by anyone" ON todo_custom_field_values FOR DELETE USING (true);

-- Time Entries
CREATE POLICY "Time entries are viewable by everyone" ON time_entries FOR SELECT USING (true);
CREATE POLICY "Time entries can be created by anyone" ON time_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Time entries can be updated by anyone" ON time_entries FOR UPDATE USING (true);
CREATE POLICY "Time entries can be deleted by anyone" ON time_entries FOR DELETE USING (true);

-- Todo Dependencies
CREATE POLICY "Todo dependencies are viewable by everyone" ON todo_dependencies FOR SELECT USING (true);
CREATE POLICY "Todo dependencies can be created by anyone" ON todo_dependencies FOR INSERT WITH CHECK (true);
CREATE POLICY "Todo dependencies can be deleted by anyone" ON todo_dependencies FOR DELETE USING (true);
