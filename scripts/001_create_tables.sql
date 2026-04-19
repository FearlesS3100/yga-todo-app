-- ============================================
-- WORKSPACE TODO UYGULAMASI - SUPABASE ŞEMASI
-- ============================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. KULLANICILAR (Basit Login - Sadece İsim)
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    color VARCHAR(7) DEFAULT '#3B82F6', -- Kullanıcı rengi (etiketleme için)
    status VARCHAR(20) DEFAULT 'online', -- online, away, busy, offline
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- İsim için index (hızlı arama)
CREATE INDEX idx_users_name ON users(name);

-- ============================================
-- 2. WORKSPACE'LER
-- ============================================
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '📁',
    color VARCHAR(7) DEFAULT '#6366F1',
    is_default BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}', -- Özel ayarlar
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. WORKSPACE ÜYELERİ
-- ============================================
CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member', -- owner, admin, member
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

-- ============================================
-- 4. KATEGORİLER (Sürüklenebilir Sütunlar)
-- ============================================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT '📋',
    color VARCHAR(7) DEFAULT '#10B981',
    position INTEGER DEFAULT 0, -- Sıralama için
    is_collapsed BOOLEAN DEFAULT FALSE,
    wip_limit INTEGER, -- Work in progress limit (Kanban için)
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categories_workspace ON categories(workspace_id);
CREATE INDEX idx_categories_position ON categories(workspace_id, position);

-- ============================================
-- 5. ETİKETLER / LABELS
-- ============================================
CREATE TABLE labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#EF4444',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_labels_workspace ON labels(workspace_id);

-- ============================================
-- 6. ANA TODO TABLOSU (Çok Gelişmiş)
-- ============================================
CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES todos(id) ON DELETE CASCADE, -- Subtask için
    
    -- Temel Bilgiler
    title VARCHAR(500) NOT NULL,
    description TEXT, -- Rich text / Markdown
    
    -- Durum ve Öncelik
    status VARCHAR(30) DEFAULT 'todo', -- todo, in_progress, review, done, archived
    priority VARCHAR(20) DEFAULT 'medium', -- urgent, high, medium, low, none
    
    -- Tarihler
    due_date TIMESTAMPTZ,
    start_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reminder_at TIMESTAMPTZ,
    
    -- Pozisyon (Sürükleme için)
    position INTEGER DEFAULT 0,
    
    -- İlerleme
    progress INTEGER DEFAULT 0, -- 0-100 arası yüzde
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    
    -- Tekrar (Recurring)
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule JSONB, -- {"frequency": "daily", "interval": 1, "endDate": "..."}
    
    -- Görünüm
    color VARCHAR(7),
    cover_image TEXT,
    is_pinned BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    
    -- Meta
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- İndexler
CREATE INDEX idx_todos_workspace ON todos(workspace_id);
CREATE INDEX idx_todos_category ON todos(category_id);
CREATE INDEX idx_todos_parent ON todos(parent_id);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_priority ON todos(priority);
CREATE INDEX idx_todos_due_date ON todos(due_date);
CREATE INDEX idx_todos_position ON todos(category_id, position);
CREATE INDEX idx_todos_created_by ON todos(created_by);

-- ============================================
-- 7. TODO ATANAN KİŞİLER (Assignees)
-- ============================================
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

-- ============================================
-- 8. TODO ETİKETLERİ (Many-to-Many)
-- ============================================
CREATE TABLE todo_labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(todo_id, label_id)
);

CREATE INDEX idx_todo_labels_todo ON todo_labels(todo_id);
CREATE INDEX idx_todo_labels_label ON todo_labels(label_id);

-- ============================================
-- 9. CHECKLIST MADDELER (Todo içindeki listeler)
-- ============================================
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

-- ============================================
-- 10. KULLANICI ETİKETLEME (Mentions)
-- ============================================
CREATE TABLE mentions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
    comment_id UUID, -- Sonra comment tablosuyla ilişkilendirilecek
    mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentioned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mentions_todo ON mentions(todo_id);
