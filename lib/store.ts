import { create } from 'zustand';
import type {
  User,
  Category,
  Todo,
  Label,
  Notification,
  FilterOptions,
  SortOptions,
  TodoStatus,
  ChecklistItem,
  TodoAssignee,
  TodoLabel,
  Comment,
  Attachment,
} from './types';
import { supabase, supabaseLogin } from './supabase';

const STORAGE_KEY = 'workspace_current_user';
const LICENSE_KEY_STORAGE = 'workspace_license_activated';
const LICENSE_ID_STORAGE = 'workspace_license_id';
const NOTIFICATION_READ_CACHE_KEY = 'workspace_notification_read_cache';
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';
let latestWorkspaceLoadRequestId = 0;

type ElectronBridge = {
  getHostname?: () => Promise<string>;
  getSystemInfo?: () => Promise<unknown>;
};

type SystemInfoPayload = {
  machineUUID?: unknown;
  hostname?: unknown;
};

type DeviceIdentity = {
  primary: string | null;
  candidates: string[];
};

type LicenseRow = {
  id: string;
  is_used: boolean;
  is_revoked: boolean;
  computer_name?: string | null;
};

type LicenseValidationResult = {
  valid: boolean;
  revoked: boolean;
  restoreLicenseId: string | null;
};

type UserRow = {
  id: string;
  workspace_id?: string | null;
  name?: string | null;
  username?: string | null;
  color?: string | null;
  avatar_url?: string | null;
  status?: string | null;
  offline_reason?: string | null;
  last_seen?: string | null;
  created_at?: string | null;
};

type CategoryRow = {
  id: string;
  workspace_id: string;
  name?: string | null;
  color?: string | null;
  icon?: string | null;
  position?: number | null;
  is_collapsed?: boolean | null;
  wip_limit?: number | null;
};

type LabelRow = {
  id: string;
  workspace_id: string;
  name?: string | null;
  color?: string | null;
};

type TodoRow = {
  id: string;
  workspace_id: string;
  category_id: string;
  parent_id?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  position?: number | null;
  due_date?: string | null;
  start_date?: string | null;
  completed_at?: string | null;
  estimated_hours?: number | null;
  actual_hours?: number | null;
  progress?: number | null;
  is_recurring?: boolean | null;
  recurrence_pattern?: string | null;
  recurrence_rule?: unknown | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type TodoAssigneeRow = {
  id: string;
  todo_id: string;
  user_id: string;
  assigned_at?: string | null;
};

type TodoLabelRow = {
  id: string;
  todo_id: string;
  label_id: string;
};

type ChecklistItemRow = {
  id: string;
  todo_id: string;
  content?: string | null;
  is_completed?: boolean | null;
  position?: number | null;
  completed_at?: string | null;
  completed_by?: string | null;
};

type CommentRow = {
  id: string;
  todo_id: string;
  parent_id: string | null;
  content: string;
  is_edited: boolean;
  edited_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type AttachmentRow = {
  id: string;
  todo_id: string;
  comment_id: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  file_url: string;
  thumbnail_url: string | null;
  uploaded_by: string | null;
  created_at: string;
  expires_at: string | null;
};

type NotificationRow = {
  id: string;
  user_id: string;
  type?: string | null;
  title?: string | null;
  message?: string | null;
  link?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
  related_todo_id?: string | null;
};

const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your_supabase_url_here' &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'your_supabase_anon_key_here';

function randomHexColor(): string {
  return `#${Math.floor(Math.random() * 16777215)
    .toString(16)
    .padStart(6, '0')}`;
}

function slugifyName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_') || 'user';
}

function toNullableUuid(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(trimmed) ? trimmed : null;
}

function normalizeUserStatus(status: unknown): User['status'] {
  if (status === 'online' || status === 'away' || status === 'offline') {
    return status;
  }
  return 'online';
}

function normalizeTodoStatus(status: unknown): TodoStatus {
  if (status === 'review') {
    return 'in_review';
  }

  if (status === 'archived') {
    return 'cancelled';
  }

  if (
    status === 'todo' ||
    status === 'in_progress' ||
    status === 'in_review' ||
    status === 'blocked' ||
    status === 'done' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'todo';
}

function normalizeTodoPriority(priority: unknown): Todo['priority'] {
  if (
    priority === 'urgent' ||
    priority === 'high' ||
    priority === 'medium' ||
    priority === 'low' ||
    priority === 'none'
  ) {
    return priority;
  }
  return 'none';
}

function inferStatusFromCategoryName(name: string): TodoStatus {
  const normalized = name.toLocaleLowerCase('tr-TR');

  if (normalized.includes('tamam') || normalized.includes('done') || normalized.includes('bitti')) {
    return 'done';
  }

  if (normalized.includes('engel') || normalized.includes('blocked')) {
    return 'blocked';
  }

  if (normalized.includes('incele') || normalized.includes('review')) {
    return 'in_review';
  }

  if (
    normalized.includes('devam') ||
    normalized.includes('progress') ||
    normalized.includes('yapiliyor')
  ) {
    return 'in_progress';
  }

  return 'todo';
}

function normalizeDeviceIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'bilinmiyor' || normalized === 'unknown' || normalized === 'n/a') {
    return null;
  }

  return normalized;
}

function createDeviceCandidateList(machineUUID: string | null, hostname: string | null): DeviceIdentity {
  const candidates: string[] = [];

  if (machineUUID) {
    candidates.push(`machine:${machineUUID}`, machineUUID);
  }

  if (hostname) {
    candidates.push(`host:${hostname}`, hostname);
  }

  const deduplicatedCandidates = Array.from(new Set(candidates));
  return {
    primary: machineUUID ? `machine:${machineUUID}` : hostname ? `host:${hostname}` : null,
    candidates: deduplicatedCandidates,
  };
}

async function deriveDeviceIdentity(): Promise<DeviceIdentity> {
  if (typeof window === 'undefined') {
    return { primary: null, candidates: [] };
  }

  const electronApi = (window as Window & { electron?: ElectronBridge }).electron;
  let machineUUID: string | null = null;
  let hostname: string | null = null;

  try {
    if (electronApi?.getSystemInfo) {
      const info = (await electronApi.getSystemInfo()) as SystemInfoPayload;
      machineUUID = normalizeDeviceIdentifier(info?.machineUUID);
      hostname = normalizeDeviceIdentifier(info?.hostname);
    }
  } catch {
    // ignore
  }

  if (!hostname) {
    try {
      if (electronApi?.getHostname) {
        hostname = normalizeDeviceIdentifier(await electronApi.getHostname());
      }
    } catch {
      // ignore
    }
  }

  return createDeviceCandidateList(machineUUID, hostname);
}

function isLicenseBoundToCurrentDevice(
  licenseComputerName: string | null | undefined,
  deviceCandidates: string[]
): boolean {
  const normalizedLicenseBinding = normalizeDeviceIdentifier(licenseComputerName);
  if (!normalizedLicenseBinding || deviceCandidates.length === 0) {
    return false;
  }

  return deviceCandidates.some((candidate) => normalizeDeviceIdentifier(candidate) === normalizedLicenseBinding);
}

function saveUserToStorage(user: User | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function loadUserFromStorage(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function loadNotificationReadCache(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  try {
    const raw = localStorage.getItem(NOTIFICATION_READ_CACHE_KEY);

    if (!raw) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set<string>(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set<string>();
  }
}

function saveNotificationReadCache(cache: Set<string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (cache.size === 0) {
    localStorage.removeItem(NOTIFICATION_READ_CACHE_KEY);
    return;
  }

  localStorage.setItem(NOTIFICATION_READ_CACHE_KEY, JSON.stringify(Array.from(cache)));
}

function addNotificationReadCacheIds(ids: string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) {
    return;
  }

  const cache = loadNotificationReadCache();

  for (const id of ids) {
    const persistableId = toNullableUuid(id);

    if (persistableId) {
      cache.add(persistableId);
    }
  }

  saveNotificationReadCache(cache);
}

function removeNotificationReadCacheIds(ids: string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) {
    return;
  }

  const cache = loadNotificationReadCache();

  for (const id of ids) {
    cache.delete(id);
  }

  saveNotificationReadCache(cache);
}

function mapUserRow(row: UserRow): User {
  const fallbackName = row.username ?? 'User';
  const displayName = row.name?.trim() || fallbackName;
  return {
    id: row.id,
    username: slugifyName(displayName),
    display_name: displayName,
    avatar_color: row.color || randomHexColor(),
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    status: normalizeUserStatus(row.status),
    offline_reason: typeof row.offline_reason === 'string' ? row.offline_reason : null,
    last_seen: row.last_seen || new Date().toISOString(),
    created_at: row.created_at || new Date().toISOString(),
  };
}

function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name || 'Kategori',
    color: row.color || '#6b7280',
    icon: row.icon || 'folder',
    position: row.position ?? 0,
    is_collapsed: row.is_collapsed ?? false,
    wip_limit: row.wip_limit ?? null,
    todos: [],
  };
}

