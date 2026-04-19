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
import type { Notification as AppNotification, Comment } from '@/lib/types';
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
  const coreChannelHealthyRef = useRef<boolean>(true);

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

    // Browser visibility (tab hidden / window minimized to tray)
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

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUserId, updateUserStatus]);

  // Workspace realtime sync for core tables
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    coreChannelHealthyRef.current = true;

    // Fast local patch for comment events — avoids full reload for comment changes
    const applyCommentPatch = (
      eventType: 'INSERT' | 'UPDATE' | 'DELETE',
      payload: Record<string, unknown>
    ) => {
      const store = useWorkspaceStore.getState();

      if (eventType === 'INSERT') {
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

    const nonCommentTables = [
      'users',
      'categories',
      'todos',
      'todo_assignees',
      'checklist_items',
      'labels',
      'todo_labels',
      'attachments',
    ];

    const followUpTables = new Set([
      'categories',
      'todos',
      'todo_assignees',
      'todo_labels',
      'checklist_items',
      'attachments',
    ]);

    let channelBase = supabase.channel(`workspace-core-sync:${currentUserId}`);

    // Register non-comment tables
    channelBase = nonCommentTables.reduce((acc, table) => {
      return acc.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          scheduleWorkspaceRefresh();
          if (
            (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') &&
            followUpTables.has(table)
          ) {
            scheduleFollowUpWorkspaceRefresh();
          }
        }
      );
    }, channelBase);

    // Register comments table with fast local patch
    const channel = channelBase.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comments' },
      (payload) => {
        const applied = applyCommentPatch(
          payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>
        );
        // Fall back to full reload if patch couldn't be applied (todo not in store yet)
        if (!applied) {
          scheduleWorkspaceRefresh();
        }
      }
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        coreChannelHealthyRef.current = true;
        scheduleWorkspaceRefresh();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        coreChannelHealthyRef.current = false;
        scheduleWorkspaceRefresh();
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
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, scheduleFollowUpWorkspaceRefresh, scheduleWorkspaceRefresh]);

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