CREATE INDEX idx_mentions_user ON mentions(mentioned_user_id);
CREATE INDEX idx_mentions_unread ON mentions(mentioned_user_id, is_read) WHERE is_read = FALSE;

-- ============================================
-- 11. YORUMLAR
-- ============================================
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- Yanıt için
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mentions tablosuna comment_id foreign key ekle
ALTER TABLE mentions ADD CONSTRAINT fk_mentions_comment 
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE;

CREATE INDEX idx_comments_todo ON comments(todo_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_created_by ON comments(created_by);

-- ============================================
-- 12. DOSYA EKLERİ
-- ============================================
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER, -- bytes
    file_url TEXT NOT NULL,
    thumbnail_url TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachments_todo ON attachments(todo_id);
CREATE INDEX idx_attachments_comment ON attachments(comment_id);

-- ============================================
-- 13. AKTİVİTE LOGLARI
-- ============================================
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    action VARCHAR(50) NOT NULL, -- created, updated, moved, completed, commented, etc.
    entity_type VARCHAR(50) NOT NULL, -- todo, category, comment, etc.
    entity_id UUID NOT NULL,
    
    old_values JSONB, -- Eski değerler
    new_values JSONB, -- Yeni değerler
    metadata JSONB, -- Ekstra bilgi
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_workspace ON activity_logs(workspace_id);
CREATE INDEX idx_activity_logs_todo ON activity_logs(todo_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);

-- ============================================
-- 14. BİLDİRİMLER
-- ============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- mention, assignment, due_date, comment, etc.
    title VARCHAR(200) NOT NULL,
    message TEXT,
    
    -- İlişkili entity
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

-- ============================================
-- 15. KULLANICI TERCİHLERİ
-- ============================================
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    
    -- Görünüm
    theme VARCHAR(20) DEFAULT 'system', -- light, dark, system
    language VARCHAR(10) DEFAULT 'tr',
    
    -- Bildirimler
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    mention_notifications BOOLEAN DEFAULT TRUE,
    assignment_notifications BOOLEAN DEFAULT TRUE,
    due_date_notifications BOOLEAN DEFAULT TRUE,
    
    -- Varsayılan Workspace
    default_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    
    -- Diğer Ayarlar
    settings JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 16. FAVORİLER / YILDIZLILAR
-- ============================================
CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    todo_id UUID REFERENCES todos(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- En az biri dolu olmalı
    CONSTRAINT chk_favorite_target CHECK (
        todo_id IS NOT NULL OR workspace_id IS NOT NULL OR category_id IS NOT NULL
    )
);

CREATE INDEX idx_favorites_user ON favorites(user_id);

-- ============================================
-- 17. ÖZEL ALANLAR (Custom Fields)
-- ============================================
CREATE TABLE custom_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    field_type VARCHAR(30) NOT NULL, -- text, number, date, select, multiselect, checkbox, url
    options JSONB, -- Select türü için seçenekler
    is_required BOOLEAN DEFAULT FALSE,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE todo_custom_field_values (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(todo_id, field_id)
);

-- ============================================
-- 18. ZAMAN TAKİBİ (Time Tracking)
-- ============================================
CREATE TABLE time_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_minutes INTEGER, -- Hesaplanmış süre
    is_running BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_entries_todo ON time_entries(todo_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);
CREATE INDEX idx_time_entries_running ON time_entries(user_id, is_running) WHERE is_running = TRUE;

-- ============================================
-- 19. BAĞIMLILIKLAR (Dependencies)
-- ============================================
CREATE TABLE todo_dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    todo_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    depends_on_id UUID NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    dependency_type VARCHAR(20) DEFAULT 'blocks', -- blocks, relates_to
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(todo_id, depends_on_id),
    CONSTRAINT chk_no_self_dependency CHECK (todo_id != depends_on_id)
);

CREATE INDEX idx_dependencies_todo ON todo_dependencies(todo_id);
CREATE INDEX idx_dependencies_depends_on ON todo_dependencies(depends_on_id);
