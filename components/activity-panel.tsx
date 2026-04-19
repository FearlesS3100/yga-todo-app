'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ActivityLog, User as AppUser } from '@/lib/types';
import {
  Plus,
  Edit,
  Trash2,
  MessageSquare,
  CheckCircle2, 
  ArrowRight,
  Clock,
  User,
  Tag,
  Calendar,
  CheckSquare,
  UserPlus,
  UserMinus,
  FileText,
  Flag,
  Paperclip,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { tr } from 'date-fns/locale';

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

type ActivityLogRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values?: unknown;
  new_values?: unknown;
  created_at?: string | null;
};

type UserRow = {
  id: string;
  name?: string | null;
  username?: string | null;
  color?: string | null;
  status?: string | null;
  last_seen?: string | null;
  created_at?: string | null;
};

function randomHexColor(): string {
  return `#${Math.floor(Math.random() * 16777215)
    .toString(16)
    .padStart(6, '0')}`;
}

function mapUserRow(row: UserRow): AppUser {
  const fallbackName = row.username ?? 'User';
  const displayName = row.name?.trim() || fallbackName;
  const status: AppUser['status'] =
    row.status === 'online' || row.status === 'away' || row.status === 'busy' || row.status === 'offline'
      ? row.status
      : 'offline';

  return {
    id: row.id,
    username: row.username ?? displayName.toLowerCase().replace(/\s+/g, '-'),
    display_name: displayName,
    avatar_color: row.color || randomHexColor(),
    status,
    last_seen: row.last_seen || new Date().toISOString(),
    created_at: row.created_at || new Date().toISOString(),
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

const actionIcons: Record<string, typeof Plus> = {
  created: Plus,
  updated: Edit,
  deleted: Trash2,
  comment_added: MessageSquare,
  status_changed: ArrowRight,
  completed: CheckCircle2,
  assigned: User,
  label_added: Tag,
  priority_changed: Flag,
  due_date_changed: Calendar,
  description_changed: FileText,
  title_changed: Edit,
  checklist_added: CheckSquare,
  checklist_completed: CheckCircle2,
  assignee_added: UserPlus,
  assignee_removed: UserMinus,
  category_renamed: Edit,
  category_color_changed: Tag,
  category_created: Plus,
  category_deleted: Trash2,
  attachment_added: Paperclip,
  attachment_removed: Paperclip,
  moved: ArrowRight,
};

const statusTr: Record<string, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  in_review: 'İncelemede',
  done: 'Tamamlandı',
  blocked: 'Engellendi',
  cancelled: 'İptal',
};

const actionLabels: Record<string, string> = {
  created: 'oluşturdu',
  updated: 'güncelledi',
  deleted: 'sildi',
  comment_added: 'yorum ekledi',
  status_changed: 'durumu değiştirdi',
  completed: 'tamamladı',
  assigned: 'kullanıcı atadı',
  label_added: 'etiket ekledi',
  moved: 'taşıdı',
  priority_changed: 'önceliği değiştirdi',
  due_date_changed: 'bitiş tarihini değiştirdi',
  description_changed: 'açıklamayı güncelledi',
  title_changed: 'başlığı değiştirdi',
  checklist_added: 'kontrol maddesi ekledi',
  checklist_completed: 'kontrol maddesi tamamlandı',
  assignee_added: 'atanan kişi ekledi',
  assignee_removed: 'atanan kişiyi kaldırdı',
  reordered: 'sırayı değiştirdi',
  category_renamed: 'kategori adını değiştirdi',
  category_color_changed: 'kategori rengini değiştirdi',
  category_created: 'kategori oluşturdu',
  category_deleted: 'kategoriyi sildi',
  attachment_added: 'dosya ekledi',
  attachment_removed: 'dosyayı sildi',
};

const priorityTr: Record<string, string> = {
  urgent: 'Acil',
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
  none: 'Yok',
};

function getTimestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAction(log: ActivityLogWithTitle): ActivityLogWithTitle {
  if (log.action !== 'updated') {
    return log;
  }

  const oldValues = log.old_values ?? {};
  const newValues = log.new_values ?? {};
  const oldStatus = oldValues.status;
  const newStatus = newValues.status;
  const oldPriority = oldValues.priority;
  const newPriority = newValues.priority;
  const oldTitle = oldValues.title;
  const newTitle = newValues.title;

  if (oldStatus !== undefined && newStatus !== undefined && oldStatus !== newStatus) {
    if (oldStatus && newStatus) {
      return { ...log, action: 'status_changed', old_values: { ...oldValues }, new_values: { ...newValues } };
    }
  }

  if (oldPriority !== undefined && newPriority !== undefined && oldPriority !== newPriority) {
    if (oldPriority && newPriority) {
      return { ...log, action: 'priority_changed', old_values: { ...oldValues }, new_values: { ...newValues } };
    }
  }

  if (oldTitle !== undefined && newTitle !== undefined && oldTitle !== newTitle) {
    if (oldTitle && newTitle) {
      return { ...log, action: 'title_changed', old_values: { ...oldValues }, new_values: { ...newValues } };
    }
  }

  return log;
}

function dedupeLogs(logs: ActivityLogWithTitle[]): ActivityLogWithTitle[] {
  const normalized = logs.map(normalizeAction);
  const sorted = [...normalized].sort(
    (a, b) => getTimestamp(b.created_at) - getTimestamp(a.created_at)
  );
  const seen = new Set<string>();

  const result = sorted.filter((log) => {
    if (log.action === 'updated') {
      const hasSpecificNearby = normalized.some((other) => {
        if (other.id === log.id) {
          return false;
        }

        if (other.entity_id !== log.entity_id || other.user_id !== log.user_id) {
          return false;
        }

        if (other.action === 'updated') {
          return false;
        }

        return Math.abs(getTimestamp(other.created_at) - getTimestamp(log.created_at)) <= 10000;
      });

      if (hasSpecificNearby) {
        return false;
      }
    }

    const signature = JSON.stringify(log.old_values ?? null) + JSON.stringify(log.new_values ?? null);
    const dedupeKey = `${log.action}|${log.entity_id}|${log.user_id}|${signature}`;

    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });

  // Remove incomplete entries when a complete one exists nearby (within 30s)
  const result2 = result.filter((log) => {
    if (!['priority_changed', 'status_changed', 'title_changed'].includes(log.action)) {
      return true;
    }

    const isIncomplete =
      (log.action === 'priority_changed' && !log.old_values?.priority) ||
      (log.action === 'status_changed' && !log.old_values?.status) ||
      (log.action === 'title_changed' && !log.old_values?.title);

    if (!isIncomplete) return true;

    // Check if a complete version exists within 30 seconds
    const hasCompleteVersion = result.some((other) => {
      if (other.id === log.id || other.action !== log.action) return false;
      if (other.entity_id !== log.entity_id || other.user_id !== log.user_id) return false;

      const isOtherComplete =
        (log.action === 'priority_changed' && !!other.old_values?.priority) ||
        (log.action === 'status_changed' && !!other.old_values?.status) ||
        (log.action === 'title_changed' && !!other.old_values?.title);

      if (!isOtherComplete) return false;

      return Math.abs(getTimestamp(other.created_at) - getTimestamp(log.created_at)) <= 30000;
    });

    return !hasCompleteVersion;
  });

  return result2;
}

function formatActionDate(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Tarih yok';
  }

  const dateValue = new Date(String(value));
  if (Number.isNaN(dateValue.getTime())) {
    return String(value);
  }

  return format(dateValue, 'd MMM yyyy', { locale: tr });
}