function mapLabelRow(row: LabelRow): Label {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name || 'Etiket',
    color: row.color || '#6b7280',
  };
}

function mapChecklistRow(row: ChecklistItemRow): ChecklistItem {
  return {
    id: row.id,
    todo_id: row.todo_id,
    content: row.content || '',
    is_completed: row.is_completed ?? false,
    position: row.position ?? 0,
    completed_at: row.completed_at ?? null,
    completed_by: row.completed_by ?? null,
  };
}

function mapNotificationRow(row: NotificationRow): Notification {
  const allowedType = ['mention', 'assignment', 'due_date', 'comment', 'status_change', 'reminder'];
  const type = allowedType.includes(String(row.type))
    ? (row.type as Notification['type'])
    : 'reminder';

  return {
    id: row.id,
    user_id: row.user_id,
    type,
    title: row.title || 'Bildirim',
    message: row.message || '',
    link: row.link ?? null,
    is_read: row.is_read ?? false,
    created_at: row.created_at || new Date().toISOString(),
    related_todo_id: row.related_todo_id ?? null,
  };
}

function createLocalStatusNotification(
  userId: string | null | undefined,
  title: string,
  message: string
): Notification {
  return {
    id: `local-status-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    user_id: userId?.trim() || 'local-user',
    type: 'status_change',
    title,
    message,
    link: null,
    is_read: false,
    created_at: new Date().toISOString(),
  };
}

function mapTodoRow(
  row: TodoRow,
  assignees: TodoAssignee[],
  labels: TodoLabel[],
  checklistItems: ChecklistItem[]
): Todo {
  const recurrencePattern =
    row.recurrence_pattern ??
    (row.recurrence_rule == null
      ? null
      : typeof row.recurrence_rule === 'string'
        ? row.recurrence_rule
        : typeof row.recurrence_rule === 'object'
          ? JSON.stringify(row.recurrence_rule)
          : String(row.recurrence_rule));

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    category_id: row.category_id,
    parent_id: row.parent_id ?? null,
    title: row.title || '',
    description: row.description || '',
    status: normalizeTodoStatus(row.status),
    priority: normalizeTodoPriority(row.priority),
    position: row.position ?? 0,
    due_date: row.due_date ?? null,
    start_date: row.start_date ?? null,
    completed_at: row.completed_at ?? null,
    estimated_hours: row.estimated_hours ?? null,
    actual_hours: row.actual_hours ?? null,
    progress: row.progress ?? 0,
    is_recurring: row.is_recurring ?? false,
    recurrence_pattern: recurrencePattern,
    created_by: row.created_by || '',
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
    assignees,
    labels,
    checklist_items: checklistItems,
    subtasks: [],
    comments: [],
    attachments: [],
    dependencies: [],
    time_entries: [],
  };
}

const savedUser = typeof window !== 'undefined' ? loadUserFromStorage() : null;

function checkLicenseActivated(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LICENSE_KEY_STORAGE) === 'true';
  } catch {
    return false;
  }
}
const isLicenseActivated = checkLicenseActivated();

async function checkLicenseValidOnServer(): Promise<LicenseValidationResult> {
  try {
    if (typeof window === 'undefined') {
      return { valid: true, revoked: false, restoreLicenseId: null };
    }

    const licenseActivated = localStorage.getItem(LICENSE_KEY_STORAGE);
    const licenseId = localStorage.getItem(LICENSE_ID_STORAGE);
    if (!isSupabaseConfigured) {
      return { valid: true, revoked: false, restoreLicenseId: null };
    }

    const deviceIdentity = await deriveDeviceIdentity();

    if (licenseActivated && licenseId) {
      const { data, error } = await supabase
        .from('licenses')
        .select('id, is_used, is_revoked, computer_name')
        .eq('id', licenseId)
        .maybeSingle();

      if (error || !data) {
        return { valid: true, revoked: false, restoreLicenseId: null };
      }

      if (data.is_revoked) {
        return { valid: false, revoked: true, restoreLicenseId: null };
      }

      if (!data.is_used) {
        return { valid: false, revoked: false, restoreLicenseId: null };
      }

      const validOnCurrentDevice = isLicenseBoundToCurrentDevice(data.computer_name, deviceIdentity.candidates);
      return {
        valid: validOnCurrentDevice,
        revoked: false,
        restoreLicenseId: validOnCurrentDevice ? data.id : null,
      };
    }

    if (deviceIdentity.candidates.length === 0) {
      return { valid: false, revoked: false, restoreLicenseId: null };
    }

    const { data: matches, error: restoreError } = await supabase
      .from('licenses')
      .select('id, is_used, is_revoked, computer_name')
      .in('computer_name', deviceIdentity.candidates)
      .eq('is_used', true)
      .eq('is_revoked', false)
      .order('activated_at', { ascending: false })
      .limit(5);

    if (restoreError || !matches || matches.length === 0) {
      return { valid: false, revoked: false, restoreLicenseId: null };
    }

    const matchedLicense = (matches as LicenseRow[]).find((row) =>
      isLicenseBoundToCurrentDevice(row.computer_name, deviceIdentity.candidates)
    );

    if (!matchedLicense) {
      return { valid: false, revoked: false, restoreLicenseId: null };
    }

    return { valid: true, revoked: false, restoreLicenseId: matchedLicense.id };
  } catch {
    return { valid: true, revoked: false, restoreLicenseId: null };
  }
}

interface WorkspaceState {
  currentUser: User | null;
  isLoggedIn: boolean;
  isLicensed: boolean;
  activateLicense: (key: string) => Promise<{ success: boolean; error?: string }>;
  checkLicenseValid: () => Promise<void>;
  subscribeToLicenseRevoke: () => (() => void) | void;
  login: (username: string) => Promise<void>;
  logout: () => void;
  updateUserStatus: (status: 'online' | 'away' | 'offline', offlineReason?: string | null) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  loadWorkspaceData: () => Promise<void>;

  users: User[];

  categories: Category[];
  addCategory: (name: string, color: string) => Promise<Category>;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (sourceIndex: number, destIndex: number) => void;

  todos: Todo[];
  addTodo: (todo: Partial<Todo>) => void;
  updateTodo: (id: string, updates: Partial<Todo>) => void;
  deleteTodo: (id: string) => void;
  moveTodo: (todoId: string, targetCategoryId: string, targetIndex: number) => void;
  reorderTodos: (categoryId: string, sourceIndex: number, destIndex: number) => void;

  labels: Label[];
  addLabel: (name: string, color: string) => Promise<void>;
  updateLabel: (id: string, updates: { name?: string; color?: string }) => Promise<void>;
  deleteLabel: (id: string) => Promise<void>;

  notifications: Notification[];
  prependNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  selectedTodo: Todo | null;
  setSelectedTodo: (todo: Todo | null) => void;
  isTodoModalOpen: boolean;
  setTodoModalOpen: (open: boolean) => void;
  isCreateTodoOpen: boolean;
  setCreateTodoOpen: (open: boolean) => void;
  createTodoCategoryId: string | null;
  setCreateTodoCategoryId: (id: string | null) => void;

  filterOptions: FilterOptions;
  setFilterOptions: (options: FilterOptions) => void;
  sortOptions: SortOptions;
  setSortOptions: (options: SortOptions) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentUser: savedUser,
  isLoggedIn: savedUser !== null,
  isLicensed: checkLicenseActivated(),

  activateLicense: async (key: string) => {
    if (!isSupabaseConfigured) return { success: false, error: 'Sunucu bağlantısı yok.' };

    const normalizedKey = key.trim().toUpperCase();
    const keyPattern = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
    if (!keyPattern.test(normalizedKey)) {
      return { success: false, error: 'Geçersiz lisans formatı.' };
    }

    const deviceIdentity = await deriveDeviceIdentity();

    // Check if license exists and can be used on this device
      const { data: license, error: fetchError } = await supabase
      .from('licenses')
      .select('id, is_used, is_revoked, computer_name')
      .eq('license_key', normalizedKey)
      .maybeSingle();

    if (fetchError) return { success: false, error: 'Sunucu hatası.' };
    if (!license) return { success: false, error: 'Lisans anahtarı bulunamadı.' };
    if (license.is_revoked) return { success: false, error: 'Bu lisans iptal edilmiş.' };
    if (license.is_used) {
      const isSameDevice = isLicenseBoundToCurrentDevice(license.computer_name, deviceIdentity.candidates);
      if (!isSameDevice) {
        return { success: false, error: 'Bu lisans zaten kullanılmış.' };
      }

      localStorage.setItem(LICENSE_KEY_STORAGE, 'true');
      localStorage.setItem(LICENSE_ID_STORAGE, license.id);
      set({ isLicensed: true });
      return { success: true };
    }

    // Collect device info
    const computerName = deviceIdentity.primary ?? 'Bilinmiyor';
    let ipAddress = 'Bilinmiyor';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const json = await res.json() as { ip: string };
      ipAddress = json.ip;
    } catch { /* ignore */ }

    // Mark license as used
    const { error: updateError } = await supabase
      .from('licenses')
      .update({
        is_used: true,
        activated_at: new Date().toISOString(),
        computer_name: computerName,
        ip_address: ipAddress,
      })
      .eq('id', license.id);

    if (updateError) return { success: false, error: 'Lisans aktive edilemedi.' };

    localStorage.setItem(LICENSE_KEY_STORAGE, 'true');
    localStorage.setItem(LICENSE_ID_STORAGE, license.id);
    set({ isLicensed: true });
    return { success: true };
  },

  checkLicenseValid: async () => {
    const validation = await checkLicenseValidOnServer();

    if (validation.valid && validation.restoreLicenseId) {
      localStorage.setItem(LICENSE_KEY_STORAGE, 'true');
      localStorage.setItem(LICENSE_ID_STORAGE, validation.restoreLicenseId);
      if (!get().isLicensed) {
        set({ isLicensed: true });
      }
      return;
    }

    if (!validation.valid) {
      // Delete user from DB when license is revoked
      const { currentUser } = get();
      if (validation.revoked && currentUser && isSupabaseConfigured) {
        void supabase.from('users').delete().eq('id', currentUser.id);
      }
      localStorage.removeItem(LICENSE_KEY_STORAGE);
      localStorage.removeItem(LICENSE_ID_STORAGE);
      localStorage.removeItem(STORAGE_KEY);
      set({ isLicensed: false, isLoggedIn: false, currentUser: null });
    }
  },

  subscribeToLicenseRevoke: () => {
    if (!isSupabaseConfigured) return;
    const licenseId = typeof window !== 'undefined' ? localStorage.getItem(LICENSE_ID_STORAGE) : null;
    if (!licenseId) return;

    // Remove existing channel if any
    const existingChannel = supabase.getChannels().find(c => c.topic.includes(`license-revoke-${licenseId}`));
    if (existingChannel) { void supabase.removeChannel(existingChannel); }

    const channel = supabase
      .channel(`license-revoke-${licenseId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'licenses',
        filter: `id=eq.${licenseId}`,
      }, (payload) => {
        const updated = payload.new as { is_revoked?: boolean };
        if (updated.is_revoked) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem(LICENSE_KEY_STORAGE);
            localStorage.removeItem(LICENSE_ID_STORAGE);
            localStorage.removeItem(STORAGE_KEY);
          }
          useWorkspaceStore.setState({ isLicensed: false, isLoggedIn: false, currentUser: null });
        }
      })
      .subscribe((status) => {
        console.log('[License] Realtime subscription status:', status);
      });

    return () => { void supabase.removeChannel(channel); };
  },

  login: async (username: string) => {
    const normalizedInput = username.trim();
    if (!normalizedInput) {
      return;
    }

    if (isSupabaseConfigured) {
      try {
        const loginResult = await supabaseLogin(normalizedInput);

        if (loginResult?.user_id) {
          const { data: userRow, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', loginResult.user_id)
            .maybeSingle();

          if (userError) {
            throw userError;
          }

          const user: User = userRow
            ? { ...mapUserRow(userRow as UserRow), status: 'online' }
            : {
                id: loginResult.user_id,
                username: slugifyName(loginResult.user_name || normalizedInput),
                display_name: loginResult.user_name || normalizedInput,
                avatar_color: randomHexColor(),
                avatar_url: null,
                status: 'online',
                offline_reason: null,
                last_seen: new Date().toISOString(),
                created_at: new Date().toISOString(),
              };

          saveUserToStorage(user);
          // Update license with user name, IP and computer name
          try {
            const licenseId = localStorage.getItem(LICENSE_ID_STORAGE);
            if (licenseId) {
              let ipAddress = '';
              try {
                const res = await fetch('https://api.ipify.org?format=json');
                const json = await res.json() as { ip: string };
                ipAddress = json.ip;
              } catch { /* ignore */ }

              let computerName = '';
              try {
                const deviceIdentity = await deriveDeviceIdentity();
                computerName = deviceIdentity.primary ?? '';
              } catch { /* ignore */ }

              const { error: licUpdateError } = await supabase
                .from('licenses')
                .update({
                  used_by_name: user.display_name,
                  ...(ipAddress ? { ip_address: ipAddress } : {}),
                  ...(computerName ? { computer_name: computerName } : {}),
                })
                .eq('id', licenseId);
              if (licUpdateError) console.warn('[License] update failed:', licUpdateError);
            }
          } catch (e) { console.warn('[License] update error:', e); }
          set((state) => ({
            currentUser: user,
            isLoggedIn: true,
            users: state.users.some((entry) => entry.id === user.id)
              ? state.users.map((entry) =>
                  entry.id === user.id ? { ...entry, ...user, status: 'online' } : entry
                )
              : [...state.users, user],
          }));

          await get().loadWorkspaceData();
          return;
        }
      } catch (error) {
        console.warn('Supabase login failed, falling back to local user mode:', error);
      }
    }

    const fallbackUser: User = {
      id: `user-${Date.now()}`,
      username: slugifyName(normalizedInput),
      display_name: normalizedInput,
      avatar_color: randomHexColor(),
      avatar_url: null,
      status: 'online',
      offline_reason: null,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    saveUserToStorage(fallbackUser);
    set({
      currentUser: fallbackUser,
      isLoggedIn: true,
      users: [fallbackUser],
      categories: [],
      labels: [],
      todos: [],
      notifications: [],
    });
  },

  logout: () => {
    saveUserToStorage(null);
    set({ currentUser: null, isLoggedIn: false });
  },

  updateUserStatus: async (status, offlineReason) => {
    const { currentUser } = get();
    if (!currentUser || !isSupabaseConfigured) return;
    // When going online, clear offline_reason. When going offline, set it.
    const newOfflineReason = status === 'online' ? null : (offlineReason ?? currentUser.offline_reason ?? null);
    const updates: Record<string, unknown> = { status, last_seen: new Date().toISOString(), offline_reason: newOfflineReason };
    const { error } = await supabase.from('users').update(updates).eq('id', currentUser.id);
    if (error) { console.warn('Failed to update user status:', error); return; }
    const updatedUser = { ...currentUser, status, offline_reason: newOfflineReason };
    set((state) => ({
      currentUser: updatedUser,
      users: state.users.map((u) => u.id === currentUser.id ? { ...u, status, offline_reason: newOfflineReason } : u),
    }));
    saveUserToStorage(updatedUser);
  },

  uploadAvatar: async (file: File) => {
    const { currentUser } = get();
    if (!currentUser || !isSupabaseConfigured) return;

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${currentUser.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) { console.warn('Avatar upload failed:', uploadError); return; }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: dbError } = await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);
    if (dbError) { console.warn('Avatar DB update failed:', dbError); return; }

    const updatedUser = { ...currentUser, avatar_url: avatarUrl };
    set((state) => ({
      currentUser: updatedUser,
      users: state.users.map((u) => u.id === currentUser.id ? { ...u, avatar_url: avatarUrl } : u),
    }));
    saveUserToStorage(updatedUser);
  },

  loadWorkspaceData: async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    const requestId = ++latestWorkspaceLoadRequestId;
    const isStaleRequest = () => requestId !== latestWorkspaceLoadRequestId;

    try {
      const { currentUser } = get();

      const [usersRes, categoriesRes, labelsRes, todosRes] = await Promise.all([
        supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: true }),
        supabase
          .from('categories')
          .select('*')
          .eq('workspace_id', DEFAULT_WORKSPACE_ID)
          .order('position', { ascending: true }),
        supabase
          .from('labels')
          .select('*')
          .eq('workspace_id', DEFAULT_WORKSPACE_ID)
          .order('name', { ascending: true }),
        supabase
          .from('todos')
          .select('*')
          .eq('workspace_id', DEFAULT_WORKSPACE_ID)
          .order('position', { ascending: true }),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (labelsRes.error) throw labelsRes.error;
      if (todosRes.error) throw todosRes.error;
      if (isStaleRequest()) {
        return;
      }

      let users = (usersRes.data as UserRow[]).map((row) => mapUserRow(row));
      const categories = (categoriesRes.data as CategoryRow[]).map((row) => mapCategoryRow(row));
      const labels = (labelsRes.data as LabelRow[]).map((row) => mapLabelRow(row));
      const todoRows = todosRes.data as TodoRow[];
      const todoIds = todoRows.map((row) => row.id);

      let effectiveCurrentUser: User | null = currentUser;
      let effectiveCurrentUserId = toNullableUuid(currentUser?.id);
      const needsUserReconciliation = effectiveCurrentUserId === null && currentUser !== null;

      if (needsUserReconciliation) {
        const normalizedCurrentDisplayName = currentUser.display_name
          .trim()
          .toLocaleLowerCase('tr-TR');
        const normalizedCurrentUsername = slugifyName(currentUser.username || currentUser.display_name || '');

        const matchedUser = users.find((user) => {
          const normalizedDisplayName = user.display_name.trim().toLocaleLowerCase('tr-TR');
          const normalizedUsername = slugifyName(user.username || user.display_name || '');

          const displayNameMatches =
            normalizedCurrentDisplayName.length > 0 && normalizedDisplayName === normalizedCurrentDisplayName;
          const usernameMatches =
            normalizedCurrentUsername.length > 0 && normalizedUsername === normalizedCurrentUsername;

          return displayNameMatches || usernameMatches;
        });

        if (matchedUser) {
          effectiveCurrentUser = matchedUser;
          effectiveCurrentUserId = toNullableUuid(matchedUser.id);
        } else {
          const loginCandidates = Array.from(
            new Set(
              [currentUser.display_name, currentUser.username]
                .map((value) => value?.trim() ?? '')
                .filter((value): value is string => value.length > 0)
            )
          );

          for (const candidate of loginCandidates) {
            try {
              const loginResult = await supabaseLogin(candidate);

              if (isStaleRequest()) {
                return;
              }

              if (!loginResult?.user_id) {
                continue;
              }

              const { data: userRow, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', loginResult.user_id)
                .maybeSingle();

              if (userError) {
                throw userError;
              }

              if (isStaleRequest()) {
                return;
              }

              const resolvedUser: User = userRow
                ? mapUserRow(userRow as UserRow)
                : {
                    id: loginResult.user_id,
                    username: slugifyName(loginResult.user_name || candidate),
                    display_name: loginResult.user_name || candidate,
                    avatar_color: randomHexColor(),
                    avatar_url: null,
                    status: 'online',
                    offline_reason: null,
                    last_seen: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                  };

              effectiveCurrentUser = resolvedUser;
              effectiveCurrentUserId = toNullableUuid(resolvedUser.id);

              if (
                effectiveCurrentUserId &&
                !users.some((user) => user.id === effectiveCurrentUserId)
              ) {
                users = [...users, resolvedUser];
              }

              break;
            } catch (error) {
              console.warn('Supabase user reconciliation failed for candidate, continuing:', error);
            }
          }
        }

        if (effectiveCurrentUser && effectiveCurrentUserId) {
          saveUserToStorage(effectiveCurrentUser);
        }
      }

      let assigneeRows: TodoAssigneeRow[] = [];
      let todoLabelRows: TodoLabelRow[] = [];
      let checklistRows: ChecklistItemRow[] = [];

      let commentRows: CommentRow[] = [];
      let attachmentRows: AttachmentRow[] = [];

      if (todoIds.length > 0) {
        const [assigneesRes, todoLabelsRes, checklistRes, commentsRes, attachmentsRes] = await Promise.all([
          supabase.from('todo_assignees').select('*').in('todo_id', todoIds),
          supabase.from('todo_labels').select('*').in('todo_id', todoIds),
          supabase.from('checklist_items').select('*').in('todo_id', todoIds).order('position', { ascending: true }),
          supabase.from('comments').select('id, todo_id, parent_id, content, is_edited, edited_at, created_by, created_at, updated_at').in('todo_id', todoIds).order('created_at', { ascending: true }),
          supabase.from('attachments').select('id, todo_id, comment_id, file_name, file_type, file_size, file_url, thumbnail_url, uploaded_by, created_at, expires_at').in('todo_id', todoIds).order('created_at', { ascending: true }),
        ]);

        if (assigneesRes.error) throw assigneesRes.error;
        if (todoLabelsRes.error) throw todoLabelsRes.error;
        if (checklistRes.error) throw checklistRes.error;
        if (commentsRes.error) console.warn('Failed to load comments:', commentsRes.error);
        if (attachmentsRes.error) console.warn('Failed to load attachments:', attachmentsRes.error);
        if (isStaleRequest()) {
          return;
        }

        assigneeRows = (assigneesRes.data ?? []) as TodoAssigneeRow[];
        todoLabelRows = (todoLabelsRes.data ?? []) as TodoLabelRow[];
        checklistRows = (checklistRes.data ?? []) as ChecklistItemRow[];
        commentRows = (!commentsRes.error ? (commentsRes.data ?? []) : []) as CommentRow[];
        attachmentRows = (!attachmentsRes.error ? (attachmentsRes.data ?? []) : []) as AttachmentRow[];
      }

      let notifications: Notification[] = [];
      if (effectiveCurrentUserId) {
        const notificationsRes = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', effectiveCurrentUserId)
          .order('created_at', { ascending: false });

        if (!notificationsRes.error) {
          const notificationReadCache = loadNotificationReadCache();
          const idsNeedingSync: string[] = [];

          notifications = ((notificationsRes.data ?? []) as NotificationRow[]).map((row) => {
            const mapped = mapNotificationRow(row);
            const isDbRead = row.is_read ?? false;

            if (notificationReadCache.has(row.id)) {
              mapped.is_read = true;

              if (isDbRead) {
                notificationReadCache.delete(row.id);
              } else {
                idsNeedingSync.push(row.id);
              }
            }

            return mapped;
          });

          saveNotificationReadCache(notificationReadCache);

          if (idsNeedingSync.length > 0) {
            const { data, error } = await supabase
              .from('notifications')
              .update({ is_read: true, read_at: new Date().toISOString() })
              .in('id', idsNeedingSync)
              .select('id');

            if (error) {
              console.warn('Failed to sync cached notification read status in Supabase:', error);
            } else if (!data || data.length === 0) {
              console.warn('No cached notification read status rows were updated in Supabase');
            } else {
              removeNotificationReadCacheIds(data.map((row) => row.id));
            }
          }
        }
      }

      if (isStaleRequest()) {
        return;
      }

      const usersById = new Map(users.map((user) => [user.id, user]));
      const labelsById = new Map(labels.map((label) => [label.id, label]));

      const assigneesByTodo = new Map<string, TodoAssignee[]>();
      for (const row of assigneeRows) {
        const mapped: TodoAssignee = {
          id: row.id,
          todo_id: row.todo_id,
          user_id: row.user_id,
          assigned_at: row.assigned_at || new Date().toISOString(),
          user: usersById.get(row.user_id),
        };

        const existing = assigneesByTodo.get(row.todo_id) || [];
        existing.push(mapped);
        assigneesByTodo.set(row.todo_id, existing);
      }

      const labelsByTodo = new Map<string, TodoLabel[]>();
      for (const row of todoLabelRows) {
        const mapped: TodoLabel = {
          id: row.id,
          todo_id: row.todo_id,
          label_id: row.label_id,
          label: labelsById.get(row.label_id),
        };

        const existing = labelsByTodo.get(row.todo_id) || [];
        existing.push(mapped);
        labelsByTodo.set(row.todo_id, existing);
      }

      const checklistByTodo = new Map<string, ChecklistItem[]>();
      for (const row of checklistRows) {
        const mapped = mapChecklistRow(row);
        const existing = checklistByTodo.get(row.todo_id) || [];
        existing.push(mapped);
        checklistByTodo.set(row.todo_id, existing);
      }

      const commentsByTodo = new Map<string, Comment[]>();
      for (const row of commentRows) {
        const mapped: Comment = {
          id: row.id,
          todo_id: row.todo_id,
          user_id: row.created_by || '',
          parent_id: row.parent_id,
          content: row.content,
          is_edited: row.is_edited || false,
          created_at: row.created_at,
          updated_at: row.updated_at,
          user: usersById.get(row.created_by || ''),
        };
        const existing = commentsByTodo.get(row.todo_id) || [];
        existing.push(mapped);
        commentsByTodo.set(row.todo_id, existing);
      }

      const attachmentsByTodo = new Map<string, Attachment[]>();
      for (const row of attachmentRows) {
        const mapped: Attachment = {
          id: row.id,
          todo_id: row.todo_id,
          file_name: row.file_name,
          file_type: row.file_type ?? '',
          file_size: row.file_size ?? 0,
          file_url: row.file_url,
          thumbnail_url: row.thumbnail_url,
          uploaded_by: row.uploaded_by ?? '',
          created_at: row.created_at,
          expires_at: row.expires_at ?? null,
        };
        const existing = attachmentsByTodo.get(row.todo_id) || [];
        existing.push(mapped);
        attachmentsByTodo.set(row.todo_id, existing);
      }

      const todos = todoRows.map((row) => {
        const mapped = mapTodoRow(
          row,
          assigneesByTodo.get(row.id) || [],
          labelsByTodo.get(row.id) || [],
          checklistByTodo.get(row.id) || []
        );
        mapped.comments = commentsByTodo.get(row.id) || [];
        mapped.attachments = attachmentsByTodo.get(row.id) || [];
        return mapped;
      });

      const categoriesWithTodos = categories.map((category) => ({
        ...category,
        todos: todos.filter((todo) => todo.category_id === category.id),
      }));

      set((state) => ({
        currentUser: effectiveCurrentUser ?? state.currentUser,
        isLoggedIn: (effectiveCurrentUser ?? state.currentUser) !== null,
        users,
        categories: categoriesWithTodos,
        labels,
        todos,
        notifications,
        selectedTodo: state.selectedTodo
          ? todos.find((todo) => todo.id === state.selectedTodo?.id) || null
          : null,
      }));
    } catch (error) {
      if (isStaleRequest()) {
        return;
      }
      console.warn('Failed to load workspace data from Supabase:', error);
    }
  },

  users: [],

  categories: [],
  addCategory: async (name, color) => {
    const localCategory: Category = {
      id: `cat-${Date.now()}`,
      workspace_id: DEFAULT_WORKSPACE_ID,
      name,
      color,
      icon: 'folder',
      position: get().categories.length,
      is_collapsed: false,
      wip_limit: null,
      todos: [],
    };

    if (!isSupabaseConfigured) {
      set((state) => ({ categories: [...state.categories, localCategory] }));
      return localCategory;
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({
        workspace_id: DEFAULT_WORKSPACE_ID,
        name,
        color,
        icon: 'folder',
        position: get().categories.length,
        is_collapsed: false,
        wip_limit: null,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.warn('Failed to create category in Supabase, using local state only:', error);
      set((state) => ({ categories: [...state.categories, localCategory] }));
      return localCategory;
    }

    const createdCategory = mapCategoryRow(data as CategoryRow);
    set((state) => ({ categories: [...state.categories, createdCategory] }));

    const currentUserId = toNullableUuid(get().currentUser?.id);
    void supabase.from('activity_logs').insert({
      workspace_id: DEFAULT_WORKSPACE_ID,
      todo_id: null,
      user_id: currentUserId,
      action: 'category_created',
      entity_type: 'category',
      entity_id: createdCategory.id,
      old_values: null,
      new_values: { name: createdCategory.name, color: createdCategory.color },
    });

    return createdCategory;
  },

  updateCategory: (id, updates) => {
    const previousCategories = get().categories;

    set((state) => ({
      categories: state.categories.map((category) =>
        category.id === id ? { ...category, ...updates } : category
      ),
    }));

    if (!isSupabaseConfigured) {
      return;
    }

    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.color !== undefined) payload.color = updates.color;
    if (updates.icon !== undefined) payload.icon = updates.icon;
    if (updates.position !== undefined) payload.position = updates.position;
    if (updates.is_collapsed !== undefined) payload.is_collapsed = updates.is_collapsed;
    if (updates.wip_limit !== undefined) payload.wip_limit = updates.wip_limit;

    void (async () => {
      const { data, error } = await supabase
        .from('categories')
        .update(payload)
        .eq('id', id)
        .select('id');

      if (error || !data || data.length === 0) {
        console.warn('Failed to update category in Supabase, rolling back local state:', error);
        set({ categories: previousCategories });
        return;
      }

      const currentUserId = toNullableUuid(get().currentUser?.id);
      const prevCategory = previousCategories.find((c) => c.id === id);

      if (updates.name !== undefined && updates.name !== prevCategory?.name) {
        void supabase.from('activity_logs').insert({
          workspace_id: DEFAULT_WORKSPACE_ID,
          todo_id: null,
          user_id: currentUserId,
          action: 'category_renamed',
          entity_type: 'category',
          entity_id: id,
          old_values: { name: prevCategory?.name },
          new_values: { name: updates.name },
        });
      }

      if (updates.color !== undefined && updates.color !== prevCategory?.color) {
        void supabase.from('activity_logs').insert({
          workspace_id: DEFAULT_WORKSPACE_ID,
          todo_id: null,
          user_id: currentUserId,
          action: 'category_color_changed',
          entity_type: 'category',
          entity_id: id,
          old_values: { color: prevCategory?.color, name: prevCategory?.name },
          new_values: { color: updates.color, name: prevCategory?.name },
        });
      }
    })();
  },

  deleteCategory: async (id) => {
    const currentUserId = toNullableUuid(get().currentUser?.id);
    const previousState = {
      categories: get().categories,
      todos: get().todos,
    };

    const categoryToDelete = get().categories.find((c) => c.id === id);

    set((state) => ({
      categories: state.categories.filter((category) => category.id !== id),
      todos: state.todos.filter((todo) => todo.category_id !== id),
    }));

    if (!isSupabaseConfigured) {
      get().prependNotification(
        createLocalStatusNotification(
          currentUserId,
          'Kategori silindi',
          'Kategori basariyla silindi.'
        )
      );
      return;
    }

    const { data, error } = await supabase.from('categories').delete().eq('id', id).select('id');

    if (error || !data || data.length === 0) {
      console.warn('Failed to delete category in Supabase, rolling back local state:', error);
      set(previousState);
      get().prependNotification(
        createLocalStatusNotification(
          currentUserId,
          'Kategori silinemedi',
          'Silme islemi basarisiz oldu, degisiklik geri alindi.'
        )
      );
      return;
    }

    void supabase.from('activity_logs').insert({
      workspace_id: DEFAULT_WORKSPACE_ID,
      todo_id: null,
      user_id: currentUserId,
      action: 'category_deleted',
      entity_type: 'category',
      entity_id: id,
      old_values: { name: categoryToDelete?.name },
      new_values: null,
    });

    get().prependNotification(
      createLocalStatusNotification(
        currentUserId,
        'Kategori silindi',
        'Kategori basariyla silindi.'
      )
    );
  },

  reorderCategories: (sourceIndex, destIndex) => {
    const previousCategories = get().categories;
    const reorderedCategories = [...previousCategories];
    const [removed] = reorderedCategories.splice(sourceIndex, 1);
    reorderedCategories.splice(destIndex, 0, removed);

    const categoriesWithPositions = reorderedCategories.map((category, position) => ({
      ...category,
      position,
    }));

    set({ categories: categoriesWithPositions });

    if (!isSupabaseConfigured) {
      return;
    }

    void (async () => {
      // Try single RPC call first; fall back to individual updates if RPC not available
      const categoryIds = categoriesWithPositions.map((c) => c.id);
      const { error: rpcError } = await supabase.rpc('reorder_categories', {
        p_workspace_id: DEFAULT_WORKSPACE_ID,
        p_category_ids: categoryIds,
      });

      if (!rpcError) {
        return;
      }

      // RPC not available — fall back to individual updates
      const updateResults = await Promise.all(
        categoriesWithPositions.map((category) =>
          supabase
            .from('categories')
            .update({ position: category.position })
            .eq('id', category.id)
            .select('id')
        )
      );

      const failedUpdate = updateResults.find(
        ({ data, error }) => error || !data || data.length === 0
      );

      if (failedUpdate) {
        console.warn(
          'Failed to persist category order in Supabase, rolling back local state:',
          failedUpdate.error
        );
        set({ categories: previousCategories });
      }
    })();
  },

  todos: [],
  addTodo: async (todoData) => {
    const state = get();
    const currentUser = state.currentUser;
    const currentUserId = toNullableUuid(currentUser?.id);
    const resolvedCategoryId =
      todoData.category_id || state.createTodoCategoryId || state.categories[0]?.id || '';

    if (!resolvedCategoryId) {
      return;
    }

    const status = todoData.status || 'todo';
    const position = state.todos.filter((todo) => todo.category_id === resolvedCategoryId).length;
    const now = new Date().toISOString();

    if (isSupabaseConfigured) {
      try {
        const todoInsertPayload = {
          workspace_id: DEFAULT_WORKSPACE_ID,
          category_id: resolvedCategoryId,
          parent_id: todoData.parent_id || null,
          title: todoData.title || '',
          description: todoData.description || '',
          status,
          priority: todoData.priority || 'none',
          position,
          due_date: todoData.due_date || null,
          start_date: todoData.start_date || null,
          completed_at: status === 'done' ? now : null,
          created_by: currentUserId,
        };

        const { data: insertedTodo, error: todoError } = await supabase
          .from('todos')
          .insert(todoInsertPayload)
          .select('*')
          .single();

        if (todoError || !insertedTodo) {
          throw todoError || new Error('Todo insert failed');
        }

        const todoId = insertedTodo.id;

        const assignees = (todoData.assignees || [])
          .map((assignee) => {
            const assigneeUserId = toNullableUuid(assignee.user_id);

            if (!assigneeUserId) {
              return null;
            }

            return {
              todo_id: todoId,
              user_id: assigneeUserId,
              assigned_at: assignee.assigned_at || now,
              assigned_by: currentUserId && currentUserId !== assigneeUserId ? currentUserId : null,
            };
          })
          .filter((assignee): assignee is {
            todo_id: string;
            user_id: string;
            assigned_at: string;
            assigned_by: string | null;
          } => assignee !== null);

        if (assignees.length > 0) {
          const { error } = await supabase.from('todo_assignees').insert(assignees);
          if (error) {
            console.warn('Failed to persist todo assignees in Supabase, continuing:', error);
          }
        }

        const todoLabels = (todoData.labels || []).map((label) => ({
          todo_id: todoId,
          label_id: label.label_id,
        }));

        if (todoLabels.length > 0) {
          const { error } = await supabase.from('todo_labels').insert(todoLabels);
          if (error) {
            console.warn('Failed to persist todo labels in Supabase, continuing:', error);
          }
        }

        const checklistItems = (todoData.checklist_items || []).map((item, index) => ({
          todo_id: todoId,
          content: item.content,
          is_completed: item.is_completed,
          position: item.position ?? index,
          completed_at: item.completed_at,
          completed_by: item.completed_by,
        }));

        if (checklistItems.length > 0) {
          const { error } = await supabase.from('checklist_items').insert(checklistItems);
          if (error) {
            console.warn('Failed to persist checklist items in Supabase, continuing:', error);
          }
        }

        const usersById = new Map(get().users.map((user) => [user.id, user]));
        const labelsById = new Map(get().labels.map((label) => [label.id, label]));
        const mappedAssignees: TodoAssignee[] = (todoData.assignees || []).reduce<TodoAssignee[]>(
          (acc, assignee, index) => {
            const assigneeUserId = toNullableUuid(assignee.user_id);

            if (!assigneeUserId) {
              return acc;
            }

            const user = usersById.get(assigneeUserId);
            acc.push({
              id: assignee.id || `assign-${todoId}-${index}`,
              todo_id: todoId,
              user_id: assigneeUserId,
              assigned_at: assignee.assigned_at || now,
              ...(user ? { user } : {}),
            });
            return acc;
          },
          []
        );

        const mappedLabels: TodoLabel[] = (todoData.labels || []).map((label, index) => ({
          id: label.id || `todo-label-${todoId}-${index}`,
          todo_id: todoId,
          label_id: label.label_id,
          label: labelsById.get(label.label_id),
        }));

        const mappedChecklist: ChecklistItem[] = (todoData.checklist_items || []).map((item, index) => ({
          id: item.id || `check-${todoId}-${index}`,
          todo_id: todoId,
          content: item.content,
          is_completed: item.is_completed,
          position: item.position ?? index,
          completed_at: item.completed_at,
          completed_by: item.completed_by,
        }));

        const newTodo = mapTodoRow(insertedTodo as TodoRow, mappedAssignees, mappedLabels, mappedChecklist);
        set((prev) => ({ todos: [...prev.todos, newTodo] }));
        return;
      } catch (error) {
        console.warn('Failed to persist todo in Supabase, using local state only:', error);
      }
    }

    const fallbackTodo: Todo = {
      id: `todo-${Date.now()}`,
      workspace_id: DEFAULT_WORKSPACE_ID,
      category_id: resolvedCategoryId,
      parent_id: todoData.parent_id || null,
      title: todoData.title || '',
      description: todoData.description || '',
      status,
      priority: todoData.priority || 'none',
      position,
      due_date: todoData.due_date || null,
      start_date: todoData.start_date || null,
      completed_at: status === 'done' ? now : null,
      estimated_hours: todoData.estimated_hours || null,
      actual_hours: todoData.actual_hours || null,
      progress: status === 'done' ? 100 : todoData.progress || 0,
      is_recurring: todoData.is_recurring || false,
      recurrence_pattern: todoData.recurrence_pattern || null,
      created_by: currentUser?.id?.trim() || '',
      created_at: now,
      updated_at: now,
      assignees: todoData.assignees || [],
      labels: todoData.labels || [],
      checklist_items: todoData.checklist_items || [],
      subtasks: [],
      comments: [],
      attachments: [],
      dependencies: [],
      time_entries: [],
    };

    set((prev) => ({ todos: [...prev.todos, fallbackTodo] }));
  },

  updateTodo: (id, updates) => {
    const now = new Date().toISOString();
    const previousTodo = get().todos.find((todo) => todo.id === id);
    const previousAssigneeUserIds = new Set((previousTodo?.assignees ?? []).map((a) => a.user_id));

    set((state) => ({
      todos: state.todos.map((todo) =>
        todo.id === id ? { ...todo, ...updates, updated_at: now } : todo
      ),
      selectedTodo:
        state.selectedTodo?.id === id ? { ...state.selectedTodo, ...updates, updated_at: now } : state.selectedTodo,
    }));

    if (!isSupabaseConfigured) {
      return;
    }

    const payload: Record<string, unknown> = { updated_at: now };
    const allowedKeys: Array<keyof Todo> = [
      'category_id',
      'parent_id',
      'title',
      'description',
      'status',
      'priority',
      'position',
      'due_date',
      'start_date',
      'completed_at',
    ];

    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        payload[key] = updates[key] as unknown;
      }
    }

    // recurrence_rule kolonu todos tablosunda yok, payload'a eklenmez

    void (async () => {
      const hasBaseTodoUpdate = Object.keys(payload).some((key) => key !== 'updated_at');
      const currentUserId = toNullableUuid(get().currentUser?.id);
      const todoTitle = updates.title ?? previousTodo?.title ?? '';

      const insertActivity = async (
        action: string,
        oldValues?: Record<string, unknown>,
        newValues?: Record<string, unknown>
      ) => {
        try {
          const { error: activityError } = await supabase.from('activity_logs').insert({
            workspace_id: DEFAULT_WORKSPACE_ID,
            todo_id: id,
            user_id: currentUserId,
            action,
            entity_type: 'todo',
            entity_id: id,
            old_values: oldValues,
            new_values: newValues,
          });

          if (activityError) {
            console.warn('Failed to insert activity log in Supabase:', activityError);
          }
        } catch (activityInsertError) {
          console.warn('Failed to insert activity log in Supabase:', activityInsertError);
        }
      };

      const nextAssignees = updates.assignees ?? [];
      const nextAssigneeUserIds = new Set(nextAssignees.map((assignee) => assignee.user_id));
      const toRemoveUserIds = [...previousAssigneeUserIds].filter(
        (userId) => !nextAssigneeUserIds.has(userId)
      );
      const toAddAssignees = nextAssignees.filter(
        (assignee) => !previousAssigneeUserIds.has(assignee.user_id)
      );

      const syncAssignees = async () => {
        if (updates.assignees === undefined) {
          return;
        }

        // Recompute fresh to ensure we have latest user id
        const freshCurrentUserId = toNullableUuid(get().currentUser?.id);

        try {
          if (toRemoveUserIds.length > 0) {
            const { error: removeError } = await supabase
              .from('todo_assignees')
              .delete()
              .eq('todo_id', id)
              .in('user_id', toRemoveUserIds);

            if (removeError) {
              console.warn('Failed to remove todo assignees in Supabase:', removeError);
            }
          }

          if (toAddAssignees.length > 0) {
            const rows = toAddAssignees
              .map((assignee) => {
                const assigneeUserId = toNullableUuid(assignee.user_id);

                if (!assigneeUserId) {
                  return null;
                }

                return {
                  todo_id: id,
                  user_id: assigneeUserId,
                  assigned_at: assignee.assigned_at ?? now,
                  assigned_by: freshCurrentUserId && freshCurrentUserId !== assigneeUserId ? freshCurrentUserId : null,
                };
              })
              .filter((row): row is {
                todo_id: string;
                user_id: string;
                assigned_at: string;
                assigned_by: string | null;
              } => row !== null);

            if (rows.length > 0) {
              const { error: insertError } = await supabase.from('todo_assignees').insert(rows);

              if (insertError) {
                console.warn('Failed to add todo assignees in Supabase:', insertError);
              }
              // Assignment notifications are generated server-side (DB triggers / realtime)
              // and delivered to the assigned user's notification channel.
              // Do NOT prepend notifications locally — this would push them to all users.
            }
          }
        } catch (assigneeError) {
          console.warn('Failed to sync todo assignees in Supabase:', assigneeError);
        }
      };

      const syncChecklist = async () => {
        if (updates.checklist_items === undefined) {
          return;
        }

        const newItems = updates.checklist_items;
        const prevItems = previousTodo?.checklist_items ?? [];

        // Identify temp IDs (local-only) vs real DB UUIDs
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isTempId = (itemId: string) => !uuidPattern.test(itemId);

        const prevById = new Map(prevItems.map((item) => [item.id, item]));
        const newById = new Map(newItems.map((item) => [item.id, item]));

        // Items to delete: present in prev with real UUID, absent in new list
        const toDelete = prevItems
          .filter((item) => !isTempId(item.id) && !newById.has(item.id))
          .map((item) => item.id);

        // Items to insert: temp IDs in new list
        const toInsert = newItems.filter((item) => isTempId(item.id));

        // Items to update: real UUIDs present in both; check for meaningful diff
        const toUpdate = newItems.filter((item) => {
          if (isTempId(item.id)) return false;
          const prev = prevById.get(item.id);
          if (!prev) return false;
          return (
            item.content !== prev.content ||
            item.is_completed !== prev.is_completed ||
            item.position !== prev.position ||
            item.completed_at !== prev.completed_at ||
            item.completed_by !== prev.completed_by
          );
        });

        try {
          if (toDelete.length > 0) {
            const { error } = await supabase
              .from('checklist_items')
              .delete()
              .in('id', toDelete);
            if (error) console.warn('Failed to delete checklist items:', error);
          }

          if (toUpdate.length > 0) {
            await Promise.all(
              toUpdate.map((item) =>
                supabase
                  .from('checklist_items')
                  .update({
                    content: item.content,
                    is_completed: item.is_completed,
                    position: item.position,
                    completed_at: item.completed_at ?? null,
                    completed_by: toNullableUuid(item.completed_by) ?? null,
                  })
                  .eq('id', item.id)
              )
            );
          }

          if (toInsert.length > 0) {
            const insertRows = toInsert.map((item) => ({
              todo_id: id,
              content: item.content,
              is_completed: item.is_completed,
              position: item.position,
              completed_at: item.completed_at ?? null,
              completed_by: toNullableUuid(item.completed_by) ?? null,
            }));

            const { data: inserted, error: insertError } = await supabase
              .from('checklist_items')
              .insert(insertRows)
              .select('id, content, is_completed, position, completed_at, completed_by, todo_id');

            if (insertError) {
              console.warn('Failed to insert checklist items:', insertError);
            } else if (inserted && inserted.length > 0) {
              // Remap temp IDs to real DB IDs in store state
              const insertedRows = inserted as ChecklistItemRow[];

              // Build a mapping: match by content + position in insertion order
              const tempToReal = new Map<string, string>();
              toInsert.forEach((tempItem, idx) => {
                const realRow = insertedRows[idx];
                if (realRow) {
                  tempToReal.set(tempItem.id, realRow.id);
                }
              });

              if (tempToReal.size > 0) {
                const remapChecklist = (items: ChecklistItem[]): ChecklistItem[] =>
                  items.map((item) => {
                    const realId = tempToReal.get(item.id);
                    if (!realId) return item;
                    return { ...item, id: realId };
                  });

                set((state) => ({
                  todos: state.todos.map((todo) =>
                    todo.id === id
                      ? { ...todo, checklist_items: remapChecklist(todo.checklist_items ?? []) }
                      : todo
                  ),
                  selectedTodo:
                    state.selectedTodo?.id === id
                      ? {
                          ...state.selectedTodo,
                          checklist_items: remapChecklist(state.selectedTodo.checklist_items ?? []),
                        }
                      : state.selectedTodo,
                }));
              }
            }
          }
        } catch (checklistError) {
          console.warn('Failed to sync checklist items:', checklistError);
        }
      };

      const logClientActivities = async () => {
        // status_changed: DB trigger handles via `updated`, do not insert client-side
        // priority_changed: DB trigger handles via `updated`, do not insert client-side
        // title_changed: DB trigger handles via `updated`, do not insert client-side

        if (updates.due_date !== undefined && updates.due_date !== previousTodo?.due_date) {
          await insertActivity(
            'due_date_changed',
            { due_date: previousTodo?.due_date, title: todoTitle },
            { due_date: updates.due_date, title: todoTitle }
          );
        }

        if (updates.description !== undefined && updates.description !== previousTodo?.description) {
          await insertActivity('description_changed', { title: todoTitle }, { title: todoTitle });
        }

        if (updates.checklist_items !== undefined) {
          const prevCount = previousTodo?.checklist_items?.length || 0;
          const newCount = updates.checklist_items?.length || 0;
          const prevCompleted = (previousTodo?.checklist_items ?? []).filter((item) => item.is_completed).length;
          const newCompleted = (updates.checklist_items ?? []).filter((item) => item.is_completed).length;

          if (newCount > prevCount) {
            await insertActivity(
              'checklist_added',
              { title: todoTitle, count: prevCount, completed_count: prevCompleted },
              { title: todoTitle, count: newCount, completed_count: newCompleted }
            );
          } else if (newCompleted !== prevCompleted) {
            await insertActivity(
              'checklist_completed',
              { title: todoTitle, count: prevCount, completed_count: prevCompleted },
              { title: todoTitle, count: newCount, completed_count: newCompleted }
            );
          }
        }

        if (updates.assignees !== undefined) {
          for (const assignee of toAddAssignees) {
            await insertActivity(
              'assignee_added',
              { title: todoTitle, assignee_user_id: null },
              { title: todoTitle, assignee_user_id: assignee.user_id }
            );
          }

          for (const removedUserId of toRemoveUserIds) {
            await insertActivity(
              'assignee_removed',
              { title: todoTitle, assignee_user_id: removedUserId },
              { title: todoTitle, assignee_user_id: null }
            );
          }
        }
      };

      if (!hasBaseTodoUpdate) {
        await syncAssignees();
        await syncChecklist();
        await logClientActivities();
        return;
      }

      const { data, error } = await supabase.from('todos').update(payload).eq('id', id).select('id');

      if (error || !data || data.length === 0) {
        console.warn('Failed to update todo in Supabase, rolling back local state:', error);
        set((state) => ({
          todos: state.todos.map((todo) => (todo.id === id ? (previousTodo ?? todo) : todo)),
          selectedTodo:
            state.selectedTodo?.id === id
              ? ((previousTodo as Todo | null | undefined) ?? state.selectedTodo)
              : state.selectedTodo,
        }));
        return;
      }

      await syncAssignees();
      await syncChecklist();
      await logClientActivities();
    })();
  },

  deleteTodo: (id) => {
    const currentUserId = toNullableUuid(get().currentUser?.id);
    const previousState = {
      todos: get().todos,
      selectedTodo: get().selectedTodo,
      isTodoModalOpen: get().isTodoModalOpen,
    };

    set((state) => ({
      todos: state.todos.filter((todo) => todo.id !== id),
      selectedTodo: state.selectedTodo?.id === id ? null : state.selectedTodo,
      isTodoModalOpen: state.selectedTodo?.id === id ? false : state.isTodoModalOpen,
    }));

    if (!isSupabaseConfigured) {
      get().prependNotification(
        createLocalStatusNotification(
          currentUserId,
          'Gorev silindi',
          'Gorev basariyla silindi.'
        )
      );
      return;
    }

    void (async () => {
      const { data: deleteData, error: deleteError } = await supabase
        .from('todos')
        .delete()
        .eq('id', id)
        .select('id');

      if (!deleteError) {
        get().prependNotification(
          createLocalStatusNotification(
            currentUserId,
            'Gorev silindi',
            'Gorev basariyla silindi.'
          )
        );
        return;
      }

      console.warn('Failed to delete todo in Supabase, rolling back local state:', deleteError);
      set(previousState);
      get().prependNotification(
        createLocalStatusNotification(
          currentUserId,
          'Gorev silinemedi',
          'Silme islemi basarisiz oldu, degisiklik geri alindi.'
        )
      );
    })();
  },

  moveTodo: (todoId, targetCategoryId, targetIndex) => {
    const now = new Date().toISOString();
    const previousTodos = get().todos;

    // Determine source category before mutation
    const sourceCategoryId = previousTodos.find((t) => t.id === todoId)?.category_id;

    // Build the new todos list atomically:
    // 1. Update the moved todo's category_id
    // 2. Reindex source category (excluding moved todo)
    // 3. Reindex target category (including moved todo at targetIndex)
    set((state) => {
      const movedTodo = state.todos.find((t) => t.id === todoId);
      if (!movedTodo) return state;

      const isMovingWithinCategory = movedTodo.category_id === targetCategoryId;

      // Build source category list (excluding moved todo) and reindex
      const sourceTodos = isMovingWithinCategory
        ? [] // handled as part of target reindex below
        : state.todos
            .filter((t) => t.category_id === movedTodo.category_id && t.id !== todoId)
            .sort((a, b) => a.position - b.position)
            .map((t, idx) => ({ ...t, position: idx }));

      // Build target category list (other todos) and splice moved todo in
      const otherTargetTodos = state.todos
        .filter((t) => t.category_id === targetCategoryId && t.id !== todoId)
        .sort((a, b) => a.position - b.position);

      const updatedMovedTodo = { ...movedTodo, category_id: targetCategoryId, updated_at: now };
      const reorderedTarget = [...otherTargetTodos];
      const clampedIndex = Math.min(Math.max(targetIndex, 0), reorderedTarget.length);
      reorderedTarget.splice(clampedIndex, 0, updatedMovedTodo);
      const targetTodos = reorderedTarget.map((t, idx) => ({ ...t, position: idx }));

      // Build a unified position map for all affected todos
      const positionMap = new Map<string, { position: number; category_id: string }>();
      for (const t of sourceTodos) {
        positionMap.set(t.id, { position: t.position, category_id: t.category_id });
      }
      for (const t of targetTodos) {
        positionMap.set(t.id, { position: t.position, category_id: t.category_id });
      }

      const updatedTodos = state.todos.map((t) => {
        const patch = positionMap.get(t.id);
        if (!patch) return t;
        return { ...t, position: patch.position, category_id: patch.category_id };
      });

      return { todos: updatedTodos };
    });

    if (!isSupabaseConfigured) {
      return;
    }

    void (async () => {
      const { data, error } = await supabase
        .from('todos')
        .update({
          category_id: targetCategoryId,
          position: targetIndex,
          updated_at: now,
        })
        .eq('id', todoId)
        .select('id');

      if (error || !data || data.length === 0) {
        console.warn('Failed to move todo in Supabase, rolling back local state:', error);
        set({ todos: previousTodos });
        return;
      }

      // After the move succeeds, reorder both source and target categories to persist
      // collision-free positions for all affected todos.
      const currentTodos = get().todos;

      const reorderCategory = async (categoryId: string) => {
        const ordered = currentTodos
          .filter((t) => t.category_id === categoryId)
          .sort((a, b) => a.position - b.position);
        const ids = ordered.map((t) => t.id);

        const { error: rpcError } = await supabase.rpc('reorder_todos', {
          p_category_id: categoryId,
          p_todo_ids: ids,
        });

        if (rpcError) {
          // RPC not available — fall back to individual position updates
          await Promise.all(
            ordered.map((todo) =>
              supabase
                .from('todos')
                .update({ position: todo.position })
                .eq('id', todo.id)
                .select('id')
            )
          );
        }
      };

      // Reorder target category
      await reorderCategory(targetCategoryId);

      // Reorder source category if different from target
      if (sourceCategoryId && sourceCategoryId !== targetCategoryId) {
        await reorderCategory(sourceCategoryId);
      }
    })();
  },

  reorderTodos: (categoryId, sourceIndex, destIndex) => {
    const previousTodos = get().todos;

    const categoryActiveTodos = previousTodos
      .filter(t => t.category_id === categoryId && t.status !== 'done')
      .sort((a, b) => a.position - b.position);

    const reordered = [...categoryActiveTodos];
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);

    const updatedWithPositions = reordered.map((todo, index) => ({
      ...todo,
      position: index,
    }));

    const updatedPositionMap = new Map(updatedWithPositions.map(t => [t.id, t.position]));

    set((state) => ({
      todos: state.todos.map(todo =>
        updatedPositionMap.has(todo.id)
          ? { ...todo, position: updatedPositionMap.get(todo.id)! }
          : todo
      ),
    }));

    if (!isSupabaseConfigured) return;

    void (async () => {
      // Try single RPC call first; fall back to individual updates if RPC not available
      const todoIds = updatedWithPositions.map((t) => t.id);
      const { error: rpcError } = await supabase.rpc('reorder_todos', {
        p_category_id: categoryId,
        p_todo_ids: todoIds,
      });

      if (!rpcError) {
        return;
      }

      // RPC not available — fall back to individual updates
      const updateResults = await Promise.all(
        updatedWithPositions.map(todo =>
          supabase
            .from('todos')
            .update({ position: todo.position })
            .eq('id', todo.id)
            .select('id')
        )
      );

      const failedUpdate = updateResults.find(
        ({ data, error }) => error || !data || data.length === 0
      );

      if (failedUpdate) {
        console.warn('Failed to reorder todos in Supabase, rolling back:', failedUpdate.error);
        set({ todos: previousTodos });
      }
    })();
  },

  labels: [],
  addLabel: async (name, color) => {
    const localLabel: Label = {
      id: `label-${Date.now()}`,
      workspace_id: DEFAULT_WORKSPACE_ID,
      name,
      color,
    };

    if (!isSupabaseConfigured) {
      set((state) => ({ labels: [...state.labels, localLabel] }));
      return;
    }

    const { data, error } = await supabase
      .from('labels')
      .insert({ workspace_id: DEFAULT_WORKSPACE_ID, name, color })
      .select('*')
      .single();

    if (error || !data) {
      console.warn('Failed to create label in Supabase:', error);
      return;
    }

    set((state) => ({ labels: [...state.labels, mapLabelRow(data as LabelRow)] }));
  },

  updateLabel: async (id, updates) => {
    const previousLabels = get().labels;

    // Optimistic update
    set((state) => ({
      labels: state.labels.map((l) => l.id === id ? { ...l, ...updates } : l),
    }));

    if (!isSupabaseConfigured) return;

    const { error } = await supabase
      .from('labels')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.warn('Failed to update label:', error);
      set({ labels: previousLabels });
    }
  },

  deleteLabel: async (id) => {
    const previousState = {
      labels: get().labels,
      todos: get().todos,
    };

    set((state) => ({
      labels: state.labels.filter((label) => label.id !== id),
      todos: state.todos.map((todo) => ({
        ...todo,
        labels: (todo.labels ?? []).filter((label) => label.label_id !== id),
      })),
    }));

    if (!isSupabaseConfigured) {
      return;
    }

    const { data, error } = await supabase.from('labels').delete().eq('id', id).select('id');

    if (error || !data || data.length === 0) {
      console.warn('Failed to delete label in Supabase, rolling back local state:', error);
      set(previousState);
    }
  },

  notifications: [],
  prependNotification: (notification) => {
    set((state) => {
      if (state.notifications.some((entry) => entry.id === notification.id)) {
        return state;
      }

      return {
        notifications: [notification, ...state.notifications],
      };
    });
  },
  markNotificationRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === id ? { ...notification, is_read: true } : notification
      ),
    }));

    const persistableId = toNullableUuid(id);

    if (!persistableId) {
      return;
    }

    addNotificationReadCacheIds([persistableId]);

    if (!isSupabaseConfigured) {
      return;
    }

    void (async () => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', persistableId)
        .select('id');

      if (error || !data || data.length === 0) {
        console.warn('Failed to persist notification read status in Supabase:', error ?? 'No rows updated');
        return;
      }

      removeNotificationReadCacheIds([persistableId]);
    })();
  },

  markAllNotificationsRead: () => {
    const unreadIds = get()
      .notifications.filter((notification) => !notification.is_read)
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      return;
    }

    set((state) => ({
      notifications: state.notifications.map((notification) => ({ ...notification, is_read: true })),
    }));

    const persistableUnreadIds = unreadIds
      .map(toNullableUuid)
      .filter((notificationId): notificationId is string => notificationId !== null);

    if (persistableUnreadIds.length === 0) {
      return;
    }

    addNotificationReadCacheIds(persistableUnreadIds);

    if (!isSupabaseConfigured) {
      return;
    }

    void (async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .in('id', persistableUnreadIds)
        .select('id');

      if (error) {
        console.warn('Failed to persist all notifications read status in Supabase:', error);
        return;
      }

      if (!data || data.length === 0) {
        console.warn('No notification rows were updated when marking all as read in Supabase');
        return;
      }

      removeNotificationReadCacheIds(data.map((row) => row.id));
    })();
  },

  selectedTodo: null,
  setSelectedTodo: (todo) => set({ selectedTodo: todo }),
  isTodoModalOpen: false,
  setTodoModalOpen: (open) => set({ isTodoModalOpen: open }),
  isCreateTodoOpen: false,
  setCreateTodoOpen: (open) => set({ isCreateTodoOpen: open }),
  createTodoCategoryId: null,
  setCreateTodoCategoryId: (id) => set({ createTodoCategoryId: id }),

  filterOptions: {},
  setFilterOptions: (options) => set({ filterOptions: options }),
  sortOptions: { field: 'position', direction: 'asc' },
  setSortOptions: (options) => set({ sortOptions: options }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
}));
