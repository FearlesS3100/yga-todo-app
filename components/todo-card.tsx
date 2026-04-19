'use client';

import { useState } from 'react';
import type { Todo } from '@/lib/types';
import { useWorkspaceStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  Calendar,
  Clock,
  MessageSquare,
  Paperclip,
  CheckSquare,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Minus,
  Flag,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, isPast, isToday, isTomorrow, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';

interface TodoCardProps {
  todo: Todo;
  isDragging?: boolean;
}

const priorityConfig = {
  urgent: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Acil' },
  high: { icon: ArrowUp, color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'Yüksek' },
  medium: { icon: Minus, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Orta' },
  low: { icon: ArrowDown, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Düşük' },
  none: { icon: Flag, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Yok' },
};

const statusLabelMap: Record<string, string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  in_review: 'İncelemede',
  done: 'Tamamlandı',
  blocked: 'Engellendi',
  cancelled: 'İptal',
};

export function TodoCard({ todo, isDragging }: TodoCardProps) {
  const { setSelectedTodo, setTodoModalOpen, deleteTodo, users } = useWorkspaceStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleClick = () => {
    setSelectedTodo(todo);
    setTodoModalOpen(true);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTodo(todo.id);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  const priority = priorityConfig[todo.priority];
  const PriorityIcon = priority.icon;

  const completedChecklist = todo.checklist_items?.filter(item => item.is_completed).length || 0;
  const totalChecklist = todo.checklist_items?.length || 0;

  const getDueDateInfo = () => {
    if (!todo.due_date) return null;
    const dueDate = new Date(todo.due_date);
    const isOverdue = isPast(dueDate) && todo.status !== 'done';
    const isDueToday = isToday(dueDate);
    const isDueTomorrow = isTomorrow(dueDate);
    const daysUntil = differenceInDays(dueDate, new Date());

    let label = format(dueDate, 'd MMM', { locale: tr });
    let colorClass = 'text-muted-foreground';

    if (isOverdue) {
      label = 'Gecikti';
      colorClass = 'text-red-500';
    } else if (isDueToday) {
      label = 'Bugün';
      colorClass = 'text-orange-500';
    } else if (isDueTomorrow) {
      label = 'Yarın';
      colorClass = 'text-yellow-500';
    } else if (daysUntil <= 7) {
      colorClass = 'text-blue-500';
    }

    return { label, colorClass, isOverdue };
  };

  const dueDateInfo = getDueDateInfo();

  // Compact view for completed todos
  if (todo.status === 'done') {
    return (
      <div
        onClick={handleClick}
        className="group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/20 border border-border/40 cursor-pointer hover:bg-muted/40 hover:border-border/70 transition-all"
      >
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
        <span className="text-xs text-muted-foreground line-through flex-1 truncate">{todo.title}</span>
        <span className="text-[10px] text-muted-foreground/50 shrink-0">Tamamlandı</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
            >
              <MoreHorizontal className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={handleDeleteClick}
              className="text-destructive hover:!bg-destructive/10 focus:!bg-destructive/10 focus:!text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Sil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {showDeleteConfirm && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 rounded-lg bg-card/95 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-3 z-10"
          >
            <p className="text-xs font-medium text-center">Silmek istediğinize emin misiniz?</p>
            <div className="flex gap-2 w-full">
              <button
                onClick={handleCancelDelete}
                className="flex-1 text-xs py-1 rounded-md border border-border hover:bg-secondary transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 text-xs py-1 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Sil
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const descriptionText = todo.description?.trim() || '';
  const hasDescription = descriptionText.length > 0;
  const isLongDescription = descriptionText.length > 120;
  const assignees = todo.assignees || [];
  const statusLabel = statusLabelMap[todo.status] || 'Yapilacak';
  const toSlug = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const assigneeHandles = Array.from(
    new Set(
      assignees
        .map((assignee) => {
          const username = assignee.user?.username?.trim();
          if (username) {
            return `@${username}`;
          }

          const displayName = assignee.user?.display_name?.trim();
          if (displayName) {
            const slug = toSlug(displayName);
            if (slug) {
              return `@${slug}`;
            }
          }

          return `@${assignee.user_id.slice(0, 8)}`;
        })
        .filter(Boolean)
    )
  );

  const hasMetaInfo = Boolean(
    dueDateInfo ||
    todo.priority !== 'none' ||
    todo.status === 'blocked' ||
    statusLabel ||
    totalChecklist > 0 ||
    (todo.comments && todo.comments.length > 0) ||
    (todo.attachments && todo.attachments.length > 0) ||
    todo.actual_hours
  );
  const hasExtraMeta = Boolean(
    totalChecklist > 0 ||
    (todo.comments && todo.comments.length > 0) ||
    (todo.attachments && todo.attachments.length > 0) ||
    todo.actual_hours
  );
  const hasAssignees = Boolean(assignees.length > 0);
  const creator = users.find(u => u.id === todo.created_by);

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group relative bg-card border border-border rounded-lg p-3 cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
        isDragging && "opacity-50 rotate-2 shadow-xl"
      )}
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-[10px] font-medium leading-4 text-muted-foreground/90">Baslik:</p>
            <h4 className={cn(
              "font-semibold text-[15px] leading-5 text-foreground line-clamp-2",
              todo.status === 'done' && "line-through"
            )}>
              {todo.title}
            </h4>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={handleDeleteClick}
                className="text-destructive hover:!bg-destructive/10 focus:!bg-destructive/10 focus:!text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Sil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {hasDescription && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium leading-4 text-muted-foreground/90">Aciklama:</p>
            <p className="text-[13px] leading-5 text-foreground/80 line-clamp-2">
              {descriptionText}
            </p>
          </div>
        )}
        {isLongDescription && (
          <p className="text-[11px] text-muted-foreground/90">Devami icin tikla</p>
        )}

        {/* Labels */}
        {todo.labels && todo.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {todo.labels.slice(0, 3).map((tl) => (
              <span
                key={tl.id}
                className="px-1.5 py-0.5 rounded text-xs text-white"
                style={{ backgroundColor: tl.label?.color }}
              >
                {tl.label?.name}
              </span>
            ))}
            {todo.labels.length > 3 && (
              <span className="px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                +{todo.labels.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Progress Bar */}
        {todo.progress > 0 && todo.progress < 100 && (
          <div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${todo.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Meta Info */}
        {hasMetaInfo && (
          <div className="space-y-1.5">
            <div className="flex items-center flex-wrap gap-1.5 text-[11px]">
              {todo.priority !== 'none' && (
                <div className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5", priority.bg, priority.color)}>
                  <PriorityIcon className="w-3 h-3" />
                  <span className="font-medium">{priority.label}</span>
                </div>
              )}

              <div className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                <span className="font-medium">Durum: {statusLabel}</span>
              </div>

              {dueDateInfo && (
                <div className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
                  dueDateInfo.colorClass,
                  dueDateInfo.isOverdue ? "border-red-200 bg-red-50" : "border-border bg-muted/40"
                )}>
                  <Calendar className="w-3 h-3" />
                  <span className="font-medium">{dueDateInfo.label}</span>
                </div>
              )}

              {todo.comments && todo.comments.length > 0 && (
                <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                  <MessageSquare className="w-3 h-3" />
                  <span className="font-medium">{todo.comments.length}</span>
                </div>
              )}

              {todo.status === 'blocked' && (
                <Badge variant="destructive" className="text-xs">Engellendi</Badge>
              )}
            </div>

            {hasExtraMeta && (
              <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
                {/* Checklist Progress */}
                {totalChecklist > 0 && (
                  <div className={cn(
                    "flex items-center gap-1",
                    completedChecklist === totalChecklist && "text-green-500"
                  )}>
                    <CheckSquare className="w-3 h-3" />
                    <span>{completedChecklist}/{totalChecklist}</span>
                  </div>
                )}

                {/* Attachments */}
                {todo.attachments && todo.attachments.length > 0 && (() => {
                  const atts = todo.attachments || [];
                  // En yakın silinme tarihini bul
                  const soonest = atts
                    .filter((a: any) => a.expires_at)
                    .sort((a: any, b: any) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime())[0];
                  const daysLeft = soonest
                    ? Math.max(0, Math.ceil((new Date((soonest as any).expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                    : null;
                  const expiryColor = daysLeft === null ? 'text-muted-foreground' : daysLeft <= 1 ? 'text-red-500' : daysLeft <= 3 ? 'text-orange-500' : 'text-muted-foreground';
                  const expiryDate = soonest ? new Date((soonest as any).expires_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : null;
                  return (
                    <div className={`flex items-center gap-1 ${expiryColor}`} title={expiryDate ? `En erken silinme: ${expiryDate} (${daysLeft} gün)` : ''}>
                      <Paperclip className="w-3 h-3" />
                      <span>{atts.length}</span>
                      {expiryDate && (
                        <span className="text-[10px]">· {expiryDate}</span>
                      )}
                    </div>
                  );
                })()}

                {/* Time Tracking */}
                {todo.actual_hours && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{todo.actual_hours}s</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {hasAssignees && (
          <div className="text-xs text-muted-foreground/90 line-clamp-1">
            Sorumlular: {assignees.map(a => a.user?.display_name).filter(Boolean).join(', ')}
          </div>
        )}
        {creator && (
          <div className="text-xs text-muted-foreground/70 line-clamp-1 mt-0.5">
            Oluşturan: {creator.display_name}
          </div>
        )}
      </div>

      {/* Silme onayı */}
      {showDeleteConfirm && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 rounded-lg bg-card/95 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4 z-10"
        >
          <p className="text-sm font-medium text-center">Bu görevi silmek istediğinize emin misiniz?</p>
          <div className="flex gap-2 w-full">
            <button
              onClick={handleCancelDelete}
              className="flex-1 text-sm py-1.5 rounded-md border border-border hover:bg-secondary transition-colors"
            >
              İptal
            </button>
            <button
              onClick={handleConfirmDelete}
              className="flex-1 text-sm py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              Sil
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
