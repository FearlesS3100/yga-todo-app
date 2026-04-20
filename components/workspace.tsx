'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { KanbanBoard } from './kanban-board';
import { ListView } from './list-view';
import { MembersPanel } from './members-panel';
import { LabelsPanel } from './labels-panel';
import { AnalyticsPanel } from './analytics-panel';
import { ActivityPanel } from './activity-panel';
import { NotificationsPanel } from './notifications-panel';
import { CreateTodoModal } from './create-todo-modal';
import { TodoDetailModal } from './todo-detail-modal';
import { supabase } from '@/lib/supabase';
import { useWorkspaceStore } from '@/lib/store';
import type { Notification as AppNotification, Comment, Todo, TodoAssignee, TodoLabel, ChecklistItem, Attachment } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

const NOTIFICATION_TYPES: AppNotification['type'][] = [
  'mention',
  'assignment',
  'due_date',
  'comment',
  'status_change',
  'reminder',
];

const TODO_UUID_PATTERN =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const TODO_UUID_REGEX = new RegExp(TODO_UUID_PATTERN, 'i');

function resolveTodoIdFromNotificationLink(link: string | null | undefined): string | null {
  if (!link) {
    return null;
  }

  let normalizedLink = link;
  try {
    normalizedLink = decodeURIComponent(link);
  } catch {
    normalizedLink = link;
  }
  const queryMatch = normalizedLink.match(
    new RegExp(`[?&](?:todoId|todo_id|related_todo_id)=(${TODO_UUID_PATTERN})`, 'i')
  );

  if (queryMatch?.[1]) {
    return queryMatch[1];
  }

  const pathMatch = normalizedLink.match(new RegExp(`(?:todo|todos)/(${TODO_UUID_PATTERN})`, 'i'));

  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  if (!/todo/i.test(normalizedLink)) {
    return null;
  }

  const genericMatch = normalizedLink.match(TODO_UUID_REGEX);
  return genericMatch?.[0] ?? null;
}

function resolveNotificationTargetTodoId(notification: Pick<AppNotification, 'related_todo_id' | 'link'>): string | null {
  if (notification.related_todo_id && notification.related_todo_id.trim().length > 0) {
    return notification.related_todo_id;
  }

  return resolveTodoIdFromNotificationLink(notification.link);
}

function mapRealtimeNotification(payload: Record<string, unknown>): AppNotification | null {
  const id = typeof payload.id === 'string' ? payload.id : null;
  const userId = typeof payload.user_id === 'string' ? payload.user_id : null;

  if (!id || !userId) {
    return null;
  }

  const rawType = typeof payload.type === 'string' ? payload.type : 'reminder';
  const type = NOTIFICATION_TYPES.includes(rawType as AppNotification['type'])
    ? (rawType as AppNotification['type'])
    : 'reminder';

  return {
    id,
    user_id: userId,
    type,
    title: typeof payload.title === 'string' && payload.title.trim().length > 0 ? payload.title : 'Bildirim',
    message: typeof payload.message === 'string' ? payload.message : '',
    link: typeof payload.link === 'string' ? payload.link : null,
    is_read: Boolean(payload.is_read),
    created_at:
      typeof payload.created_at === 'string' && payload.created_at.trim().length > 0
        ? payload.created_at
        : new Date().toISOString(),
    related_todo_id:
      typeof payload.related_todo_id === 'string' ? payload.related_todo_id : null,
  };
}

