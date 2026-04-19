'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspaceStore } from '@/lib/store';
import type { Priority, TodoStatus, ChecklistItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Calendar as CalendarIcon,
  Plus,
  X,
  User,
  Tag,
  Clock,
  CheckSquare,
  Trash2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Flag,
  MessageSquare,
  Paperclip,
  Activity,
  Link2,
  Send,
  MoreHorizontal,
  Smile,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

const priorityOptions = [
  { value: 'urgent', label: 'Acil', icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10' },
  { value: 'high', label: 'Yüksek', icon: ArrowUp, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { value: 'medium', label: 'Orta', icon: Minus, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  { value: 'low', label: 'Düşük', icon: ArrowDown, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { value: 'none', label: 'Yok', icon: Flag, color: 'text-muted-foreground', bg: 'bg-muted' },
];

const statusOptions = [
  { value: 'todo', label: 'Yapılacak', color: 'bg-gray-500' },
  { value: 'in_progress', label: 'Devam Ediyor', color: 'bg-blue-500' },
  { value: 'in_review', label: 'İncelemede', color: 'bg-yellow-500' },
  { value: 'blocked', label: 'Engellendi', color: 'bg-red-500' },
  { value: 'done', label: 'Tamamlandı', color: 'bg-green-500' },
];

type ActivityRecord = Record<string, unknown> | null;

type TodoActivityItem = {
  id: string;
  action: string;
  user_id: string;
  user_name: string;
  user_color: string;
  todo_title: string;
  old_values: ActivityRecord;
  new_values: ActivityRecord;
  created_at: string;
  old_status?: string;
  new_status?: string;
  old_priority?: string;
  new_priority?: string;
  old_due_date?: unknown;
  new_due_date?: unknown;
  old_title?: string;
  new_title?: string;
};

const statusTr: Record<string, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  in_review: 'İncelemede',
  done: 'Tamamlandı',
  blocked: 'Engellendi',
  cancelled: 'İptal',
};

const priorityTr: Record<string, string> = {
  urgent: 'Acil',
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
  none: 'Yok',
};

const activityActionLabels: Record<string, string> = {
  comment_added: 'yorum ekledi',
  created: 'görevi oluşturdu',
  updated: 'görevi güncelledi',
  status_changed: 'durumu değiştirdi',
  completed: 'görevi tamamladı',
  assigned: 'kullanıcı atadı',
  moved: 'görevi taşıdı',
  reordered: 'sırayı değiştirdi',
  priority_changed: 'önceliği değiştirdi',
  due_date_changed: 'bitiş tarihini değiştirdi',
  description_changed: 'açıklamayı güncelledi',
  title_changed: 'başlığı değiştirdi',
  checklist_added: 'kontrol maddesi ekledi',
  checklist_completed: 'kontrol maddesi tamamlandı',
  assignee_added: 'atanan kişi ekledi',
  assignee_removed: 'atanan kişiyi kaldırdı',
  attachment_added: 'dosya ekledi',
  attachment_removed: 'dosyayı sildi',
  category_renamed: 'kategori adını değiştirdi',
};

function toRecord(value: unknown): ActivityRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getTimestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeActivityAction(log: TodoActivityItem): TodoActivityItem {
  if (log.action !== 'updated') {
    return log;
  }

  const oldValues = log.old_values ?? {};
  const newValues = log.new_values ?? {};

  if (oldValues.status !== undefined && newValues.status !== undefined && oldValues.status !== newValues.status) {
    if (oldValues.status && newValues.status) {
      return { ...log, action: 'status_changed' };
    }
  }

  if (
    oldValues.priority !== undefined &&
    newValues.priority !== undefined &&
    oldValues.priority !== newValues.priority
  ) {
    if (oldValues.priority && newValues.priority) {
      return { ...log, action: 'priority_changed' };
    }
  }

  if (oldValues.title !== undefined && newValues.title !== undefined && oldValues.title !== newValues.title) {
    if (oldValues.title && newValues.title) {
      return { ...log, action: 'title_changed' };
    }
  }

  return log;
}

function dedupeActivityLogs(logs: TodoActivityItem[]): TodoActivityItem[] {
  const normalized = logs.map(normalizeActivityAction);
  const sorted = [...normalized].sort((a, b) => getTimestamp(b.created_at) - getTimestamp(a.created_at));
  const seen = new Set<string>();

  const result = sorted.filter((log) => {
    if (log.action === 'updated') {
      const hasSpecificNearby = normalized.some((other) => {
        if (other.id === log.id) {
          return false;
        }

        if (other.user_id !== log.user_id) {
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
    const dedupeKey = `${log.action}|${log.user_id}|${signature}`;

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
      if (other.user_id !== log.user_id) return false;

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

function formatActivityDate(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Tarih yok';
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return format(parsed, 'd MMM yyyy', { locale: tr });
}

export function TodoDetailModal() {
  const { 
    selectedTodo, 
    setSelectedTodo,
    isTodoModalOpen, 
    setTodoModalOpen,
    updateTodo,
    deleteTodo,
    addTodo,
    todos,
    categories,
    users,
    labels,
    currentUser
  } = useWorkspaceStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [previewAtt, setPreviewAtt] = useState<{ url: string; name: string; type: string | null } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    if (!previewAtt) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewAtt(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewAtt]);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionCursorPos, setMentionCursorPos] = useState(0);

  // Emoji reaction state
  // Structure: { [commentId]: { [emoji]: userId[] } }
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [openReactionPicker, setOpenReactionPicker] = useState<string | null>(null);
  const [reactionReloadKey, setReactionReloadKey] = useState(0);

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Activity log state
  const [activityLogs, setActivityLogs] = useState<TodoActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityReloadKey, setActivityReloadKey] = useState(0);

  useEffect(() => {
    if (!selectedTodo?.id) return;
    let cancelled = false;
    setLoadingActivity(true);

    const load = async () => {
      try {
        const todoId = selectedTodo.id;

        // Fetch all data in parallel (FK join kaldırıldı — user adı/rengi store'daki users listesinden resolve ediliyor)
        const [commentsResult, activityResult] = await Promise.all([
          supabase
            .from('comments')
            .select('id, content, created_at, created_by')
            .eq('todo_id', todoId)
            .order('created_at', { ascending: true }),
          supabase
            .from('activity_logs')
            .select('id, action, user_id, old_values, new_values, created_at')
            .eq('todo_id', todoId)
            .order('created_at', { ascending: true }),
        ]);

        if (cancelled) return;

        const usersById = new Map(users.map((u) => [u.id, u]));

        const commentLogs: TodoActivityItem[] = ((commentsResult.data || []) as any[]).map((c) => {
          const u = usersById.get(c.created_by);
          return {
            id: `comment-${c.id}`,
            action: 'comment_added',
            user_id: c.created_by || '',
            user_name: u?.display_name || 'Kullanıcı',
            user_color: u?.avatar_color || '#6366f1',
            todo_title: selectedTodo.title || '',
            old_values: null,
            new_values: { content: c.content?.slice(0, 80) || '', title: selectedTodo.title || '' },
            created_at: c.created_at,
          };
        });

        const actLogs: TodoActivityItem[] = ((activityResult.data || []) as any[]).map((a) => {
          const u = usersById.get(a.user_id);
          return {
            id: a.id,
            action: a.action,
            user_id: a.user_id || '',
            user_name: u?.display_name || 'Kullanıcı',
            user_color: u?.avatar_color || '#6366f1',
            todo_title: String((a.new_values as any)?.title || (a.old_values as any)?.title || selectedTodo.title || ''),
            old_values: a.old_values ?? null,
            new_values: a.new_values ?? null,
            created_at: a.created_at,
            old_status: (a.old_values as any)?.status,
            new_status: (a.new_values as any)?.status,
            old_priority: (a.old_values as any)?.priority,
            new_priority: (a.new_values as any)?.priority,
            old_due_date: (a.old_values as any)?.due_date,
            new_due_date: (a.new_values as any)?.due_date,
            old_title: (a.old_values as any)?.title,
            new_title: (a.new_values as any)?.title,
          };
        });

        const allLogs = dedupeActivityLogs([...commentLogs, ...actLogs]).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        if (!cancelled) {
          setActivityLogs(allLogs);
          setLoadingActivity(false);
        }
      } catch {
        if (!cancelled) {
          setActivityLogs([]);
          setLoadingActivity(false);
        }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [selectedTodo?.id, activityReloadKey, users]);

  // ── Emoji reaksiyonlarını yükle ───────────────────────────────────────────────
  const loadReactions = useCallback(async (commentIds: string[]) => {
    if (commentIds.length === 0) { setReactions({}); return; }
    const { data, error } = await supabase
      .from('comment_reactions')
      .select('comment_id, user_id, emoji')
      .in('comment_id', commentIds);
    if (error) return;
    const map: Record<string, Record<string, string[]>> = {};
    for (const row of (data || []) as { comment_id: string; user_id: string; emoji: string }[]) {
      if (!map[row.comment_id]) map[row.comment_id] = {};
      if (!map[row.comment_id][row.emoji]) map[row.comment_id][row.emoji] = [];
      map[row.comment_id][row.emoji].push(row.user_id);
    }
    setReactions(map);
  }, []);

  // Load reactions when todo changes or reactionReloadKey bumps
  useEffect(() => {
    if (!selectedTodo?.id) { setReactions({}); return; }
    const commentIds = (selectedTodo.comments || []).map(c => c.id);
    void loadReactions(commentIds);
  // reactionReloadKey intentionally triggers refetch
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTodo?.id, reactionReloadKey, loadReactions]);

  // Realtime subscription for comment_reactions while modal is open
  useEffect(() => {
    if (!selectedTodo?.id || !isTodoModalOpen) return;

    const channel = supabase
      .channel(`comment-reactions:${selectedTodo.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comment_reactions' },
        () => {
          // Refresh reactions for all comments of the current todo
          const commentIds = (useWorkspaceStore.getState().selectedTodo?.comments ?? []).map(c => c.id);
          if (commentIds.length > 0) {
            void loadReactions(commentIds);
          }
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [selectedTodo?.id, isTodoModalOpen, loadReactions]);
  // ─────────────────────────────────────────────────────────────────────────────

  // Realtime subscription for activity_logs + comments while modal is open
  useEffect(() => {
    if (!selectedTodo?.id || !isTodoModalOpen) return;

    const todoId = selectedTodo.id;

    const activityChannel = supabase
      .channel(`activity-logs-modal:${todoId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `todo_id=eq.${todoId}` }, () => {
        setActivityReloadKey(k => k + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `todo_id=eq.${todoId}` }, () => {
        setActivityReloadKey(k => k + 1);
      })
      .subscribe();

    return () => { void supabase.removeChannel(activityChannel); };
  }, [selectedTodo?.id, isTodoModalOpen]);

  if (!selectedTodo) return null;

  const handleClose = () => {
    setTodoModalOpen(false);
    setSelectedTodo(null);
    setIsEditingTitle(false);
  };

  const handleSaveTitle = () => {
    if (editTitle.trim()) {
      updateTodo(selectedTodo.id, { title: editTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const handleUpdatePriority = (priority: Priority) => {
    updateTodo(selectedTodo.id, { priority });
  };

  const handleUpdateStatus = (status: TodoStatus) => {
    updateTodo(selectedTodo.id, { 
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
      progress: status === 'done' ? 100 : selectedTodo.progress
    });
  };

  const handleUpdateCategory = (categoryId: string) => {
    updateTodo(selectedTodo.id, { category_id: categoryId });
  };

  const handleUpdateDescription = (description: string) => {
    updateTodo(selectedTodo.id, { description });
  };

  const handleAddChecklistItem = () => {
    if (newChecklistItem.trim()) {
      const freshTodo = useWorkspaceStore.getState().selectedTodo ?? selectedTodo;
      const newItem: ChecklistItem = {
        id: `check-${Date.now()}`,
        todo_id: selectedTodo.id,
        content: newChecklistItem.trim(),
        is_completed: false,
        position: (freshTodo.checklist_items?.length || 0),
        completed_at: null,
        completed_by: null,
      };
      updateTodo(selectedTodo.id, {
        checklist_items: [...(freshTodo.checklist_items || []), newItem]
      });
      setNewChecklistItem('');
    }
  };

  const handleToggleChecklistItem = (itemId: string) => {
    const freshTodo = useWorkspaceStore.getState().selectedTodo ?? selectedTodo;
    const updatedItems = freshTodo.checklist_items?.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          is_completed: !item.is_completed,
          completed_at: !item.is_completed ? new Date().toISOString() : null,
          completed_by: !item.is_completed ? (currentUser?.id ?? null) : null,
        };
      }
      return item;
    });
    
    const completedCount = updatedItems?.filter(i => i.is_completed).length || 0;
    const totalCount = updatedItems?.length || 0;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    updateTodo(selectedTodo.id, { 
      checklist_items: updatedItems,
      progress
    });
  };

  const handleDeleteChecklistItem = (itemId: string) => {
    const freshTodo = useWorkspaceStore.getState().selectedTodo ?? selectedTodo;
    const updatedItems = freshTodo.checklist_items?.filter(item => item.id !== itemId);
    updateTodo(selectedTodo.id, { checklist_items: updatedItems });
  };

  const handleToggleAssignee = (userId: string) => {
    const freshTodo = useWorkspaceStore.getState().selectedTodo ?? selectedTodo;
    const isAssigned = freshTodo.assignees?.some(a => a.user_id === userId);
    let updatedAssignees;
    
    if (isAssigned) {
      updatedAssignees = freshTodo.assignees?.filter(a => a.user_id !== userId);
    } else {
      const user = users.find(u => u.id === userId);
      updatedAssignees = [
        ...(freshTodo.assignees || []),
        {
          id: `assign-${Date.now()}`,
          todo_id: selectedTodo.id,
          user_id: userId,
          assigned_at: new Date().toISOString(),
          user
        }
      ];
    }
    updateTodo(selectedTodo.id, { assignees: updatedAssignees });
  };

  const handleToggleLabel = (labelId: string) => {
    const freshTodo = useWorkspaceStore.getState().selectedTodo ?? selectedTodo;
    const hasLabel = freshTodo.labels?.some(l => l.label_id === labelId);
    let updatedLabels;
    
    if (hasLabel) {
      updatedLabels = freshTodo.labels?.filter(l => l.label_id !== labelId);
    } else {
      const label = labels.find(l => l.id === labelId);
      updatedLabels = [
        ...(freshTodo.labels || []),
        {
          id: `tl-${Date.now()}`,
          todo_id: selectedTodo.id,
          label_id: labelId,
          label
        }
      ];
    }
    updateTodo(selectedTodo.id, { labels: updatedLabels });
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    deleteTodo(selectedTodo.id);
    setShowDeleteConfirm(false);
    handleClose();
  };

  // Comment submit (saves to DB)
  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser) return;

    const commentContent = newComment.trim();

    const { data, error } = await supabase
      .from('comments')
      .insert({
        todo_id: selectedTodo.id,
        content: commentContent,
        created_by: currentUser.id,
      })
      .select('*, created_by_user:users!comments_created_by_fkey(id, name, color)')
      .single();

    if (error) {
      console.warn('Failed to add comment:', error);
      return;
    }

    const newCommentObj = {
      id: data.id,
      todo_id: selectedTodo.id,
      user_id: currentUser.id,
      parent_id: null,
      content: commentContent,
      created_by: currentUser.id,
      created_at: data.created_at,
      updated_at: data.created_at,
      is_edited: false,
      edited_at: null,
      user: currentUser,
    };

    // Deduplicate by id to prevent double-entry when realtime event arrives
    // Use fresh store state to avoid overwriting concurrent realtime-added comments
    const freshTodo = useWorkspaceStore.getState().selectedTodo ?? selectedTodo;
    const currentComments = freshTodo.comments || [];
    const alreadyPresent = currentComments.some((c) => c.id === data.id);
    if (!alreadyPresent) {
      updateTodo(selectedTodo.id, {
        comments: [...currentComments, newCommentObj],
      });
    }

    // ── @mention bildirimi ────────────────────────────────────────────────────
    const mentionRegex = /@(\w+)/g;
    const mentionedUsernames: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = mentionRegex.exec(commentContent)) !== null) {
      mentionedUsernames.push(m[1].toLowerCase());
    }

    if (mentionedUsernames.length > 0) {
      // Kendini mention etme, her kullanıcıya en fazla 1 bildirim
      const mentionedUsers = users.filter(
        u =>
          u.id !== currentUser.id &&
          mentionedUsernames.includes((u.username || '').toLowerCase())
      );

      const uniqueMentioned = [...new Map(mentionedUsers.map(u => [u.id, u])).values()];

      if (uniqueMentioned.length > 0) {
        const preview = commentContent.length > 80
          ? `${commentContent.slice(0, 80)}…`
          : commentContent;

        const notifRows = uniqueMentioned.map(u => ({
          user_id:         u.id,
          type:            'mention' as const,
          title:           `${currentUser.display_name} sizi yorumda bahsetti`,
          message:         `"${preview}"`,
          related_todo_id: selectedTodo.id,
          is_read:         false,
        }));

        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notifRows);

        if (notifError) {
          console.warn('Mention bildirimi oluşturulamadı:', notifError);
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    setNewComment('');
    setActivityReloadKey(k => k + 1);
  };

  // Mention autocomplete handlers
  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart || 0;
    setNewComment(val);
    const textBeforeCursor = val.slice(0, cursor);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1].toLowerCase());
      setMentionCursorPos(cursor - match[0].length);
      setShowMentionDropdown(true);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery('');
    }
  };

  const handleSelectMention = (username: string) => {
    const before = newComment.slice(0, mentionCursorPos);
    const after = newComment.slice(mentionCursorPos + mentionQuery.length + 1);
    setNewComment(`${before}@${username} ${after}`);
    setShowMentionDropdown(false);
    setMentionQuery('');
  };

  const mentionUsers = users.filter(u =>
    u.username?.toLowerCase().includes(mentionQuery) ||
    u.display_name?.toLowerCase().includes(mentionQuery)
  ).slice(0, 6);

  // ── Emoji reaksiyon toggle ───────────────────────────────────────────────────
  const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '✅'];

  const handleToggleReaction = async (commentId: string, emoji: string) => {
    if (!currentUser) return;
    const existing = reactions[commentId]?.[emoji] || [];
    const hasReacted = existing.includes(currentUser.id);

    // Capture snapshot for rollback
    const prevReactions = reactions;

    // Optimistic update
    setReactions(prev => {
      const next = { ...prev, [commentId]: { ...(prev[commentId] || {}) } };
      const userList = [...(next[commentId][emoji] || [])];
      next[commentId][emoji] = hasReacted
        ? userList.filter(id => id !== currentUser.id)
        : [...userList, currentUser.id];
      return next;
    });
    setOpenReactionPicker(null);

    // Persist to DB; rollback optimistic update on error
    try {
      if (hasReacted) {
        const { error } = await supabase
          .from('comment_reactions')
          .delete()
          .match({ comment_id: commentId, user_id: currentUser.id, emoji });
        if (error) {
          console.warn('Failed to delete reaction:', error);
          setReactions(prevReactions);
        }
      } else {
        const { error } = await supabase
          .from('comment_reactions')
          .insert({ comment_id: commentId, user_id: currentUser.id, emoji });
        if (error) {
          console.warn('Failed to insert reaction:', error);
          setReactions(prevReactions);
        }
      }
    } catch {
      // Table may not exist yet — rollback optimistic state
      setReactions(prevReactions);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────────

  // File upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTodo || !currentUser) return;

    if (file.size > 52428800) {
      console.warn('File too large (max 50MB)');
      return;
    }

    const ext = file.name.split('.').pop() || 'bin';
    const path = `${selectedTodo.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        console.warn('Upload failed:', uploadError);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('attachments')
        .getPublicUrl(path);

      const fileUrl = urlData.publicUrl;

      // Save to attachments table
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 5);

      const { data: attachmentData, error: dbError } = await supabase
        .from('attachments')
        .insert({
          todo_id: selectedTodo.id,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          file_url: fileUrl,
          uploaded_by: currentUser.id,
          expires_at: expiresAt.toISOString(),
        })
        .select('*')
        .single();

      if (dbError) {
        console.warn('Failed to save attachment record:', dbError);
        return;
      }

      // Add to local todo state
      const newAttachment = {
        id: attachmentData.id,
        todo_id: selectedTodo.id,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        file_url: fileUrl,
        thumbnail_url: null,
        uploaded_by: currentUser.id,
        created_at: attachmentData.created_at,
        expires_at: attachmentData.expires_at ?? null,
      };

      const freshTodo = useWorkspaceStore.getState().selectedTodo ?? selectedTodo;
      updateTodo(selectedTodo.id, {
        attachments: [...(freshTodo.attachments || []), newAttachment],
      });

      const { error: activityError } = await supabase.from('activity_logs').insert({
        workspace_id: '00000000-0000-0000-0000-000000000001',
        todo_id: selectedTodo.id,
        user_id: currentUser.id,
        action: 'attachment_added',
        entity_type: 'todo',
        entity_id: selectedTodo.id,
        old_values: { title: selectedTodo.title },
        new_values: { title: selectedTodo.title, file_name: file.name, file_type: file.type },
      });
      if (activityError) {
        console.warn('Failed to log attachment activity:', activityError);
      }
      setActivityReloadKey(k => k + 1);

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (err) {
      console.warn('File upload error:', err);
    }
  };

  const handleDeleteAttachment = async (att: { id: string; file_url: string; file_name: string; file_type: string; file_size: number }) => {
    if (!selectedTodo || !currentUser) return;

    // Extract storage path from URL — URL format is: .../storage/v1/object/public/attachments/{path}
    try {
      const urlObj = new URL(att.file_url);
      const marker = '/object/public/attachments/';
      const markerIndex = urlObj.pathname.indexOf(marker);
      if (markerIndex !== -1) {
        const storagePath = urlObj.pathname.slice(markerIndex + marker.length);
        await supabase.storage.from('attachments').remove([storagePath]);
      }
    } catch {
      // ignore storage delete errors — still remove from DB
    }

    // Delete from DB
    const { error: dbError } = await supabase.from('attachments').delete().eq('id', att.id);
    if (dbError) {
      console.warn('Failed to delete attachment:', dbError);
      return;
    }

    // Update local state
    const freshTodo = useWorkspaceStore.getState().selectedTodo ?? selectedTodo;
    updateTodo(selectedTodo.id, {
      attachments: (freshTodo.attachments || []).filter((a) => a.id !== att.id),
    });

    // Log activity
    await supabase.from('activity_logs').insert({
      workspace_id: '00000000-0000-0000-0000-000000000001',
      todo_id: selectedTodo.id,
      user_id: currentUser.id,
      action: 'attachment_removed',
      entity_type: 'todo',
      entity_id: selectedTodo.id,
      old_values: { title: selectedTodo.title, file_name: att.file_name },
      new_values: { title: selectedTodo.title },
    });
    setActivityReloadKey(k => k + 1);
  };

  const priority = priorityOptions.find(p => p.value === selectedTodo.priority) || priorityOptions[4];
  const status = statusOptions.find(s => s.value === selectedTodo.status) || statusOptions[0];
  const completedChecklist = selectedTodo.checklist_items?.filter(i => i.is_completed).length || 0;
  const totalChecklist = selectedTodo.checklist_items?.length || 0;

  return (
    <>
    <Dialog open={isTodoModalOpen} onOpenChange={(open) => { if (!previewAtt) setTodoModalOpen(open); }}>
      <DialogContent showCloseButton={false} className="!w-[96vw] !max-w-[1400px] h-[88vh] overflow-hidden p-0">
        <VisuallyHidden>
          <DialogTitle>{selectedTodo.title}</DialogTitle>
        </VisuallyHidden>
        <DialogDescription className="sr-only">
          Görev detaylarını görüntüle ve düzenle
        </DialogDescription>
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_390px]">
          {/* Main Content */}
          <div className="min-w-0 overflow-y-auto p-7">
            {/* Header */}
            <div className="flex items-start gap-3 mb-5">
              <Checkbox 
                checked={selectedTodo.status === 'done'}
                onCheckedChange={(checked) => handleUpdateStatus(checked ? 'done' : 'todo')}
                className="mt-1.5"
              />
              <div className="flex-1">
                {isEditingTitle ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={handleSaveTitle}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                    className="text-xl font-semibold"
                    autoFocus
                  />
                ) : (
                  <h2 
                    className={cn(
                      "text-xl font-semibold cursor-pointer hover:text-primary",
                      selectedTodo.status === 'done' && "line-through text-muted-foreground"
                    )}
                    onClick={() => {
                      setEditTitle(selectedTodo.title);
                      setIsEditingTitle(true);
                    }}
                  >
                    {selectedTodo.title}
                  </h2>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Labels */}
            {selectedTodo.labels && selectedTodo.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {selectedTodo.labels.map((tl) => (
                  <span
                    key={tl.id}
                    className="px-2 py-0.5 rounded text-xs text-white"
                    style={{ backgroundColor: tl.label?.color }}
                  >
                    {tl.label?.name}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            <div className="mb-6">
              <Textarea
                placeholder="Açıklama ekle..."
                value={selectedTodo.description}
                onChange={(e) => handleUpdateDescription(e.target.value)}
                className="min-h-32 resize-none"
              />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="checklist" className="w-full">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="checklist" className="gap-2">
                  <CheckSquare className="w-4 h-4" />
                  Alt Gorevler
                  {totalChecklist > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {completedChecklist}/{totalChecklist}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="comments" className="gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Yorumlar
                </TabsTrigger>
                <TabsTrigger value="attachments" className="gap-2">
                  <Paperclip className="w-4 h-4" />
                  Ekler
                </TabsTrigger>
                <TabsTrigger value="activity" className="gap-2">
                  <Activity className="w-4 h-4" />
                  Aktivite
                </TabsTrigger>
              </TabsList>

              {/* Alt Gorevler Tab */}
              <TabsContent value="checklist" className="mt-4">

                {/* Progress - sadece öğe varsa göster */}
                {totalChecklist > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        İlerleme
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {completedChecklist}/{totalChecklist}
                        <span className="font-normal text-muted-foreground ml-1">
                          ({selectedTodo.progress}%)
                        </span>
                      </span>
                    </div>
                    <div className="flex-1 h-1.5 bg-border/50 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          selectedTodo.progress === 100 ? "bg-emerald-500" : "bg-emerald-500/80"
                        )}
                        style={{ width: `${selectedTodo.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Liste */}
                <div className="space-y-px">
                  {(selectedTodo.checklist_items || []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8 opacity-60">
                      Henüz alt görev eklenmedi
                    </p>
                  )}

                  {(selectedTodo.checklist_items || [])
                    .slice()
                    .sort((a, b) => {
                      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
                      return a.position - b.position;
                    })
                    .map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-secondary/50 transition-colors"
                      >
                        {/* Checkbox dairesi */}
                        <button
                          type="button"
                          onClick={() => handleToggleChecklistItem(item.id)}
                          className={cn(
                            "shrink-0 w-[18px] h-[18px] rounded-full border transition-all duration-150 flex items-center justify-center",
                            item.is_completed
                              ? "bg-emerald-500 border-emerald-500"
                              : "border-border/70 hover:border-emerald-500/60 bg-transparent"
                          )}
                        >
                          {item.is_completed && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>

                        {/* Metin */}
                        <span className={cn(
                          "flex-1 text-sm",
                          item.is_completed
                            ? "line-through text-muted-foreground/50"
                            : "text-foreground"
                        )}>
                          {item.content}
                        </span>

                        {/* Sil */}
                        <button
                          type="button"
                          onClick={() => handleDeleteChecklistItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                </div>

                {/* Ayırıcı */}
                {(selectedTodo.checklist_items || []).length > 0 && (
                  <div className="border-t border-border/40 mt-3 mb-1" />
                )}

                {/* Yeni öğe ekle */}
                <div className="flex items-center gap-3 py-2 px-2 group">
                  <div className="shrink-0 w-[18px] h-[18px] rounded-full border border-dashed border-border/50 group-focus-within:border-primary/50 transition-colors" />
                  <Input
                    placeholder="Alt görev ekle..."
                    value={newChecklistItem}
                    onChange={(e) => setNewChecklistItem(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                    className="flex-1 h-auto py-0 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 placeholder:text-muted-foreground/40"
                  />
                  {newChecklistItem.trim() && (
                    <kbd
                      onClick={handleAddChecklistItem}
                      className="cursor-pointer shrink-0 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 hover:text-foreground hover:border-foreground/30 transition-colors select-none"
                    >
                      ↵
                    </kbd>
                  )}
                </div>

              </TabsContent>

              {/* Comments Tab */}
              <TabsContent value="comments" className="mt-0">
                <div className="flex flex-col">

                  {/* Comment list */}
                  <div className="space-y-1 py-2 px-1 min-h-[120px]">
                    {(selectedTodo.comments || []).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center select-none opacity-60">
                        <MessageSquare className="w-8 h-8 text-muted-foreground/40 mb-3" strokeWidth={1.5} />
                        <p className="text-xs text-muted-foreground">Henüz yorum eklenmedi</p>
                      </div>
                    )}

                    {(selectedTodo.comments || []).map((comment, idx, arr) => {
                      const isMine = currentUser?.id === (comment as any).user?.id;
                      const prevComment = arr[idx - 1];
                      const isSameAuthorAsPrev = prevComment && (prevComment as any).user?.id === (comment as any).user?.id;
                      const commentReactions = reactions[comment.id] || {};
                      const emojiEntries = Object.entries(commentReactions).filter(([, us]) => us.length > 0);

                      return (
                        <div
                          key={comment.id}
                          className={cn(
                            "group flex gap-2 items-end",
                            isMine && "flex-row-reverse",
                            isSameAuthorAsPrev ? "mt-0.5" : "mt-3"
                          )}
                        >
                          {/* Avatar — sadece ilk mesajda ya da farklı kişide */}
                          {!isSameAuthorAsPrev ? (
                            (comment as any).user?.avatar_url ? (
                              <img
                                src={(comment as any).user.avatar_url}
                                alt={(comment as any).user.display_name || 'U'}
                                className="w-6 h-6 rounded-full object-cover shrink-0 mb-0.5"
                              />
                            ) : (
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-0.5"
                                style={{ backgroundColor: (comment as any).user?.avatar_color || '#6366f1' }}
                              >
                                {((comment as any).user?.display_name || 'U').charAt(0).toUpperCase()}
                              </div>
                            )
                          ) : (
                            <div className="w-6 shrink-0" />
                          )}

                          <div className={cn("flex flex-col min-w-0", isMine ? "items-end max-w-[80%]" : "items-start max-w-[80%]")}>

                            {/* Name + time — sadece ilk mesajda */}
                            {!isSameAuthorAsPrev && (
                              <div className={cn("flex items-center gap-1.5 mb-1", isMine && "flex-row-reverse")}>
                                <span className="text-[11px] font-medium text-foreground/60">
                                  {(comment as any).user?.display_name || 'Kullanıcı'}
                                </span>
                                <span className="text-[10px] text-muted-foreground/40">
                                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: tr })}
                                </span>
                              </div>
                            )}

                            {/* Bubble */}
                            <div
                              className={cn(
                                "px-3 py-1.5 text-sm leading-relaxed break-words max-w-full",
                                isMine
                                  ? "bg-primary/90 text-primary-foreground rounded-2xl rounded-tr-md"
                                  : "bg-secondary text-foreground rounded-2xl rounded-tl-md"
                              )}
                            >
                              {comment.content.split(/(@\w+)/g).map((part, i) =>
                                /^@\w+$/.test(part) ? (
                                  <span
                                    key={i}
                                    className={cn(
                                      "font-semibold",
                                      isMine ? "text-white/80" : "text-primary"
                                    )}
                                  >
                                    {part}
                                  </span>
                                ) : part
                              )}
                            </div>

                            {/* Time — sadece isSameAuthor olduğunda hover'da göster */}
                            {isSameAuthorAsPrev && (
                              <span className="text-[10px] text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 px-1">
                                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: tr })}
                              </span>
                            )}

                            {/* Reactions */}
                            {(emojiEntries.length > 0 || true) && (
                              <div className={cn("flex flex-wrap items-center gap-1 mt-1", isMine && "justify-end")}>
                                {emojiEntries.map(([emoji, us]) => {
                                  const hasReacted = currentUser ? us.includes(currentUser.id) : false;
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => handleToggleReaction(comment.id, emoji)}
                                      className={cn(
                                        "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all",
                                        hasReacted
                                          ? "bg-primary/10 border-primary/30 text-primary"
                                          : "bg-background border-border/40 text-muted-foreground hover:border-border"
                                      )}
                                    >
                                      <span>{emoji}</span>
                                      <span className="tabular-nums font-medium">{us.length}</span>
                                    </button>
                                  );
                                })}
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={() => setOpenReactionPicker(openReactionPicker === comment.id ? null : comment.id)}
                                    className={cn(
                                      "flex items-center justify-center w-5 h-5 rounded-full transition-all text-muted-foreground/50 hover:text-muted-foreground",
                                      openReactionPicker === comment.id
                                        ? "opacity-100"
                                        : "opacity-0 group-hover:opacity-100"
                                    )}
                                  >
                                    <Smile className="w-3.5 h-3.5" />
                                  </button>
                                  {openReactionPicker === comment.id && (
                                    <div className={cn(
                                      "absolute bottom-full mb-1 flex gap-0.5 p-1 bg-popover border border-border/60 rounded-xl shadow-lg z-50",
                                      isMine ? "right-0" : "left-0"
                                    )}>
                                      {REACTION_EMOJIS.map((emoji) => (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={() => handleToggleReaction(comment.id, emoji)}
                                          className="text-base w-7 h-7 flex items-center justify-center rounded-lg hover:bg-secondary transition-all hover:scale-110"
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Input area */}
                  <div className="pt-2 border-t border-border/20 mt-2">
                    <div className="flex gap-2 items-center">
                      {currentUser && (
                        currentUser.avatar_url ? (
                          <img
                            src={currentUser.avatar_url}
                            alt={currentUser.display_name}
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                            style={{ backgroundColor: currentUser.avatar_color }}
                          >
                            {currentUser.display_name.charAt(0).toUpperCase()}
                          </div>
                        )
                      )}
                      <div className="flex-1 relative">
                        <div className="flex items-center gap-2 bg-secondary/50 hover:bg-secondary/70 focus-within:bg-background border border-transparent focus-within:border-border/60 rounded-xl px-3 py-1.5 transition-all duration-200">
                          <Input
                            placeholder="Yorum yaz..."
                            value={newComment}
                            onChange={handleCommentChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !showMentionDropdown) handleAddComment();
                              if (e.key === 'Escape') setShowMentionDropdown(false);
                            }}
                            className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 py-0 h-auto text-sm placeholder:text-muted-foreground/40"
                          />
                          {newComment.trim() && (
                            <button
                              type="button"
                              onClick={handleAddComment}
                              disabled={!currentUser}
                              className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/85 transition-all hover:scale-105"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {showMentionDropdown && mentionUsers.length > 0 && (
                          <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden py-1">
                            {mentionUsers.map((user) => (
                              <button
                                key={user.id}
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary text-left transition-colors"
                                onMouseDown={(e) => { e.preventDefault(); handleSelectMention(user.username || user.display_name); }}
                              >
                                {user.avatar_url ? (
                                  <img src={user.avatar_url} alt={user.display_name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: user.avatar_color }}>
                                    {user.display_name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="font-medium text-foreground text-xs leading-tight">{user.display_name}</p>
                                  <p className="text-muted-foreground text-[10px]">@{user.username}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </TabsContent>

              {/* Attachments Tab */}
              <TabsContent value="attachments" className="mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {/* Existing attachments */}
                {(selectedTodo.attachments || []).length > 0 && (
                  <div className="space-y-2 mb-4">
                    {(selectedTodo.attachments || []).map((att) => {
                      const isImage = att.file_type?.startsWith('image/');
                      const ext = att.file_name?.split('.').pop()?.toLowerCase() || '';
                      const fileIcon = (() => {
                        if (ext === 'pdf') return { label: 'P', cls: 'bg-red-500' };
                        if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return { label: 'V', cls: 'bg-purple-500' };
                        if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return { label: 'A', cls: 'bg-blue-400' };
                        if (['doc', 'docx'].includes(ext)) return { label: 'W', cls: 'bg-blue-600' };
                        if (['xls', 'xlsx'].includes(ext)) return { label: 'X', cls: 'bg-green-600' };
                        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { label: 'Z', cls: 'bg-gray-500' };
                        return { label: 'F', cls: 'bg-gray-400' };
                      })();
                      return (
                        <div key={att.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50 text-sm">
                          {isImage ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewAtt({ url: att.file_url, name: att.file_name, type: att.file_type });
                              }}
                              className="shrink-0"
                            >
                              <img src={att.file_url} alt={att.file_name} className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewAtt({ url: att.file_url, name: att.file_name, type: att.file_type });
                              }}
                              className="shrink-0"
                            >
                              <div className={cn("w-10 h-10 rounded flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:opacity-80 transition-opacity", fileIcon.cls)}>
                                {fileIcon.label}
                              </div>
                            </button>
                          )}
                          <button
                            type="button"
                            className="flex-1 text-foreground hover:underline truncate text-left"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewAtt({ url: att.file_url, name: att.file_name, type: att.file_type });
                            }}
                          >
                            {att.file_name}
                          </button>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : ''}
                          </span>
                          {(att as any).expires_at && (() => {
                            const expiresDate = new Date((att as any).expires_at);
                            const daysLeft = Math.max(0, Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                            const formattedDate = expiresDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
                            const color = daysLeft <= 1 ? 'text-red-500' : daysLeft <= 3 ? 'text-orange-500' : 'text-muted-foreground';
                            return (
                              <span className={`text-xs shrink-0 ${color}`} title={`${formattedDate} tarihinde otomatik silinecek`}>
                                ⏱ {formattedDate} ({daysLeft} gün kaldı)
                              </span>
                            );
                          })()}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteAttachment(att);
                            }}
                            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                            title="Eki sil"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <Paperclip className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-1">
                    Dosyaları buraya sürükleyin veya tıklayın
                  </p>
                  <p className="text-xs text-muted-foreground/70 mb-3">
                    Maksimum dosya boyutu: <span className="font-medium text-orange-500">50 MB</span> · Ekler <span className="font-medium">5 gün</span> sonra otomatik silinir
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Dosya Seç
                  </Button>
                </div>
              </TabsContent>

              {/* Activity Tab */}
              <TabsContent value="activity" className="mt-4">
                {loadingActivity ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Yükleniyor...</p>
                ) : activityLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Henüz aktivite yok</p>
                ) : (
                  <div className="space-y-3">
                    {activityLogs.map((log) => (
                      <div key={log.id} className="flex gap-3 text-sm">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                          style={{ backgroundColor: log.user_color }}
                        >
                          {log.user_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          {(() => {
                            const oldStatus = log.old_values?.status ? String(log.old_values.status) : '';
                            const newStatus = log.new_values?.status ? String(log.new_values.status) : '';
                            const oldPriority = log.old_values?.priority ? String(log.old_values.priority) : '';
                            const newPriority = log.new_values?.priority ? String(log.new_values.priority) : '';
                            const oldDueDate = log.old_values?.due_date;
                            const newDueDate = log.new_values?.due_date;
                            const oldTitle = log.old_values?.title ? String(log.old_values.title) : '';
                            const newTitle = log.new_values?.title ? String(log.new_values.title) : '';
                            const oldCompleted = Number(log.old_values?.completed_count ?? 0);
                            const newCompleted = Number(log.new_values?.completed_count ?? 0);
                            const assigneeAdded = log.new_values?.assignee_user_id
                              ? String(log.new_values.assignee_user_id)
                              : '';
                            const assigneeRemoved = log.old_values?.assignee_user_id
                              ? String(log.old_values.assignee_user_id)
                              : '';
                            const commentContent = log.new_values?.content ? String(log.new_values.content) : '';

                            return (
                              <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-foreground">{log.user_name}</span>
                            <span className="text-muted-foreground">
                              {activityActionLabels[log.action] || log.action}
                            </span>
                            {log.action === 'status_changed' && oldStatus && newStatus && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary">
                                {statusTr[oldStatus] ?? oldStatus} → {statusTr[newStatus] ?? newStatus}
                              </span>
                            )}
                            {log.action === 'priority_changed' && oldPriority && newPriority && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary">
                                {priorityTr[oldPriority] ?? oldPriority} → {priorityTr[newPriority] ?? newPriority}
                              </span>
                            )}
                            {log.action === 'due_date_changed' && (
                              <span className="text-xs text-muted-foreground">
                                {newDueDate === null || newDueDate === undefined || newDueDate === ''
                                  ? 'Tarih kaldırıldı'
                                  : `${formatActivityDate(oldDueDate)} → ${formatActivityDate(newDueDate)}`}
                              </span>
                            )}
                            {log.action === 'checklist_added' && (
                              <span className="text-xs text-muted-foreground">Kontrol listesine madde eklendi</span>
                            )}
                            {log.action === 'checklist_completed' && (
                              <span className="text-xs text-muted-foreground">
                                Tamamlanan madde: {oldCompleted} → {newCompleted}
                              </span>
                            )}
                            {log.action === 'description_changed' && (
                              <p className="text-xs text-muted-foreground mt-0.5">Açıklama güncellendi</p>
                            )}
                            {log.action === 'moved' && log.new_values && (
                              <p className="text-xs text-muted-foreground mt-0.5">Kategori değiştirildi</p>
                            )}
                            {log.action === 'created' && (
                              <p className="text-xs text-muted-foreground mt-0.5">Görev oluşturuldu</p>
                            )}
                            {log.action === 'completed' && (
                              <p className="text-xs text-muted-foreground mt-0.5">Görev tamamlandı ✓</p>
                            )}
                            {log.action === 'deleted' && (
                              <p className="text-xs text-muted-foreground mt-0.5">Görev silindi</p>
                            )}
                            {log.action === 'assignee_added' && assigneeAdded && (
                              <span className="text-xs text-muted-foreground">Atanan eklendi: {assigneeAdded}</span>
                            )}
                            {log.action === 'assignee_removed' && assigneeRemoved && (
                              <span className="text-xs text-muted-foreground">Atanan kaldirildi: {assigneeRemoved}</span>
                            )}
                            {log.action === 'title_changed' && (
                              <span className="text-xs text-muted-foreground italic">&quot;{oldTitle || '-'}&quot; → &quot;{newTitle || '-'}&quot;</span>
                            )}
                            {log.action === 'description_changed' && (
                              <span className="text-xs text-muted-foreground">Açıklama güncellendi</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">📋 {log.todo_title || '(görev bulunamadı)'}</p>
                          {log.action === 'comment_added' && commentContent && (
                            <p className="text-foreground/80 text-xs mt-0.5 italic">&quot;{commentContent}&quot;</p>
                          )}
                          {log.action === 'attachment_added' && log.new_values?.file_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              📎 {String(log.new_values.file_name)}
                            </p>
                          )}
                          {log.action === 'attachment_removed' && log.old_values?.file_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              🗑 {String(log.old_values.file_name)}
                            </p>
                          )}
                          {log.action === 'category_renamed' && log.old_values?.name && log.new_values?.name && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">
                              &quot;{String(log.old_values.name)}&quot; → &quot;{String(log.new_values.name)}&quot;
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: tr })}
                          </p>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              </Tabs>
          </div>

          {/* Sidebar */}
          <div className="min-h-0 overflow-y-auto border-t border-border bg-secondary/20 p-5 lg:border-t-0 lg:border-l">
            {/* Status */}
            <div className="mb-5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Durum
              </label>
              <Select value={selectedTodo.status} onValueChange={(v) => handleUpdateStatus(v as TodoStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", option.color)} />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div className="mb-5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Öncelik
              </label>
              <Select value={selectedTodo.priority} onValueChange={(v) => handleUpdatePriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <option.icon className={cn("w-4 h-4", option.color)} />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="mb-5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Kategori
              </label>
              <Select value={selectedTodo.category_id} onValueChange={handleUpdateCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div className="mb-5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Bitiş Tarihi
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {selectedTodo.due_date
                      ? format(new Date(selectedTodo.due_date), 'd MMM yyyy', { locale: tr })
                      : 'Seç...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedTodo.due_date ? new Date(selectedTodo.due_date) : undefined}
                    onSelect={(date) => updateTodo(selectedTodo.id, { due_date: date?.toISOString() || null })}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Assignees */}
            <div className="mb-5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Atananlar
              </label>
              <div className="space-y-1">
                {users.map((user) => {
                  const isAssigned = selectedTodo.assignees?.some(a => a.user_id === user.id);
                  return (
                    <button
                      key={user.id}
                      onClick={() => handleToggleAssignee(user.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-all",
                        isAssigned ? "bg-primary/10" : "hover:bg-secondary"
                      )}
                    >
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.display_name} className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                          style={{ backgroundColor: user.avatar_color }}
                        >
                          {user.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm flex-1">{user.display_name}</span>
                      {isAssigned && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Labels */}
            <div className="mb-5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                Etiketler
              </label>
              <div className="flex flex-wrap gap-1">
                {labels.map((label) => {
                  const hasLabel = selectedTodo.labels?.some(l => l.label_id === label.id);
                  return (
                    <button
                      key={label.id}
                      onClick={() => handleToggleLabel(label.id)}
                      className={cn(
                        "px-2 py-1 rounded text-xs text-white transition-all",
                        hasLabel ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-60 hover:opacity-100"
                      )}
                      style={{ 
                        backgroundColor: label.color,
                        ...(hasLabel && { boxShadow: `0 0 0 2px ${label.color}40` })
                      }}
                    >
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Delete Button */}
            {!showDeleteConfirm ? (
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Görevi Sil
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-destructive font-medium text-center">Emin misiniz?</p>
                <p className="text-xs text-muted-foreground text-center">Bu görev kalıcı olarak silinecek.</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    İptal
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    onClick={handleConfirmDelete}
                  >
                    Sil
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Attachment Preview Modal */}
    {isMounted && previewAtt && createPortal(
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.85)', pointerEvents: 'all' }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.stopPropagation();
            setPreviewAtt(null);
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div
          style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', backgroundColor: 'var(--background)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60vw' }}>
              {previewAtt.name}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer' }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    if (typeof window !== 'undefined' && typeof (window as any).electron?.downloadFile === 'function') {
                      (window as any).electron.downloadFile(previewAtt.url, previewAtt.name);
                      return;
                    }
                  } catch {
                    // fall through to anchor download
                  }
                  const a = document.createElement('a');
                  a.href = previewAtt.url;
                  a.download = previewAtt.name;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                İndir
              </button>
              <button
                type="button"
                style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--foreground)', fontSize: '16px', fontWeight: 'bold' }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreviewAtt(null); }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Content */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', minWidth: '320px', minHeight: '200px' }}>
            {previewAtt.type?.startsWith('image/') ? (
              <img
                src={previewAtt.url}
                alt={previewAtt.name}
                style={{ maxWidth: '85vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            ) : previewAtt.type === 'application/pdf' ? (
              <iframe
                src={previewAtt.url}
                style={{ width: '80vw', height: '75vh', borderRadius: '8px', border: 'none' }}
                title={previewAtt.name}
              />
            ) : previewAtt.type?.startsWith('video/') ? (
              <video
                src={previewAtt.url}
                controls
                style={{ maxWidth: '85vw', maxHeight: '75vh', borderRadius: '8px' }}
              />
            ) : previewAtt.type?.startsWith('audio/') ? (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>{previewAtt.name}</p>
                <audio src={previewAtt.url} controls />
              </div>
            ) : (
              <div style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <span style={{ fontSize: '24px' }}>📎</span>
                </div>
                <p style={{ fontSize: '14px', color: 'var(--muted-foreground)', marginBottom: '8px' }}>{previewAtt.name}</p>
                <p style={{ fontSize: '12px', color: 'var(--muted-foreground)', marginBottom: '16px' }}>Bu dosya türü önizlenemiyor</p>
                <button
                  type="button"
                  style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                  onClick={() => {
try {
                       if (typeof window !== 'undefined' && typeof (window as any).electron?.downloadFile === 'function') {
                         (window as any).electron.downloadFile(previewAtt.url, previewAtt.name);
                         return;
                       }
                     } catch {
                       // fall through to anchor download
                     }
                     const a = document.createElement('a');
                     a.href = previewAtt.url;
                     a.download = previewAtt.name;
                     document.body.appendChild(a);
                     a.click();
                     document.body.removeChild(a);
                  }}
                >
                  İndir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