type ActivityLogWithTitle = ActivityLog & { todo_title?: string };

export function ActivityPanel() {
  const [logs, setLogs] = useState<ActivityLogWithTitle[]>([]);

  useEffect(() => {
    let isMounted = true;

    const loadLogs = async () => {
      try {
        // Step 1: Fetch both data sources in parallel
        const [activityResult, commentResult] = await Promise.all([
          supabase
            .from('activity_logs')
            .select('*')
            .eq('workspace_id', DEFAULT_WORKSPACE_ID)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('comments')
            .select('id, content, created_at, created_by, todo_id')
            .order('created_at', { ascending: false })
            .limit(100),
        ]);

        if (activityResult.error) throw activityResult.error;

        const parsedLogs = (activityResult.data ?? []) as ActivityLogRow[];
        const commentRows = (commentResult.data ?? []) as any[];

        // Step 2: Collect ALL unique user_ids from both sources
        const allUserIds = [...new Set([
          ...parsedLogs.map((log) => log.user_id),
          ...commentRows.map((c) => c.created_by),
        ].filter(Boolean))];

        // Step 3: Fetch all users at once
        let usersById = new Map<string, AppUser>();
        if (allUserIds.length > 0) {
          const { data: userRows, error: usersError } = await supabase
            .from('users')
            .select('*')
            .in('id', allUserIds);
          if (usersError) throw usersError;
          usersById = new Map(
            ((userRows ?? []) as UserRow[]).map((row) => {
              const mapped = mapUserRow(row);
              return [mapped.id, mapped] as const;
            })
          );
        }

        // Step 4: Collect todo ids from both sources
        const allTodoIds = [...new Set([
          ...parsedLogs.map((log) => log.entity_id),
          ...commentRows.map((c) => c.todo_id),
        ].filter(Boolean))];

        let todosById = new Map<string, string>();
        if (allTodoIds.length > 0) {
          const { data: todoRows } = await supabase
            .from('todos')
            .select('id, title')
            .in('id', allTodoIds);
          for (const t of ((todoRows || []) as { id: string; title: string }[])) {
            todosById.set(t.id, t.title);
          }
        }

        // Step 5: Map activity logs
        const mappedLogs: ActivityLogWithTitle[] = parsedLogs.map((log) => {
          const oldValues = toRecord(log.old_values);
          const newValues = toRecord(log.new_values);

          // Resolve assignee UUIDs to display names
          if (log.action === 'assignee_added' && newValues?.assignee_user_id) {
            const assigneeUser = usersById.get(String(newValues.assignee_user_id));
            if (assigneeUser) {
              newValues.assignee_display_name = assigneeUser.display_name;
            }
          }
          if (log.action === 'assignee_removed' && oldValues?.assignee_user_id) {
            const assigneeUser = usersById.get(String(oldValues.assignee_user_id));
            if (assigneeUser) {
              oldValues.assignee_display_name = assigneeUser.display_name;
            }
          }

          return {
            id: log.id,
            workspace_id: log.workspace_id,
            user_id: log.user_id,
            action: log.action,
            entity_type: log.entity_type,
            entity_id: log.entity_id,
            old_values: oldValues,
            new_values: newValues,
            created_at: log.created_at || new Date().toISOString(),
            user: usersById.get(log.user_id),
            todo_title: todosById.get(log.entity_id) || '',
          };
        });

        // Step 6: Map comment logs
        const commentLogs: ActivityLogWithTitle[] = commentRows.map((c) => ({
          id: `comment-${c.id}`,
          workspace_id: DEFAULT_WORKSPACE_ID,
          user_id: c.created_by,
          action: 'comment_added',
          entity_type: 'comment',
          entity_id: c.todo_id,
          old_values: null,
          new_values: { content: c.content?.slice(0, 80) },
          created_at: c.created_at || new Date().toISOString(),
          user: usersById.get(c.created_by),
          todo_title: todosById.get(c.todo_id) || '',
        }));

        // Step 7: Combine, dedupe, sort
        const allLogs: ActivityLogWithTitle[] = [...mappedLogs, ...commentLogs].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        if (isMounted) {
          setLogs(dedupeLogs(allLogs));
        }
      } catch {
        if (isMounted) {
          setLogs([]);
        }
      }
    };

    void loadLogs();

    // Realtime: reload when new activity_logs rows arrive
    const channel = supabase
      .channel('activity_logs_feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `workspace_id=eq.${DEFAULT_WORKSPACE_ID}`,
        },
        () => {
          void loadLogs();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  // Group logs by date
  const groupedLogs = logs.reduce((acc, log) => {
    const date = format(new Date(log.created_at), 'yyyy-MM-dd');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(log);
    return acc;
  }, {} as Record<string, typeof logs>);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Aktivite Geçmişi</h1>
          <p className="text-muted-foreground">
            Workspace&apos;teki tüm değişiklikler
          </p>
        </div>

        {/* Timeline */}
        <div className="space-y-8">
          {Object.entries(groupedLogs).map(([date, dayLogs]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-sm font-medium text-muted-foreground">
                  {format(new Date(date), 'd MMMM yyyy', { locale: tr })}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-4">
                {dayLogs.map((log) => {
                  const Icon = actionIcons[log.action] || Edit;
                  const oldStatus = log.old_values ? String(log.old_values.status ?? '') : '';
                  const newStatus = log.new_values ? String(log.new_values.status ?? '') : '';
                  const oldPriority = log.old_values ? String(log.old_values.priority ?? '') : '';
                  const newPriority = log.new_values ? String(log.new_values.priority ?? '') : '';
                  const createdTitle = log.new_values?.title ? String(log.new_values.title) : '';
                  const commentContent = log.new_values?.content ? String(log.new_values.content) : '';
                  const oldDueDate = log.old_values?.due_date;
                  const newDueDate = log.new_values?.due_date;
                  const oldTitle = log.old_values?.title ? String(log.old_values.title) : '';
                  const newTitle = log.new_values?.title ? String(log.new_values.title) : '';
                  const oldChecklistCompleted = Number(log.old_values?.completed_count ?? 0);
                  const newChecklistCompleted = Number(log.new_values?.completed_count ?? 0);
                  const assigneeAddedId = log.new_values?.assignee_user_id
                    ? String(log.new_values.assignee_user_id)
                    : '';
                  const assigneeRemovedId = log.old_values?.assignee_user_id
                    ? String(log.old_values.assignee_user_id)
                    : '';

                  return (
                    <div 
                      key={log.id}
                      className="flex gap-4 group"
                    >
                      {/* Timeline dot */}
                      <div className="relative flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="w-px flex-1 bg-border mt-2" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          {log.user && (
                            <div 
                              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                              style={{ backgroundColor: log.user.avatar_color }}
                            >
                              {log.user.display_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-sm">
                            {log.user?.display_name || 'Kullanıcı'}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {actionLabels[log.action] || log.action}
                          </span>
                        </div>

                        {/* Todo title reference */}
                        {log.entity_type !== 'category' ? (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📋 {log.todo_title || '(görev bulunamadı)'}
                          </p>
                        ) : log.new_values?.name ? (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📁 {String(log.new_values.name)}
                          </p>
                        ) : null}

                        {/* Details */}
                        {log.action === 'status_changed' && oldStatus && newStatus && (
                          <div className="flex items-center gap-2 text-xs mt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-secondary">
                              {statusTr[oldStatus] ?? oldStatus}
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              {statusTr[newStatus] ?? newStatus}
                            </span>
                          </div>
                        )}

                        {log.action === 'priority_changed' && log.old_values && log.new_values && (
                          <div className="flex items-center gap-2 text-xs mt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-secondary">{priorityTr[oldPriority] ?? oldPriority}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600">{priorityTr[newPriority] ?? newPriority}</span>
                          </div>
                        )}

                        {log.action === 'due_date_changed' && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {newDueDate === null || newDueDate === undefined || newDueDate === ''
                              ? 'Tarih kaldırıldı'
                              : `${formatActionDate(oldDueDate)} → ${formatActionDate(newDueDate)}`}
                          </p>
                        )}

                        {log.action === 'title_changed' && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">
                            &quot;{oldTitle || '-'}&quot; → &quot;{newTitle || '-'}&quot;
                          </p>
                        )}

                        {log.action === 'description_changed' && (
                          <p className="text-xs text-muted-foreground mt-0.5">Açıklama güncellendi</p>
                        )}

                        {log.action === 'checklist_added' && (
                          <p className="text-xs text-muted-foreground mt-0.5">Kontrol listesine madde eklendi</p>
                        )}

                        {log.action === 'checklist_completed' && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Tamamlanan madde: {oldChecklistCompleted} → {newChecklistCompleted}
                          </p>
                        )}

                        {log.action === 'assignee_added' && assigneeAddedId && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Atanan kişi eklendi: {log.new_values?.assignee_display_name ? String(log.new_values.assignee_display_name) : assigneeAddedId}
                          </p>
                        )}

                        {log.action === 'assignee_removed' && assigneeRemovedId && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Atanan kişi kaldırıldı: {log.old_values?.assignee_display_name ? String(log.old_values.assignee_display_name) : assigneeRemovedId}
                          </p>
                        )}

                        {log.action === 'category_renamed' && log.old_values && log.new_values && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">
                            &quot;{String(log.old_values.name || '')}&quot; → &quot;{String(log.new_values.name || '')}&quot;
                          </p>
                        )}
                        {log.action === 'category_color_changed' && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Renk güncellendi: {String(log.new_values?.color || '')}
                          </p>
                        )}

                        {log.action === 'created' && createdTitle !== '' ? (
                          <p className="text-sm text-muted-foreground">
                            &quot;{createdTitle}&quot;
                          </p>
                        ) : null}

                        {log.action === 'comment_added' && commentContent && (
                          <p className="text-sm text-muted-foreground italic">
                            &quot;{commentContent}&quot;
                          </p>
                        )}

                        {log.action === 'attachment_added' && log.new_values?.file_name != null ? (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📎 {String(log.new_values.file_name)}
                          </p>
                        ) : null}
                        {log.action === 'attachment_removed' && log.old_values?.file_name != null ? (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            🗑 {String(log.old_values.file_name)}
                          </p>
                        ) : null}

                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: tr })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {logs.length === 0 && (
          <div className="text-center py-12 bg-secondary/30 rounded-xl border-2 border-dashed border-border">
            <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-medium mb-1">Henüz aktivite yok</h3>
            <p className="text-sm text-muted-foreground">
              Görev ekleyerek veya düzenleyerek başlayabilirsiniz
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
