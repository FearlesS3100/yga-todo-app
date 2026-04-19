'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Circle, CheckCircle2, Clock, AlertCircle, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Todo } from '@/lib/types';

const priorityColors: Record<string, string> = {
  urgent: 'text-red-500 bg-red-500/10',
  high: 'text-orange-500 bg-orange-500/10',
  medium: 'text-yellow-500 bg-yellow-500/10',
  low: 'text-blue-500 bg-blue-500/10',
};

const priorityLabels: Record<string, string> = {
  urgent: 'Acil',
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
};

const statusIcons: Record<string, React.ReactNode> = {
  todo: <Circle className="w-4 h-4 text-muted-foreground" />,
  in_progress: <Clock className="w-4 h-4 text-blue-500" />,
  review: <AlertCircle className="w-4 h-4 text-yellow-500" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
};

export function ListView() {
  const { categories, todos, users, setSelectedTodo, setTodoModalOpen, searchQuery } = useWorkspaceStore();

  const filteredTodos = searchQuery.trim()
    ? todos.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : todos;
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const openTodo = (todo: Todo) => {
    setSelectedTodo(todo);
    setTodoModalOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {categories.sort((a, b) => a.position - b.position).map(category => {
          const categoryTodos = filteredTodos
            .filter(t => t.category_id === category.id)
            .sort((a, b) => a.position - b.position);
          const isCollapsed = collapsedCategories.has(category.id);

          return (
            <div key={category.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: category.color }}
                />
                <span className="font-semibold text-sm flex-1 text-left">{category.name}</span>
                <Badge variant="secondary" className="text-xs">{categoryTodos.length}</Badge>
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                }
              </button>

              {/* Todo rows */}
              {!isCollapsed && (
                <div className="divide-y divide-border">
                  {categoryTodos.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-4 py-3 text-center">Görev yok</p>
                  ) : (
                    categoryTodos.map(todo => {
                      const assignees = todo.assignees?.map(a => users.find(u => u.id === a.user_id)).filter(Boolean) ?? [];
                      const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && todo.status !== 'done';

                      return (
                        <button
                          key={todo.id}
                          onClick={() => openTodo(todo)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left"
                        >
                          {/* Status icon */}
                          <span className="shrink-0">{statusIcons[todo.status] ?? statusIcons.todo}</span>

                          {/* Title */}
                          <span className={cn(
                            "flex-1 text-sm font-medium truncate",
                            todo.status === 'done' && "line-through text-muted-foreground"
                          )}>
                            {todo.title}
                          </span>

                          {/* Priority */}
                          {todo.priority && (
                            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", priorityColors[todo.priority])}>
                              {priorityLabels[todo.priority]}
                            </span>
                          )}

                          {/* Assignees */}
                          {assignees.length > 0 && (
                            <div className="flex -space-x-1 shrink-0">
                              {assignees.slice(0, 3).map(user => user && (
                                <div
                                  key={user.id}
                                  className="w-6 h-6 rounded-full border-2 border-card flex items-center justify-center text-white text-xs font-medium overflow-hidden"
                                  style={{ backgroundColor: user.avatar_color }}
                                  title={user.display_name}
                                >
                                  {user.avatar_url
                                    ? <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
                                    : user.display_name.charAt(0).toUpperCase()
                                  }
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Due date */}
                          {todo.due_date && (
                            <span className={cn(
                              "text-xs shrink-0",
                              isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
                            )}>
                              {format(new Date(todo.due_date), 'd MMM', { locale: tr })}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}