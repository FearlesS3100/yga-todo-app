'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatDistanceToNow, format, isSameDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import {
  Search,
  Plus,
  Bell,
  X,
  Settings,
  Archive,
  Calendar,
  ArrowUpRight,
  CheckCheck,
} from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { Notification as AppNotification } from '@/lib/types';

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

interface HeaderProps {
  view?: 'kanban' | 'list' | 'calendar';
  onViewChange?: (view: 'kanban' | 'list' | 'calendar') => void;
  onTabChange?: (tab: string) => void;
}

export function Header({ onTabChange }: HeaderProps) {
  const { 
    searchQuery, 
    setSearchQuery, 
    addCategory,
    setCreateTodoOpen,
    setCreateTodoCategoryId,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    labels,
    setSelectedTodo,
    setTodoModalOpen,
    loadWorkspaceData,
  } = useWorkspaceStore();
  const todos = useWorkspaceStore((state) => state.todos);

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const todosWithDates = todos.filter(t => t.due_date);
  const getDueTodosForDate = (date: Date) => {
    return todosWithDates.filter(t =>
      t.due_date && isSameDay(new Date(t.due_date), date)
    );
  };
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const categoryColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const handleCreateCategory = async () => {
    const trimmedName = newCategoryName.trim();

    if (!trimmedName || isCreatingCategory) {
      return;
    }

    setIsCreatingCategory(true);

    try {
      const randomColor = categoryColors[Math.floor(Math.random() * categoryColors.length)];
      const createdCategory = await addCategory(trimmedName, randomColor);
      setIsCreateCategoryOpen(false);
      setNewCategoryName('');
      setCreateTodoCategoryId(createdCategory.id);
      setCreateTodoOpen(true);
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleGoToNotificationTodo = async (notification: AppNotification) => {
    markNotificationRead(notification.id);

    const targetTodoId = resolveNotificationTargetTodoId(notification);
    if (!targetTodoId) {
      return;
    }

    onTabChange?.('board');

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
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 flex items-center justify-between gap-4">
      {/* Left Side - Search */}
      <div className={cn(
        "flex-1 min-w-0 sm:max-w-md transition-all",
        isSearchFocused && "sm:max-w-xl"
      )}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Görev ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className="pl-10 pr-10 h-10 bg-secondary/50 border-border"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => setSearchQuery('')}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Right Side - Actions */}
      <div className="flex items-center gap-2">
        {/* Calendar Quick View */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Calendar className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <div className="p-3 border-b">
              <h4 className="font-semibold text-sm">Takvim Görünümü</h4>
              <p className="text-xs text-muted-foreground">Görev tarihlerini gör</p>
            </div>
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={tr}
              modifiers={{
                hasTodo: (date) => getDueTodosForDate(date).length > 0
              }}
              modifiersStyles={{
                hasTodo: {
                  backgroundColor: 'hsl(var(--primary) / 0.1)',
                  fontWeight: 'bold'
                }
              }}
            />
            {selectedDate && getDueTodosForDate(selectedDate).length > 0 && (
              <div className="p-3 border-t max-h-32 overflow-y-auto">
                <p className="text-xs font-medium mb-2">
                  {format(selectedDate, 'd MMMM yyyy', { locale: tr })}
                </p>
                {getDueTodosForDate(selectedDate).map((todo) => (
                  <div key={todo.id} className="text-xs py-1 px-2 bg-secondary rounded mb-1">
                    {todo.title}
                  </div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 relative">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 rounded-2xl shadow-xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Bildirimler</span>
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Tümünü okundu işaretle
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <Bell className="w-6 h-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Henüz bildirim yok</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {notifications.slice(0, 8).map((notif) => {
                    const targetTodoId = resolveNotificationTargetTodoId(notif);
                    const relatedTodo = targetTodoId ? todos.find((todo) => todo.id === targetTodoId) : null;

                    return (
                      <div
                        key={notif.id}
                        className={cn(
                          'rounded-xl overflow-hidden',
                          !notif.is_read && 'bg-primary/[0.05]'
                        )}
                      >
                        {/* Bildirim satırı — tıklayınca sadece okundu işaretler */}
                        <button
                          type="button"
                          onClick={() => markNotificationRead(notif.id)}
                          className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 hover:bg-secondary/60 transition-colors"
                        >
                          <span className={cn(
                            'mt-[5px] w-1.5 h-1.5 rounded-full shrink-0',
                            notif.is_read ? 'bg-transparent' : 'bg-primary'
                          )} />
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              'text-sm leading-snug',
                              notif.is_read ? 'text-muted-foreground font-normal' : 'text-foreground font-medium'
                            )}>
                              {notif.title}
                            </p>
                            {notif.message && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                {notif.message}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground/50 mt-1 tabular-nums">
                              {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: tr })}
                            </p>
                          </div>
                        </button>

                        {/* Göreve git — sadece ilgili görev varsa */}
                        {targetTodoId && (
                          <button
                            type="button"
                            onClick={() => void handleGoToNotificationTodo(notif)}
                            className="w-full flex items-center justify-between px-3 py-1.5 bg-primary/[0.07] hover:bg-primary/[0.13] transition-colors"
                          >
                            <span className="text-[11px] text-muted-foreground truncate text-left">
                              {relatedTodo?.title ?? 'İlgili görev'}
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary shrink-0 ml-2">
                              Göreve git
                              <ArrowUpRight className="w-3 h-3" />
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer — bildirim sayfasına git */}
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => onTabChange?.('notifications')}
                className="w-full px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors text-center"
              >
                Tüm bildirimleri gör →
              </button>
            </div>

          </PopoverContent>
        </Popover>

        {/* Add Todo */}
        <Popover open={isCreateCategoryOpen} onOpenChange={setIsCreateCategoryOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <Plus className="w-4 h-4" />
              Kategori Ekle
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-3 space-y-3">
            <Input
              placeholder="Kategori adı..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
              disabled={isCreatingCategory}
              autoFocus
            />
            <Button
              className="w-full"
              onClick={handleCreateCategory}
              disabled={!newCategoryName.trim() || isCreatingCategory}
            >
              {isCreatingCategory ? 'Ekleniyor...' : 'Kategori Oluştur'}
            </Button>
          </PopoverContent>
        </Popover>

        {/* Add Todo */}
        <Button 
          size="sm" 
          className="h-9 gap-2"
          onClick={() => setCreateTodoOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Yeni Görev
        </Button>
      </div>
    </header>
  );
}