function toEpoch(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortNotificationsByCreatedAtDesc(notifications: AppNotification[]): AppNotification[] {
  return [...notifications].sort((a, b) => toEpoch(b.created_at) - toEpoch(a.created_at));
}

const CORE_RECONCILIATION_GUARD_INTERVAL_MS = 6000;
const CORE_EVENT_STALE_THRESHOLD_MS = 20000;
const CORE_SAFETY_REFRESH_INTERVAL_MS = 60000;

export function Workspace() {
  const [activeTab, setActiveTab] = useState('board');
  const [view, setView] = useState<'kanban' | 'list' | 'calendar'>('kanban');
  const currentUserId = useWorkspaceStore((state) => state.currentUser?.id);
  const loadWorkspaceData = useWorkspaceStore((state) => state.loadWorkspaceData);
  const prependNotification = useWorkspaceStore((state) => state.prependNotification);
  const updateUserStatus = useWorkspaceStore((state) => state.updateUserStatus);
  const currentUserStatus = useWorkspaceStore((state) => state.currentUser?.status);
  const checkLicenseValid = useWorkspaceStore((state) => state.checkLicenseValid);
  const subscribeToLicenseRevoke = useWorkspaceStore((state) => state.subscribeToLicenseRevoke);
  const setSelectedTodo = useWorkspaceStore((state) => state.setSelectedTodo);
  const setTodoModalOpen = useWorkspaceStore((state) => state.setTodoModalOpen);
  const todos = useWorkspaceStore((state) => state.todos);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const shownNativeNotificationIdsRef = useRef<Set<string>>(new Set());
  const shownDueDateReminderIdsRef = useRef<Set<string>>(new Set());
  const workspaceRefreshTimeoutRef = useRef<number | null>(null);
  const workspaceFollowUpRefreshTimeoutRef = useRef<number | null>(null);
  const workspaceFastRefreshTimeoutRef = useRef<number | null>(null);
  const coreChannelHealthyRef = useRef<boolean>(true);
  const coreChannelLastEventAtRef = useRef<number>(Date.now());
  const coreChannelLastReconcileAtRef = useRef<number>(Date.now());

  const markCoreChannelEventSeen = useCallback(() => {
    coreChannelLastEventAtRef.current = Date.now();
  }, []);

  const scheduleWorkspaceRefresh = useCallback(() => {
    if (workspaceRefreshTimeoutRef.current !== null) {
      window.clearTimeout(workspaceRefreshTimeoutRef.current);
    }

    workspaceRefreshTimeoutRef.current = window.setTimeout(() => {
      workspaceRefreshTimeoutRef.current = null;
      void loadWorkspaceData();
    }, 250);
  }, [loadWorkspaceData]);

  const scheduleFollowUpWorkspaceRefresh = useCallback(() => {
    if (workspaceFollowUpRefreshTimeoutRef.current !== null) {
      window.clearTimeout(workspaceFollowUpRefreshTimeoutRef.current);
    }

    workspaceFollowUpRefreshTimeoutRef.current = window.setTimeout(() => {
      workspaceFollowUpRefreshTimeoutRef.current = null;
      void loadWorkspaceData();
    }, 900);
  }, [loadWorkspaceData]);

  const scheduleFastRefresh = useCallback(() => {
    if (workspaceFastRefreshTimeoutRef.current !== null) {
      window.clearTimeout(workspaceFastRefreshTimeoutRef.current);
    }
    workspaceFastRefreshTimeoutRef.current = window.setTimeout(() => {
      workspaceFastRefreshTimeoutRef.current = null;
      void loadWorkspaceData();
    }, 50);
  }, [loadWorkspaceData]);

  const showBrowserNotification = useCallback((title: string, body: string) => {
    try {
      if (typeof window === 'undefined' || !("Notification" in window)) {
        return;
      }

      const normalizedTitle = title.trim().length > 0 ? title.trim() : 'Yeni Bildirim';
      const normalizedBody = body;

      if (window.Notification.permission === 'granted') {
        new window.Notification(normalizedTitle, { body: normalizedBody });
        return;
      }

      if (window.Notification.permission === 'default') {
        void window.Notification.requestPermission()
          .then((permission) => {
            if (permission === 'granted') {
              new window.Notification(normalizedTitle, { body: normalizedBody });
            }
          })
          .catch((error) => {
            console.warn('Browser notification permission request failed', error);
          });
      }
    } catch (error) {
      console.warn('Browser notification failed', error);
    }
  }, []);

  const handleIncomingNotification = useCallback(
    (notification: AppNotification) => {
      prependNotification(notification);

      const targetTodoId = resolveNotificationTargetTodoId(notification);
      if (targetTodoId) {
        const hasTargetTodo = useWorkspaceStore.getState().todos.some((todo) => todo.id === targetTodoId);
        if (!hasTargetTodo) {
          scheduleWorkspaceRefresh();
        }
      }

      const shouldShowNativeNotification =
        (notification.type === 'assignment' || notification.type === 'mention') &&
        !shownNativeNotificationIdsRef.current.has(notification.id);

      if (!shouldShowNativeNotification) {
        return;
      }

      if (window.electron?.showNotification) {
        window.electron.showNotification({
          title: notification.title || 'Yeni Bildirim',
          body: notification.message || '',
          todoId: targetTodoId ?? undefined,
        });
      } else {
        showBrowserNotification(notification.title || 'Yeni Bildirim', notification.message || '');
      }

      shownNativeNotificationIdsRef.current.add(notification.id);
    },
    [prependNotification, scheduleWorkspaceRefresh, showBrowserNotification]
  );

  // Due date reminders
  useEffect(() => {
    if (!currentUserId) return;

    const STORAGE_KEY_REMINDERS = 'workspace_due_reminders_shown';

    const loadShownIds = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_REMINDERS);
        const today = new Date().toDateString();
        const parsed = raw ? JSON.parse(raw) as { date: string; ids: string[] } : null;
        // Reset every day so reminders fire again next day
        if (parsed?.date === today) {
          shownDueDateReminderIdsRef.current = new Set(parsed.ids);
        } else {
          shownDueDateReminderIdsRef.current = new Set();
          localStorage.setItem(STORAGE_KEY_REMINDERS, JSON.stringify({ date: today, ids: [] }));
        }
      } catch {
        shownDueDateReminderIdsRef.current = new Set();
      }
    };

    const saveShownId = (id: string) => {
      shownDueDateReminderIdsRef.current.add(id);
      try {
        const today = new Date().toDateString();
        localStorage.setItem(STORAGE_KEY_REMINDERS, JSON.stringify({
          date: today,
          ids: [...shownDueDateReminderIdsRef.current],
        }));
      } catch { /* ignore */ }
    };

    const checkDueDates = () => {
      const storeState = useWorkspaceStore.getState();
      const allTodos = storeState.todos;
      const activeUserId = storeState.currentUser?.id;
      const now = new Date();
      const todayStr = now.toDateString();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toDateString();

      for (const todo of allTodos) {
        if (!todo.due_date || todo.status === 'done' || todo.status === 'cancelled') continue;

        // Only notify the current user if they are the creator or an assignee
        if (activeUserId) {
          const isCreator = todo.created_by === activeUserId;
          const isAssignee = todo.assignees?.some((a) => a.user_id === activeUserId) ?? false;
          if (!isCreator && !isAssignee) continue;
        }

        const reminderId = `${todo.id}-${todayStr}`;
        if (shownDueDateReminderIdsRef.current.has(reminderId)) continue;

        const dueDate = new Date(todo.due_date);
        const dueDateStr = dueDate.toDateString();

        let message: string | null = null;

        if (dueDateStr === todayStr) {
          message = `Bugün son gün: ${todo.title}`;
        } else if (dueDateStr === tomorrowStr) {
          message = `Yarın son gün: ${todo.title}`;
        } else if (dueDate < now) {
          message = `Gecikmiş görev: ${todo.title}`;
        }

        if (!message) continue;

        if (window.electron?.showNotification) {
          window.electron.showNotification({
            title: 'Görev Hatırlatıcı',
            body: message,
            todoId: todo.id,
          });
        } else {
          showBrowserNotification('Görev Hatırlatıcı', message);
        }

        saveShownId(reminderId);
      }
    };

    loadShownIds();
    // Check on mount and every 10 minutes
    checkDueDates();
    const interval = window.setInterval(checkDueDates, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [currentUserId, showBrowserNotification]);

  // Presence: online when window focused/visible, away when in tray, offline when app closes
  useEffect(() => {
    if (!currentUserId) return;

    // Set online immediately
    void updateUserStatus('online');

    // Heartbeat: update last_seen every 30s while visible
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', currentUserId);
      }
    }, 30000);

    // Primary: visibilitychange (works for tab switches and most minimize cases)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Update last_seen but keep status as online (tray = still "last seen X ago")
        void supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', currentUserId);
      } else {
        // Pencere tekrar aktif olduğunda kapatma dialogunu ve sebebi sıfırla
        setShowCloseDialog(false);
        setCloseReason('');
        void updateUserStatus('online');
      }
    };

    // Bug 3 fix: visibilitychange is unreliable in Electron when the window is
    // restored from the system tray. window focus/blur are fired reliably in
    // Electron and act as a supplemental signal.
    const handleWindowFocus = () => {
      void updateUserStatus('online');
    };

    // Don't set offline on blur — only on explicit close (via the close dialog).
    // Just update last_seen so other users see an accurate "last seen" timestamp.
    const handleWindowBlur = () => {
      void supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', currentUserId);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [currentUserId, updateUserStatus]);

  // Workspace realtime sync for core tables
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const now = Date.now();
    coreChannelHealthyRef.current = true;
    coreChannelLastEventAtRef.current = now;
    coreChannelLastReconcileAtRef.current = now;

    // Fast local patch for comment events — avoids full reload for comment changes
    const applyCommentPatch = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: Record<string, unknown>
    ) => {
      if (eventType === 'INSERT') {
        const store = useWorkspaceStore.getState();
        const row = payload as {
          id: string;
          todo_id: string;
          content: string;
          created_by: string | null;
          parent_id: string | null;
          is_edited: boolean;
          created_at: string;
          updated_at: string;
        };
        if (!row.id || !row.todo_id) return false;

        const todo = store.todos.find((t) => t.id === row.todo_id);
        if (!todo) return false;

        // Dedupe by id
        if (todo.comments?.some((c) => c.id === row.id)) return true;

        const usersById = new Map(store.users.map((u) => [u.id, u]));
        const newComment: Comment = {
          id: row.id,
          todo_id: row.todo_id,
          user_id: row.created_by ?? '',
          parent_id: row.parent_id ?? null,
          content: row.content ?? '',
          is_edited: row.is_edited ?? false,
          created_at: row.created_at,
          updated_at: row.updated_at,
          user: usersById.get(row.created_by ?? ''),
        };

        const updatedComments = [...(todo.comments ?? []), newComment];
        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === row.todo_id ? { ...t, comments: updatedComments } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === row.todo_id
              ? { ...state.selectedTodo, comments: updatedComments }
              : state.selectedTodo,
        }));
        return true;
      }

      if (eventType === 'UPDATE') {
        const store = useWorkspaceStore.getState();
        const row = payload as {
          id: string;
          todo_id: string;
          content: string;
          is_edited: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          parent_id: string | null;
        };
        if (!row.id || !row.todo_id) return false;

        const todo = store.todos.find((t) => t.id === row.todo_id);
        if (!todo) return false;

        const updatedComments = (todo.comments ?? []).map((c) =>
          c.id === row.id
            ? { ...c, content: row.content, is_edited: row.is_edited, updated_at: row.updated_at }
            : c
        );
        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === row.todo_id ? { ...t, comments: updatedComments } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === row.todo_id
              ? { ...state.selectedTodo, comments: updatedComments }
              : state.selectedTodo,
        }));
        return true;
      }

      if (eventType === 'DELETE') {
        const store = useWorkspaceStore.getState();
        const row = payload as { id?: string; todo_id?: string };
        if (!row.id) return false;

        // Search all todos for this comment
        const todoWithComment = store.todos.find((t) =>
          t.comments?.some((c) => c.id === row.id)
        );
        const todoId = row.todo_id ?? todoWithComment?.id;
        if (!todoId) return false;

        const todo = store.todos.find((t) => t.id === todoId);
        if (!todo) return false;

        const updatedComments = (todo.comments ?? []).filter((c) => c.id !== row.id);
        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === todoId ? { ...t, comments: updatedComments } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === todoId
              ? { ...state.selectedTodo, comments: updatedComments }
              : state.selectedTodo,
        }));
        return true;
      }

      return false;
    };

    // ── Surgical patch helpers ──────────────────────────────────────────────

    /**
     * Patch todos table changes directly in the store without a full reload.
     * For INSERT, builds a minimal Todo immediately and fetches relations async.
     * Returns true if applied, false if fallback reload is needed.
     */
    const applyTodoPatch = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: Record<string, unknown>
    ): boolean => {
      if (eventType === 'INSERT') {
        const store = useWorkspaceStore.getState();
        const row = payload as {
          id?: string;
          workspace_id?: string;
          category_id?: string;
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
          recurrence_rule?: unknown;
          created_by?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        if (!row.id || !row.category_id) return false;
        // Dedupe
        if (store.todos.some((t) => t.id === row.id)) return true;

        const newTodo: Todo = {
          id: row.id,
          workspace_id: row.workspace_id ?? '',
          category_id: row.category_id,
          parent_id: row.parent_id ?? null,
          title: row.title ?? '',
          description: row.description ?? '',
          status: (() => {
            const s = row.status;
            if (s === 'todo' || s === 'in_progress' || s === 'in_review' || s === 'blocked' || s === 'done' || s === 'cancelled') return s;
            if (s === 'review') return 'in_review';
            if (s === 'archived') return 'cancelled';
            return 'todo';
          })(),
          priority: (() => {
            const p = row.priority;
            if (p === 'urgent' || p === 'high' || p === 'medium' || p === 'low' || p === 'none') return p;
            return 'none';
          })(),
          position: row.position ?? 0,
          due_date: row.due_date ?? null,
          start_date: row.start_date ?? null,
          completed_at: row.completed_at ?? null,
          estimated_hours: row.estimated_hours ?? null,
          actual_hours: row.actual_hours ?? null,
          progress: row.progress ?? 0,
          is_recurring: row.is_recurring ?? false,
          recurrence_pattern: row.recurrence_pattern ?? null,
          created_by: row.created_by ?? '',
          created_at: row.created_at ?? new Date().toISOString(),
          updated_at: row.updated_at ?? new Date().toISOString(),
          assignees: [],
          labels: [],
          checklist_items: [],
          subtasks: [],
          comments: [],
          attachments: [],
          dependencies: [],
          time_entries: [],
        };

        useWorkspaceStore.setState((state) => ({
          todos: [...state.todos, newTodo],
        }));

        // Background fetch of relations for this new todo
        void (async () => {
          const todoId = row.id!;
          const [assigneesRes, labelsRes, checklistRes, commentsRes, attachmentsRes] = await Promise.all([
            supabase.from('todo_assignees').select('*').eq('todo_id', todoId),
            supabase.from('todo_labels').select('*').eq('todo_id', todoId),
            supabase.from('checklist_items').select('*').eq('todo_id', todoId).order('position', { ascending: true }),
            supabase.from('comments').select('id, todo_id, parent_id, content, is_edited, edited_at, created_by, created_at, updated_at').eq('todo_id', todoId).order('created_at', { ascending: true }),
            supabase.from('attachments').select('id, todo_id, comment_id, file_name, file_type, file_size, file_url, thumbnail_url, uploaded_by, created_at, expires_at').eq('todo_id', todoId).order('created_at', { ascending: true }),
          ]);

          const freshStore = useWorkspaceStore.getState();
          const usersById = new Map(freshStore.users.map((u) => [u.id, u]));
          const labelsById = new Map(freshStore.labels.map((l) => [l.id, l]));

          const assignees: TodoAssignee[] = (assigneesRes.data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            todo_id: r.todo_id as string,
            user_id: r.user_id as string,
            assigned_at: (r.assigned_at as string | null) ?? new Date().toISOString(),
            user: usersById.get(r.user_id as string),
          }));

          const labels: TodoLabel[] = (labelsRes.data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            todo_id: r.todo_id as string,
            label_id: r.label_id as string,
            label: labelsById.get(r.label_id as string),
          }));

          const checklistItems: ChecklistItem[] = (checklistRes.data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            todo_id: r.todo_id as string,
            content: (r.content as string | null) ?? '',
            is_completed: (r.is_completed as boolean | null) ?? false,
            position: (r.position as number | null) ?? 0,
            completed_at: (r.completed_at as string | null) ?? null,
            completed_by: (r.completed_by as string | null) ?? null,
          }));

          const comments: Comment[] = (commentsRes.data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            todo_id: r.todo_id as string,
            user_id: (r.created_by as string | null) ?? '',
            parent_id: (r.parent_id as string | null) ?? null,
            content: (r.content as string) ?? '',
            is_edited: (r.is_edited as boolean | null) ?? false,
            created_at: r.created_at as string,
            updated_at: r.updated_at as string,
            user: usersById.get((r.created_by as string | null) ?? ''),
          }));

          const attachments: Attachment[] = (attachmentsRes.data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            todo_id: r.todo_id as string,
            file_name: r.file_name as string,
            file_type: (r.file_type as string | null) ?? '',
            file_size: (r.file_size as number | null) ?? 0,
            file_url: r.file_url as string,
            thumbnail_url: (r.thumbnail_url as string | null) ?? null,
            uploaded_by: (r.uploaded_by as string | null) ?? '',
            created_at: r.created_at as string,
            expires_at: (r.expires_at as string | null) ?? null,
          }));

          useWorkspaceStore.setState((state) => {
            const currentTodo = state.todos.find(t => t.id === todoId);
            if (!currentTodo) return state; // todo was deleted while fetching

            return {
              todos: state.todos.map((t) =>
                t.id === todoId
                  ? {
                      ...t,
                      // Only update relations if the fetched data is more complete
                      assignees: assignees.length >= (t.assignees?.length ?? 0) ? assignees : t.assignees,
                      labels: labels.length >= (t.labels?.length ?? 0) ? labels : t.labels,
                      checklist_items: checklistItems.length >= (t.checklist_items?.length ?? 0) ? checklistItems : t.checklist_items,
                      comments: comments.length >= (t.comments?.length ?? 0) ? comments : t.comments,
                      attachments: attachments.length >= (t.attachments?.length ?? 0) ? attachments : t.attachments,
                    }
                  : t
              ),
              selectedTodo:
                state.selectedTodo?.id === todoId
                  ? {
                      ...state.selectedTodo,
                      assignees: assignees.length >= (state.selectedTodo.assignees?.length ?? 0) ? assignees : state.selectedTodo.assignees,
                      labels: labels.length >= (state.selectedTodo.labels?.length ?? 0) ? labels : state.selectedTodo.labels,
                      checklist_items: checklistItems.length >= (state.selectedTodo.checklist_items?.length ?? 0) ? checklistItems : state.selectedTodo.checklist_items,
                      comments: comments.length >= (state.selectedTodo.comments?.length ?? 0) ? comments : state.selectedTodo.comments,
                      attachments: attachments.length >= (state.selectedTodo.attachments?.length ?? 0) ? attachments : state.selectedTodo.attachments,
                    }
                  : state.selectedTodo,
            };
          });
        })();

        return true;
      }

      if (eventType === 'UPDATE') {
        const store = useWorkspaceStore.getState();
        const row = payload as Record<string, unknown>;
        const id = row.id as string | undefined;
        if (!id) return false;

        const existing = store.todos.find((t) => t.id === id);
        if (!existing) return false;

        // With REPLICA IDENTITY FULL, all columns are present. But guard
        // against null/undefined wiping valid relational keys.
        const safeCategoryId = (typeof row.category_id === 'string' && row.category_id)
          ? row.category_id
          : existing.category_id;

        const normalizeStatus = (s: unknown): Todo['status'] => {
          if (s === 'todo' || s === 'in_progress' || s === 'in_review' || s === 'blocked' || s === 'done' || s === 'cancelled') return s;
          if (s === 'review') return 'in_review';
          if (s === 'archived') return 'cancelled';
          return existing.status;
        };

        const normalizePriority = (p: unknown): Todo['priority'] => {
          if (p === 'urgent' || p === 'high' || p === 'medium' || p === 'low' || p === 'none') return p;
          return existing.priority;
        };

        const updatedTodo: Todo = {
          ...existing,
          category_id: safeCategoryId,
          parent_id: row.parent_id !== undefined ? (row.parent_id as string | null) : existing.parent_id,
          title: typeof row.title === 'string' ? row.title : existing.title,
          description: typeof row.description === 'string' ? row.description : existing.description,
          status: row.status !== undefined ? normalizeStatus(row.status) : existing.status,
          priority: row.priority !== undefined ? normalizePriority(row.priority) : existing.priority,
          position: typeof row.position === 'number' ? row.position : existing.position,
          due_date: row.due_date !== undefined ? (row.due_date as string | null) : existing.due_date,
          start_date: row.start_date !== undefined ? (row.start_date as string | null) : existing.start_date,
          completed_at: row.completed_at !== undefined ? (row.completed_at as string | null) : existing.completed_at,
          estimated_hours: row.estimated_hours !== undefined ? (row.estimated_hours as number | null) : existing.estimated_hours,
          actual_hours: row.actual_hours !== undefined ? (row.actual_hours as number | null) : existing.actual_hours,
          progress: typeof row.progress === 'number' ? row.progress : existing.progress,
          is_recurring: typeof row.is_recurring === 'boolean' ? row.is_recurring : existing.is_recurring,
          recurrence_pattern: row.recurrence_pattern !== undefined ? (row.recurrence_pattern as string | null) : existing.recurrence_pattern,
          updated_at: typeof row.updated_at === 'string' ? row.updated_at : existing.updated_at,
          // Preserve relations — never overwrite from scalar payload
          assignees: existing.assignees,
          labels: existing.labels,
          checklist_items: existing.checklist_items,
          comments: existing.comments,
          attachments: existing.attachments,
          subtasks: existing.subtasks,
          dependencies: existing.dependencies,
          time_entries: existing.time_entries,
        };

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) => (t.id === id ? updatedTodo : t)),
          selectedTodo:
            state.selectedTodo?.id === id
              ? { ...state.selectedTodo, ...updatedTodo }
              : state.selectedTodo,
        }));
        return true;
      }

      if (eventType === 'DELETE') {
        const row = payload as { id?: string };
        if (!row.id) return false;

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.filter((t) => t.id !== row.id),
          selectedTodo: state.selectedTodo?.id === row.id ? null : state.selectedTodo,
          isTodoModalOpen: state.selectedTodo?.id === row.id ? false : state.isTodoModalOpen,
        }));
        return true;
      }

      return false;
    };

    /**
     * Patch todo_assignees changes directly in the matching todo in the store.
     */
    const applyTodoAssigneePatch = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: Record<string, unknown>
    ): boolean => {
      const row = payload as {
        id?: string;
        todo_id?: string;
        user_id?: string;
        assigned_at?: string | null;
      };

      if (eventType === 'INSERT') {
        const store = useWorkspaceStore.getState();
        if (!row.todo_id) return false;
        const todo = store.todos.find((t) => t.id === row.todo_id);
        if (!todo) return false;
        if (!row.id || !row.user_id) return false;
        // Dedupe
        if ((todo.assignees ?? []).some((a) => a.id === row.id)) return true;

        const usersById = new Map(store.users.map((u) => [u.id, u]));
        const newAssignee: TodoAssignee = {
          id: row.id,
          todo_id: row.todo_id!,
          user_id: row.user_id,
          assigned_at: row.assigned_at ?? new Date().toISOString(),
          user: usersById.get(row.user_id),
        };
        const updatedAssignees = [...(todo.assignees ?? []), newAssignee];

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === row.todo_id ? { ...t, assignees: updatedAssignees } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === row.todo_id
              ? { ...state.selectedTodo, assignees: updatedAssignees }
              : state.selectedTodo,
        }));
        return true;
      }

      if (eventType === 'DELETE') {
        const store = useWorkspaceStore.getState();
        const assigneeId = row.id;
        if (!assigneeId) return false;

        // If todo_id missing (REPLICA IDENTITY DEFAULT), search all todos
        let todoId = row.todo_id;
        if (!todoId) {
          const found = store.todos.find((t) => t.assignees?.some((a) => a.id === assigneeId));
          todoId = found?.id;
        }
        if (!todoId) return false;

        const targetTodo = store.todos.find((t) => t.id === todoId);
        const updatedAssignees = (targetTodo?.assignees ?? []).filter((a) => a.id !== assigneeId);

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === todoId ? { ...t, assignees: updatedAssignees } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === todoId
              ? { ...state.selectedTodo, assignees: updatedAssignees }
              : state.selectedTodo,
        }));
        return true;
      }

      return false;
    };

    /**
     * Patch todo_labels changes directly in the matching todo in the store.
     */
    const applyTodoLabelPatch = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: Record<string, unknown>
    ): boolean => {
      const row = payload as {
        id?: string;
        todo_id?: string;
        label_id?: string;
      };

      if (eventType === 'INSERT') {
        const store = useWorkspaceStore.getState();
        if (!row.todo_id) return false;
        const todo = store.todos.find((t) => t.id === row.todo_id);
        if (!todo) return false;
        if (!row.id || !row.label_id) return false;
        // Dedupe
        if ((todo.labels ?? []).some((l) => l.id === row.id)) return true;

        const labelsById = new Map(store.labels.map((l) => [l.id, l]));
        const newLabel: TodoLabel = {
          id: row.id,
          todo_id: row.todo_id!,
          label_id: row.label_id,
          label: labelsById.get(row.label_id),
        };
        const updatedLabels = [...(todo.labels ?? []), newLabel];

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === row.todo_id ? { ...t, labels: updatedLabels } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === row.todo_id
              ? { ...state.selectedTodo, labels: updatedLabels }
              : state.selectedTodo,
        }));
        return true;
      }

      if (eventType === 'DELETE') {
        const store = useWorkspaceStore.getState();
        const labelEntryId = row.id;
        if (!labelEntryId) return false;

        // If todo_id missing (REPLICA IDENTITY DEFAULT), search all todos
        let todoId = row.todo_id;
        if (!todoId) {
          const found = store.todos.find((t) => t.labels?.some((l) => l.id === labelEntryId));
          todoId = found?.id;
        }
        if (!todoId) return false;

        const targetTodo = store.todos.find((t) => t.id === todoId);
        const updatedLabels = (targetTodo?.labels ?? []).filter((l) => l.id !== labelEntryId);

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === todoId ? { ...t, labels: updatedLabels } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === todoId
              ? { ...state.selectedTodo, labels: updatedLabels }
              : state.selectedTodo,
        }));
        return true;
      }

      return false;
    };

    /**
     * Patch checklist_items changes directly in the matching todo in the store.
     */
    const applyChecklistPatch = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: Record<string, unknown>
    ): boolean => {
      const row = payload as {
        id?: string;
        todo_id?: string;
        content?: string | null;
        is_completed?: boolean | null;
        position?: number | null;
        completed_at?: string | null;
        completed_by?: string | null;
      };

      if (eventType === 'INSERT') {
        const store = useWorkspaceStore.getState();
        if (!row.todo_id) return false;
        const todo = store.todos.find((t) => t.id === row.todo_id);
        if (!todo) return false;
        if (!row.id) return false;
        if ((todo.checklist_items ?? []).some((c) => c.id === row.id)) return true;

        const newItem: ChecklistItem = {
          id: row.id,
          todo_id: row.todo_id!,
          content: row.content ?? '',
          is_completed: row.is_completed ?? false,
          position: row.position ?? 0,
          completed_at: row.completed_at ?? null,
          completed_by: row.completed_by ?? null,
        };
        const updatedItems = [...(todo.checklist_items ?? []), newItem].sort((a, b) => a.position - b.position);

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === row.todo_id ? { ...t, checklist_items: updatedItems } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === row.todo_id
              ? { ...state.selectedTodo, checklist_items: updatedItems }
              : state.selectedTodo,
        }));
        return true;
      }

      if (eventType === 'UPDATE') {
        const store = useWorkspaceStore.getState();
        if (!row.todo_id) return false;
        const todo = store.todos.find((t) => t.id === row.todo_id);
        if (!todo) return false;
        if (!row.id) return false;
        const updatedItems = (todo.checklist_items ?? []).map((c) =>
          c.id === row.id
            ? {
                ...c,
                ...(row.content !== undefined && { content: row.content ?? '' }),
                ...(row.is_completed !== undefined && { is_completed: row.is_completed ?? false }),
                ...(row.position !== undefined && { position: row.position ?? c.position }),
                ...(row.completed_at !== undefined && { completed_at: row.completed_at ?? null }),
                ...(row.completed_by !== undefined && { completed_by: row.completed_by ?? null }),
              }
            : c
        );

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === row.todo_id ? { ...t, checklist_items: updatedItems } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === row.todo_id
              ? { ...state.selectedTodo, checklist_items: updatedItems }
              : state.selectedTodo,
        }));
        return true;
      }

      if (eventType === 'DELETE') {
        const store = useWorkspaceStore.getState();
        const checklistId = row.id;
        if (!checklistId) return false;

        // If todo_id missing (REPLICA IDENTITY DEFAULT), search all todos
        let todoId = row.todo_id;
        if (!todoId) {
          const found = store.todos.find((t) => t.checklist_items?.some((c) => c.id === checklistId));
          todoId = found?.id;
        }
        if (!todoId) return false;

        const targetTodo = store.todos.find((t) => t.id === todoId);
        const updatedItems = (targetTodo?.checklist_items ?? []).filter((c) => c.id !== checklistId);

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === todoId ? { ...t, checklist_items: updatedItems } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === todoId
              ? { ...state.selectedTodo, checklist_items: updatedItems }
              : state.selectedTodo,
        }));
        return true;
      }

      return false;
    };

    /**
     * Patch attachments changes directly in the matching todo in the store.
     */
    const applyAttachmentPatch = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: Record<string, unknown>
    ): boolean => {
      const row = payload as {
        id?: string;
        todo_id?: string;
        file_name?: string;
        file_type?: string | null;
        file_size?: number | null;
        file_url?: string;
        thumbnail_url?: string | null;
        uploaded_by?: string | null;
        created_at?: string;
        expires_at?: string | null;
      };
      if (!row.todo_id) return false;

      if (eventType === 'INSERT') {
        const store = useWorkspaceStore.getState();
        const todo = store.todos.find((t) => t.id === row.todo_id);
        if (!todo) return false;
        if (!row.id || !row.file_url || !row.file_name) return false;
        if ((todo.attachments ?? []).some((a) => a.id === row.id)) return true;

        const newAttachment: Attachment = {
          id: row.id,
          todo_id: row.todo_id!,
          file_name: row.file_name,
          file_type: row.file_type ?? '',
          file_size: row.file_size ?? 0,
          file_url: row.file_url,
          thumbnail_url: row.thumbnail_url ?? null,
          uploaded_by: row.uploaded_by ?? '',
          created_at: row.created_at ?? new Date().toISOString(),
          expires_at: row.expires_at ?? null,
        };
        const updatedAttachments = [...(todo.attachments ?? []), newAttachment];

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === row.todo_id ? { ...t, attachments: updatedAttachments } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === row.todo_id
              ? { ...state.selectedTodo, attachments: updatedAttachments }
              : state.selectedTodo,
        }));
        return true;
      }

      if (eventType === 'DELETE') {
        const store = useWorkspaceStore.getState();
        const todo = store.todos.find((t) => t.id === row.todo_id);
        if (!todo) return false;
        if (!row.id) return false;
        const updatedAttachments = (todo.attachments ?? []).filter((a) => a.id !== row.id);

        useWorkspaceStore.setState((state) => ({
          todos: state.todos.map((t) =>
            t.id === row.todo_id ? { ...t, attachments: updatedAttachments } : t
          ),
          selectedTodo:
            state.selectedTodo?.id === row.todo_id
              ? { ...state.selectedTodo, attachments: updatedAttachments }
              : state.selectedTodo,
        }));
        return true;
      }

      return false;
    };

    /**
     * Patch users table UPDATE events: update user in store.users and in all
     * todo.assignees[].user references.
     */
    const applyUserPatch = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: Record<string, unknown>
    ): boolean => {
      if (eventType !== 'UPDATE') return false;

      const row = payload as {
        id?: string;
        name?: string | null;
        username?: string | null;
        color?: string | null;
        avatar_url?: string | null;
        status?: string | null;
        offline_reason?: string | null;
        last_seen?: string | null;
        created_at?: string | null;
      };
      if (!row.id) return false;

      const store = useWorkspaceStore.getState(); // fresh read — inside UPDATE branch
      const existingUser = store.users.find((u) => u.id === row.id);
      if (!existingUser) return false;

      // Bug 1 fix: null/undefined status falls back to the existing user's status
      // instead of incorrectly defaulting to 'online' (happens when REPLICA IDENTITY
      // is not FULL and the status column is absent from the UPDATE payload).
      const normalizeStatus = (s: unknown, fallback: 'online' | 'away' | 'offline'): 'online' | 'away' | 'offline' => {
        if (s === 'online' || s === 'away' || s === 'offline') return s;
        return fallback; // preserve existing status if payload is null/unknown
      };

      const updatedUser = {
        ...existingUser,
        ...(row.name !== undefined && { display_name: row.name?.trim() || existingUser.display_name }),
        ...(row.color !== undefined && { avatar_color: row.color || existingUser.avatar_color }),
        ...(row.avatar_url !== undefined && { avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null }),
        // Bug 1 fix: pass existingUser.status as fallback
        ...(row.status !== undefined && { status: normalizeStatus(row.status, existingUser.status) }),
        // Bug 2 note: when offline_reason is null in DB (typeof null === 'object'), this
        // correctly sets offline_reason: null. Requires REPLICA IDENTITY FULL to reliably
        // receive the field in partial UPDATE payloads.
        ...(row.offline_reason !== undefined && { offline_reason: typeof row.offline_reason === 'string' ? row.offline_reason : null }),
        ...(row.last_seen !== undefined && { last_seen: row.last_seen ?? existingUser.last_seen }),
        // Bug 4 fix: when status is explicitly 'online', always clear offline_reason
        // regardless of whether offline_reason was present in the payload. This handles
        // the case where REPLICA IDENTITY is not FULL and only changed columns are sent.
        ...(row.status === 'online' && { offline_reason: null }),
      };

      useWorkspaceStore.setState((state) => ({
        users: state.users.map((u) => (u.id === row.id ? updatedUser : u)),
        // Also patch user refs inside todo assignees
        todos: state.todos.map((t) => ({
          ...t,
          assignees: (t.assignees ?? []).map((a) =>
            a.user_id === row.id ? { ...a, user: updatedUser } : a
          ),
        })),
        // Update currentUser if it's the same person
        currentUser: state.currentUser?.id === row.id
          ? { ...state.currentUser, ...updatedUser }
          : state.currentUser,
        // Patch selectedTodo assignees too
        selectedTodo: state.selectedTodo
          ? {
              ...state.selectedTodo,
              assignees: (state.selectedTodo.assignees ?? []).map((a) =>
                a.user_id === row.id ? { ...a, user: updatedUser } : a
              ),
            }
          : null,
      }));
      return true;
    };

    // ── Channel subscription ─────────────────────────────────────────────────

    // Remove any stale channel with the same name before creating a new one
    const existingCh = supabase.getChannels().find(c => c.topic === 'realtime:workspace-core-sync');
    if (existingCh) { void supabase.removeChannel(existingCh); }

    const channel = supabase
      .channel('workspace-core-sync')
      // todos — surgical patch; for INSERT/DELETE failures do immediate reload (not debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, (payload) => {
        markCoreChannelEventSeen();
        const data = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>;
        const applied = applyTodoPatch(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', data);
        if (!applied) {
          // INSERT/DELETE must reflect immediately — debounced timer keeps getting pushed back
          // when multiple events arrive quickly, causing missed updates. Call directly.
          if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            void loadWorkspaceData();
          } else {
            scheduleFastRefresh();
          }
        }
      })
      // todo_assignees — surgical patch with fast fallback (50ms)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_assignees' }, (payload) => {
        markCoreChannelEventSeen();
        const data = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>;
        const applied = applyTodoAssigneePatch(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', data);
        if (!applied) {
          scheduleFastRefresh();
        }
      })
      // todo_labels — surgical patch with fallback
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_labels' }, (payload) => {
        markCoreChannelEventSeen();
        const data = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>;
        const applied = applyTodoLabelPatch(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', data);
        if (!applied) {
          scheduleWorkspaceRefresh();
        }
      })
      // checklist_items — surgical patch with fallback
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, (payload) => {
        markCoreChannelEventSeen();
        const data = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>;
        const applied = applyChecklistPatch(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', data);
        if (!applied) {
          scheduleWorkspaceRefresh();
        }
      })
      // attachments — surgical patch with fallback
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments' }, (payload) => {
        markCoreChannelEventSeen();
        const data = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>;
        const applied = applyAttachmentPatch(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', data);
        if (!applied) {
          scheduleWorkspaceRefresh();
        }
      })
      // users — surgical patch for UPDATE, fallback for INSERT/DELETE
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
        markCoreChannelEventSeen();
        const data = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>;
        const applied = applyUserPatch(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', data);
        if (!applied) {
          scheduleWorkspaceRefresh();
        }
      })
      // labels — full reload (affects UI globally)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'labels' }, () => {
        markCoreChannelEventSeen();
        scheduleWorkspaceRefresh();
      })
      // categories — full reload
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => {
        markCoreChannelEventSeen();
        scheduleWorkspaceRefresh();
      })
      // comments — fast local patch (existing logic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        markCoreChannelEventSeen();
        const applied = applyCommentPatch(
          payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>
        );
        if (!applied) {
          scheduleWorkspaceRefresh();
        }
      })
      // activity_logs — skip; the todo-detail-modal reloads these independently
      ;

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        coreChannelHealthyRef.current = true;
        coreChannelLastEventAtRef.current = Date.now();
        scheduleWorkspaceRefresh();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        coreChannelHealthyRef.current = false;
        scheduleWorkspaceRefresh();
      } else if (status === 'CLOSED') {
        coreChannelHealthyRef.current = false;
      }
    });

    return () => {
      if (workspaceRefreshTimeoutRef.current !== null) {
        window.clearTimeout(workspaceRefreshTimeoutRef.current);
        workspaceRefreshTimeoutRef.current = null;
      }
      if (workspaceFollowUpRefreshTimeoutRef.current !== null) {
        window.clearTimeout(workspaceFollowUpRefreshTimeoutRef.current);
        workspaceFollowUpRefreshTimeoutRef.current = null;
      }
      if (workspaceFastRefreshTimeoutRef.current !== null) {
        window.clearTimeout(workspaceFastRefreshTimeoutRef.current);
        workspaceFastRefreshTimeoutRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, loadWorkspaceData, markCoreChannelEventSeen, scheduleFastRefresh, scheduleWorkspaceRefresh]);

  // Health-aware fallback polling: only poll when realtime channel has errors
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const fallbackInterval = window.setInterval(() => {
      if (!coreChannelHealthyRef.current) {
        scheduleWorkspaceRefresh();
      }
    }, 8000);

    return () => {
      window.clearInterval(fallbackInterval);
    };
  }, [currentUserId, scheduleWorkspaceRefresh]);

  // Reconciliation guard: covers silent realtime event stalls and periodic drift.
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const guardInterval = window.setInterval(() => {
      const now = Date.now();
      const isChannelHealthy = coreChannelHealthyRef.current;
      const isEventStreamStale = now - coreChannelLastEventAtRef.current >= CORE_EVENT_STALE_THRESHOLD_MS;
      const isSafetyRefreshDue =
        now - coreChannelLastReconcileAtRef.current >= CORE_SAFETY_REFRESH_INTERVAL_MS;

      if (!isChannelHealthy || (isChannelHealthy && isEventStreamStale) || isSafetyRefreshDue) {
        coreChannelLastReconcileAtRef.current = now;
        scheduleWorkspaceRefresh();
      }
    }, CORE_RECONCILIATION_GUARD_INTERVAL_MS);

    return () => {
      window.clearInterval(guardInterval);
    };
  }, [currentUserId, scheduleWorkspaceRefresh]);

  // License revoke realtime subscription lifecycle
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const unsubscribe = subscribeToLicenseRevoke();
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentUserId, subscribeToLicenseRevoke]);

  // License validity check — every 15 seconds polling
  useEffect(() => {
    if (!currentUserId) return;
    void checkLicenseValid();
    const interval = window.setInterval(() => {
      void checkLicenseValid();
    }, 15000);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Electron: open todo modal when native notification is clicked
  useEffect(() => {
    const electronApi = (window as Window & {
      electron?: {
        onNotificationClick?: (cb: (data: { todoId: string }) => void) => (() => void) | void;
      };
    }).electron;
    if (!electronApi?.onNotificationClick) return;

    const unsubscribe = electronApi.onNotificationClick(({ todoId }) => {
      void (async () => {
        if (!todoId) {
          return;
        }

        setActiveTab('board');

        let todo = useWorkspaceStore.getState().todos.find((t) => t.id === todoId);
        if (!todo) {
          await loadWorkspaceData();
          todo = useWorkspaceStore.getState().todos.find((t) => t.id === todoId);
        }

        if (todo) {
          setSelectedTodo(todo);
          setTodoModalOpen(true);
        }
      })();
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [loadWorkspaceData, setSelectedTodo, setTodoModalOpen]);

  // Electron: handle close-requested (show reason dialog)
  useEffect(() => {
    if (!currentUserId) return;
    const electronApi = (window as Window & {
      electron?: {
        onCloseRequested?: (cb: () => void) => (() => void) | void;
      };
    }).electron;
    if (!electronApi) return;

    const unsubscribe = electronApi.onCloseRequested?.(() => {
      setCloseReason('');   // önceki sebep kalmış olabilir, temizle
      setShowCloseDialog(true);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const existingNotifications = useWorkspaceStore.getState().notifications;
    shownNativeNotificationIdsRef.current = new Set(existingNotifications.map((item) => item.id));

    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          const notification = mapRealtimeNotification(payload.new as Record<string, unknown>);
          if (!notification) {
            return;
          }

          handleIncomingNotification(notification);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          const notification = mapRealtimeNotification(payload.new as Record<string, unknown>);
          if (!notification) {
            return;
          }

          const currentNotifications = useWorkspaceStore.getState().notifications;
          const existingIndex = currentNotifications.findIndex((entry) => entry.id === notification.id);

          if (existingIndex >= 0) {
            const updatedNotifications = [...currentNotifications];
            updatedNotifications[existingIndex] = {
              ...updatedNotifications[existingIndex],
              ...notification,
            };
            useWorkspaceStore.setState({ notifications: updatedNotifications });
            return;
          }

          useWorkspaceStore.setState({ notifications: [notification, ...currentNotifications] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          const oldPayload = payload.old as Record<string, unknown>;
          const deletedId = typeof oldPayload.id === 'string' ? oldPayload.id : null;
          if (!deletedId) {
            return;
          }

          shownNativeNotificationIdsRef.current.delete(deletedId);

          const currentNotifications = useWorkspaceStore.getState().notifications;
          useWorkspaceStore.setState({
            notifications: currentNotifications.filter((entry) => entry.id !== deletedId),
          });
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleWorkspaceRefresh();
        }
      });

    const pollingInterval = window.setInterval(() => {
      void (async () => {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error || !Array.isArray(data)) {
          return;
        }

        const fetchedNotifications = sortNotificationsByCreatedAtDesc(
          data
            .map((row) => mapRealtimeNotification(row as Record<string, unknown>))
            .filter((row): row is AppNotification => row !== null)
        );

        const currentNotifications = useWorkspaceStore.getState().notifications;
        const currentNotificationMap = new Map(
          currentNotifications.map((notification) => [notification.id, notification])
        );
        const fetchedIds = new Set(fetchedNotifications.map((notification) => notification.id));

        for (const notification of fetchedNotifications) {
          const existing = currentNotificationMap.get(notification.id);
          currentNotificationMap.set(notification.id, existing ? { ...existing, ...notification } : notification);
        }

        if (fetchedNotifications.length === 0) {
          currentNotificationMap.clear();
        } else {
          const oldestFetchedTimestamp = toEpoch(
            fetchedNotifications[fetchedNotifications.length - 1]?.created_at ?? null
          );

          for (const notification of currentNotifications) {
            const notificationTimestamp = toEpoch(notification.created_at);
            const shouldBeInWindow = notificationTimestamp >= oldestFetchedTimestamp;

            if (shouldBeInWindow && !fetchedIds.has(notification.id)) {
              currentNotificationMap.delete(notification.id);
              shownNativeNotificationIdsRef.current.delete(notification.id);
            }
          }
        }

        const reconciled = sortNotificationsByCreatedAtDesc(Array.from(currentNotificationMap.values()));
        useWorkspaceStore.setState({ notifications: reconciled });
      })();
    }, 6000);

    return () => {
      window.clearInterval(pollingInterval);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, handleIncomingNotification, scheduleWorkspaceRefresh]);

  const handleConfirmClose = async () => {
    const electronApi = (window as Window & {
      electron?: { confirmQuit?: () => void };
    }).electron;
    const normalizedReason = closeReason.trim();

    if (!normalizedReason) {
      return;
    }

    await updateUserStatus('offline', normalizedReason);

    setShowCloseDialog(false);
    setCloseReason('');
    electronApi?.confirmQuit?.();
  };

  const handleCancelClose = () => {
    setShowCloseDialog(false);
    setCloseReason('');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'board':
        return (
          <>
            <Header view={view} onViewChange={setView} onTabChange={setActiveTab} />
            {view === 'list' ? <ListView /> : <KanbanBoard />}
          </>
        );
      case 'members':
        return <MembersPanel />;
      case 'labels':
        return <LabelsPanel />;
      case 'analytics':
        return <AnalyticsPanel />;
      case 'activity':
        return <ActivityPanel />;
      case 'notifications':
        return <NotificationsPanel />;
      default:
        return (
          <>
            <Header view={view} onViewChange={setView} onTabChange={setActiveTab} />
            <KanbanBoard />
          </>
        );
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 flex flex-col overflow-hidden">
        {renderContent()}
      </main>
      <CreateTodoModal />
      <TodoDetailModal />

      {/* Close reason dialog */}
      <Dialog open={showCloseDialog} onOpenChange={(open) => { if (!open) handleCancelClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Uygulamayı kapatıyorsunuz</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="close-reason" className="text-sm text-muted-foreground mb-2 block">
              Neden ayrılıyorsunuz? <span className="text-destructive">*</span>
            </Label>
            <Input
              id="close-reason"
              placeholder="Örn: Toplantıya gidiyorum, Öğle arası..."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              maxLength={100}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && closeReason.trim()) void handleConfirmClose();
                if (e.key === 'Escape') handleCancelClose();
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={handleCancelClose}>
              İptal
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmClose()} disabled={!closeReason.trim()}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
