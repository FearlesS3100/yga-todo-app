'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Bell, CheckCheck, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import type { Notification as AppNotification } from '@/lib/types';

const PAGE_SIZE = 8;
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

function resolveNotificationTargetTodoId(
  notification: Pick<AppNotification, 'related_todo_id' | 'link'>
): string | null {
  if (notification.related_todo_id && notification.related_todo_id.trim().length > 0) {
    return notification.related_todo_id;
  }

  return resolveTodoIdFromNotificationLink(notification.link);
}

export function NotificationsPanel() {
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    setSelectedTodo,
    setTodoModalOpen,
    loadWorkspaceData,
    currentUser,
  } = useWorkspaceStore();
  const [page, setPage] = useState(0);

  // Defensive filter: only show notifications belonging to the current user
  const currentUserId = currentUser?.id;
  const ownNotifications = currentUserId
    ? notifications.filter((n) => n.user_id === currentUserId)
    : notifications;

  const unreadCount = ownNotifications.filter(n => !n.is_read).length;
  const totalPages = Math.ceil(ownNotifications.length / PAGE_SIZE);
  const paginated = ownNotifications.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const goToPage = (p: number) => {
    setPage(Math.max(0, Math.min(p, totalPages - 1)));
  };

  const handleGoToNotificationTodo = async (notification: AppNotification) => {
    markNotificationRead(notification.id);

    const targetTodoId = resolveNotificationTargetTodoId(notification);
    if (!targetTodoId) {
      return;
    }

    const findTodo = () => useWorkspaceStore.getState().todos.find((todo) => todo.id === targetTodoId);
    let todo = findTodo();

    if (!todo) {
      await loadWorkspaceData();
      todo = findTodo();
    }

    if (todo) {
      setSelectedTodo(todo);
      setTodoModalOpen(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="px-6 pt-5 pb-4 sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border">
        <div className="max-w-sm mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground">Bildirimler</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tümünü okundu işaretle
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-4 px-6">
        <div className="max-w-sm mx-auto space-y-2">

          {ownNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-20 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                <Bell className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Henüz bildirim yok</p>
            </div>
          ) : (
            <>
              {paginated.map((notification) => {
                const targetTodoId = resolveNotificationTargetTodoId(notification);

                return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleGoToNotificationTodo(notification)}
                  className={cn(
                    'group w-full text-left rounded-2xl overflow-hidden transition-all duration-150',
                    notification.is_read
                      ? 'bg-muted/50 hover:bg-muted'
                      : 'bg-card border border-border shadow-sm hover:shadow-md'
                  )}
                >
                  {!notification.is_read && (
                    <div className="h-0.5 w-full bg-primary" />
                  )}

                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <div className={cn(
                      'mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                      notification.is_read ? 'bg-muted-foreground/10' : 'bg-primary/10'
                    )}>
                      <Bell className={cn(
                        'w-4 h-4',
                        notification.is_read ? 'text-muted-foreground' : 'text-primary'
                      )} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          'text-sm leading-snug',
                          notification.is_read ? 'font-normal text-muted-foreground' : 'font-semibold text-foreground'
                        )}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>

                      {notification.message && (
                        <p className={cn(
                          'text-xs mt-1 leading-relaxed',
                          notification.is_read ? 'text-muted-foreground/70' : 'text-muted-foreground'
                        )}>
                          {notification.message}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: tr })}
                        </span>
                        {targetTodoId && (
                          <span className={cn(
                            'inline-flex items-center gap-0.5 text-xs font-medium transition-colors',
                            notification.is_read
                              ? 'text-muted-foreground group-hover:text-foreground'
                              : 'text-primary'
                          )}>
                            Göreve git
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 pb-1">
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 0}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Önceki
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }).map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => goToPage(i)}
                        className={cn(
                          'w-6 h-6 rounded-full text-[11px] font-medium transition-colors',
                          i === page
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={page === totalPages - 1}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Sonraki
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
