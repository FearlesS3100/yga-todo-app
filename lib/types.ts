// User Types
export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  status: 'online' | 'away' | 'offline';
  offline_reason: string | null;
  last_seen: string;
  created_at: string;
}

// Workspace Types
export interface Workspace {
  id: string;
  name: string;
  description: string;
  icon: string;
  created_at: string;
  settings: WorkspaceSettings;
}

export interface WorkspaceSettings {
  default_view: 'kanban' | 'list' | 'calendar';
  allow_subtasks: boolean;
  allow_time_tracking: boolean;
  allow_dependencies: boolean;
}

export interface WorkspaceMember {
  id: string;
  user_id: string;
  workspace_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
  user?: User;
}

// Category Types
export interface Category {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  icon: string;
  position: number;
  is_collapsed: boolean;
  wip_limit: number | null;
  todos?: Todo[];
}

// Label Types
export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

// Todo Types
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type TodoStatus = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'cancelled';

export interface Todo {
  id: string;
  workspace_id: string;
  category_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  status: TodoStatus;
  priority: Priority;
  position: number;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  progress: number;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Relations
  assignees?: TodoAssignee[];
  labels?: TodoLabel[];
  checklist_items?: ChecklistItem[];
  subtasks?: Todo[];
  comments?: Comment[];
  attachments?: Attachment[];
  dependencies?: TodoDependency[];
  time_entries?: TimeEntry[];
}

export interface TodoAssignee {
  id: string;
  todo_id: string;
  user_id: string;
  assigned_at: string;
  user?: User;
}

export interface TodoLabel {
  id: string;
  todo_id: string;
  label_id: string;
  label?: Label;
}

// Checklist Types
export interface ChecklistItem {
  id: string;
  todo_id: string;
  content: string;
  is_completed: boolean;
  position: number;
  completed_at: string | null;
  completed_by: string | null;
}

// Comment Types
export interface Comment {
  id: string;
  todo_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  user?: User;
  replies?: Comment[];
  mentions?: Mention[];
}

export interface Mention {
  id: string;
  comment_id: string;
  user_id: string;
  user?: User;
}

// Attachment Types
export interface Attachment {
  id: string;
  todo_id: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_url: string;
  thumbnail_url: string | null;
  created_at: string;
  expires_at: string | null;
}

// Notification Types
export type NotificationType = 'mention' | 'assignment' | 'due_date' | 'comment' | 'status_change' | 'reminder';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
  related_todo_id?: string | null;
}

// Activity Log Types
export interface ActivityLog {
  id: string;
  workspace_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user?: User;
}

// Time Entry Types
export interface TimeEntry {
  id: string;
  todo_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  description: string | null;
  user?: User;
}

// Dependency Types
export type DependencyType = 'blocks' | 'blocked_by' | 'relates_to';

export interface TodoDependency {
  id: string;
  todo_id: string;
  depends_on_id: string;
  dependency_type: DependencyType;
  depends_on?: Todo;
}

// Custom Field Types
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox' | 'url' | 'email';

export interface CustomField {
  id: string;
  workspace_id: string;
  name: string;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  position: number;
}

export interface CustomFieldValue {
  id: string;
  todo_id: string;
  field_id: string;
  value: string;
  field?: CustomField;
}

// Filter & Sort Types
export interface FilterOptions {
  status?: TodoStatus[];
  priority?: Priority[];
  assignees?: string[];
  labels?: string[];
  due_date?: {
    from?: string;
    to?: string;
  };
  search?: string;
}

export interface SortOptions {
  field: 'position' | 'due_date' | 'priority' | 'created_at' | 'updated_at' | 'title';
  direction: 'asc' | 'desc';
}
