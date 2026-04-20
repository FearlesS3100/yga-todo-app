'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Category, Todo } from '@/lib/types';
import { useWorkspaceStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { TodoCard } from './todo-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Pencil,
  GripVertical,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

interface CategoryColumnProps {
  category: Category;
  todos: Todo[];
  onDragStart: (e: React.DragEvent, todoId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, categoryId: string) => void;
  onColumnDragStart: (e: React.DragEvent, categoryId: string) => void;
  onColumnDragOver: (e: React.DragEvent, categoryId: string) => void;
  onColumnDrop: (e: React.DragEvent, categoryId: string) => void;
  onColumnDragEnd: () => void;
  isColumnDragging: boolean;
  isColumnDragOver: boolean;
}

export function CategoryColumn({
  category,
  todos,
  onDragStart,
  onDragOver,
  onDrop,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onColumnDragEnd,
  isColumnDragging,
  isColumnDragOver,
}: CategoryColumnProps) {
  const {
    updateCategory,
    deleteCategory,
    setCreateTodoOpen,
    setCreateTodoCategoryId,
    reorderTodos,
  } = useWorkspaceStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const [isCollapsed, setIsCollapsed] = useState(category.is_collapsed);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
  const [localDraggedTodoId, setLocalDraggedTodoId] = useState<string | null>(null);

  const resetDragVisualState = useCallback(() => {
    setLocalDraggedTodoId(null);
    setDragOverTodoId(null);
    setIsDragOver(false);
  }, []);

  const activeTodos = useMemo(
    () =>
      todos
        .filter(t => t.status !== 'done')
        .sort((a, b) => a.position - b.position),
    [todos]
  );

  const doneTodos = useMemo(
    () =>
      todos
        .filter(t => t.status === 'done')
        .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')),
    [todos]
  );

  useEffect(() => {
    const handleGlobalDragFinish = () => {
      resetDragVisualState();
    };

    window.addEventListener('dragend', handleGlobalDragFinish);
    window.addEventListener('drop', handleGlobalDragFinish);

    return () => {
      window.removeEventListener('dragend', handleGlobalDragFinish);
      window.removeEventListener('drop', handleGlobalDragFinish);
    };
  }, [resetDragVisualState]);

  useEffect(() => {
    if (localDraggedTodoId && !todos.some(todo => todo.id === localDraggedTodoId)) {
      setLocalDraggedTodoId(null);
    }
  }, [todos, localDraggedTodoId]);

  const handleSaveEdit = () => {
    if (editName.trim()) {
      updateCategory(category.id, { name: editName.trim() });
    }
    setIsEditing(false);
  };

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    updateCategory(category.id, { is_collapsed: !isCollapsed });
  };

  const handleAddTodo = () => {
    setCreateTodoCategoryId(category.id);
    setCreateTodoOpen(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    onDragOver(e);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    const todoId = e.dataTransfer.getData('text/plain');

    if (todoId && todos.some(t => t.id === todoId)) {
      // Intra-column reorder (only for active todos)
      if (dragOverTodoId && dragOverTodoId !== todoId) {
        const sourceIdx = activeTodos.findIndex(t => t.id === todoId);
        const destIdx = activeTodos.findIndex(t => t.id === dragOverTodoId);
        if (sourceIdx !== -1 && destIdx !== -1) {
          reorderTodos(category.id, sourceIdx, destIdx);
        }
      }
      // If no valid dragOverTodoId or same position, do nothing
    } else {
      // Inter-column drop — delegate to board handler
      onDrop(e, category.id);
    }

    resetDragVisualState();
  };

  const wipExceeded = Boolean(category.wip_limit && todos.length >= category.wip_limit);

  return (
    <div
      className={cn(
        "flex-shrink-0 w-96 bg-secondary/30 rounded-xl flex flex-col max-h-full transition-all",
        isDragOver && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isColumnDragging && "opacity-50 scale-[0.98]",
        isColumnDragOver && "ring-2 ring-orange-400 ring-offset-2 ring-offset-background"
      )}
      onDragOver={(e) => { handleDragOver(e); onColumnDragOver(e, category.id); }}
      onDragLeave={handleDragLeave}
      onDrop={(e) => { handleDrop(e); onColumnDrop(e, category.id); }}
      onDragEnd={() => {
        resetDragVisualState();
        onColumnDragEnd();
      }}
    >
      {/* Header */}
      <div className="p-3 flex items-center gap-2">
        <div
          draggable
          onDragStart={(e) => onColumnDragStart(e, category.id)}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          title="Kolonu sürükle"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleToggleCollapse}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </Button>

        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: category.color }}
        />

        {isEditing ? (
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
            className="h-7 text-sm font-medium"
            autoFocus
          />
        ) : (
          <span
            className="font-medium text-sm text-foreground flex-1 cursor-pointer"
            onDoubleClick={() => setIsEditing(true)}
          >
            {category.name}
          </span>
        )}

        <div className="flex items-center gap-1">
          <span className={cn(
            "text-xs px-1.5 py-0.5 rounded-full",
            wipExceeded
              ? "bg-destructive/20 text-destructive"
              : "bg-muted text-muted-foreground"
          )}>
            {todos.length}
            {category.wip_limit && `/${category.wip_limit}`}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Yeniden Adlandır
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive hover:!bg-destructive/10 focus:!bg-destructive/10 focus:!text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Kategoriyi Sil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="mx-3 mb-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-2">
          <p className="text-sm font-medium text-destructive">Kategoriyi sil?</p>
          <p className="text-xs text-muted-foreground">İçindeki tüm görevler de silinecek.</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => setShowDeleteConfirm(false)}
            >
              İptal
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={() => { void deleteCategory(category.id); setShowDeleteConfirm(false); }}
            >
              Sil
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {!isCollapsed && (
        <>
          <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">

            {/* Active Todos */}
            {activeTodos.map((todo) => (
              <div
                key={todo.id}
                draggable
                onDragStart={(e) => {
                  // Custom ghost image
                  const el = e.currentTarget.firstElementChild as HTMLElement | null;
                  if (el) {
                    const ghost = el.cloneNode(true) as HTMLElement;
                    ghost.style.cssText = `
                      position: fixed;
                      top: -1000px;
                      left: -1000px;
                      width: ${el.offsetWidth}px;
                      opacity: 0.92;
                      transform: rotate(2deg) scale(1.03);
                      box-shadow: 0 24px 48px rgba(0,0,0,0.35);
                      border-radius: 8px;
                      pointer-events: none;
                    `;
                    document.body.appendChild(ghost);
                    e.dataTransfer.setDragImage(ghost, el.offsetWidth / 2, 40);
                    setTimeout(() => document.body.removeChild(ghost), 0);
                  }
                  setLocalDraggedTodoId(todo.id);
                  onDragStart(e, todo.id);
                }}
                 onDragEnd={resetDragVisualState}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragOverTodoId !== todo.id) setDragOverTodoId(todo.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverTodoId(null);
                  }
                }}
                className={cn(
                  "rounded-lg transition-all duration-150",
                  dragOverTodoId === todo.id && "ring-2 ring-primary/60 ring-offset-1 ring-offset-background",
                  localDraggedTodoId === todo.id && "opacity-30 scale-[0.98]"
                )}
              >
                <TodoCard todo={todo} />
              </div>
            ))}

            {activeTodos.length === 0 && doneTodos.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Görev yok
              </div>
            )}

            {/* Done Todos Section */}
            {doneTodos.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 pt-1 pb-0.5">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-medium shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    {doneTodos.length} tamamlandı
                  </span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                {doneTodos.map((todo) => (
                  <div
                    key={todo.id}
                    draggable
                    onDragStart={(e) => {
                      setLocalDraggedTodoId(todo.id);
                      onDragStart(e, todo.id);
                    }}
                     onDragEnd={resetDragVisualState}
                    className={cn(
                      "transition-all duration-150",
                      localDraggedTodoId === todo.id && "opacity-30 scale-[0.98]"
                    )}
                  >
                    <TodoCard todo={todo} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Todo Button */}
          <div className="p-3 pt-0">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-9 text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={handleAddTodo}
              disabled={wipExceeded}
            >
              <Plus className="w-4 h-4" />
              <span>Görev Ekle</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
