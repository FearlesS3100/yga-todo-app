'use client';

import { useState, useMemo } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { CategoryColumn } from './category-column';

export function KanbanBoard() {
  const {
    categories,
    todos,
    moveTodo,
    reorderCategories,
    searchQuery,
  } = useWorkspaceStore();

  const filteredTodos = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return todos;
    const lower = q.toLowerCase();
    return todos.filter(t =>
      t.title.toLowerCase().includes(lower) ||
      t.description?.toLowerCase().includes(lower)
    );
  }, [todos, searchQuery]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.position - b.position),
    [categories]
  );

  const todosByCategory = useMemo(() => {
    const map = new Map<string, typeof filteredTodos>();
    for (const todo of filteredTodos) {
      const list = map.get(todo.category_id);
      if (list) {
        list.push(todo);
      } else {
        map.set(todo.category_id, [todo]);
      }
    }
    return map;
  }, [filteredTodos]);

  // Todo drag state
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);

  // Column drag state
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, todoId: string) => {
    setDraggedTodoId(todoId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', todoId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    // If a column is being dragged, ignore todo drop
    if (draggedColumnId) {
      setDraggedTodoId(null);
      return;
    }
    const todoId = e.dataTransfer.getData('text/plain');
    if (todoId && categoryId) {
      const targetTodos = todos.filter(t => t.category_id === categoryId);
      moveTodo(todoId, categoryId, targetTodos.length);
    }
    setDraggedTodoId(null);
  };

  // Column drag handlers
  const handleColumnDragStart = (e: React.DragEvent, categoryId: string) => {
    setDraggedColumnId(categoryId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    e.dataTransfer.setData('column', categoryId);
  };

  const handleColumnDragOver = (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    if (draggedColumnId && draggedColumnId !== categoryId) {
      setDragOverColumnId(categoryId);
    }
  };

  const handleColumnDrop = (e: React.DragEvent, targetCategoryId: string) => {
    e.preventDefault();
    // If no column is being dragged, ignore
    if (!draggedColumnId) {
      setDragOverColumnId(null);
      return;
    }
    const sourceCategoryId = e.dataTransfer.getData('column');
    if (!sourceCategoryId || sourceCategoryId === targetCategoryId) {
      setDraggedColumnId(null);
      setDragOverColumnId(null);
      return;
    }

    const sourceIndex = sortedCategories.findIndex(c => c.id === sourceCategoryId);
    const destIndex = sortedCategories.findIndex(c => c.id === targetCategoryId);

    if (sourceIndex !== -1 && destIndex !== -1) {
      reorderCategories(sourceIndex, destIndex);
    }

    setDraggedColumnId(null);
    setDragOverColumnId(null);
  };

  const handleColumnDragEnd = () => {
    setDraggedColumnId(null);
    setDragOverColumnId(null);
  };

  return (
    <div className="flex-1 overflow-x-auto p-6">
      <div className="flex gap-4 h-full min-w-max">
        {sortedCategories.map((category) => (
            <CategoryColumn
              key={category.id}
              category={category}
              todos={todosByCategory.get(category.id) ?? []}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onColumnDragStart={handleColumnDragStart}
              onColumnDragOver={handleColumnDragOver}
              onColumnDrop={handleColumnDrop}
              onColumnDragEnd={handleColumnDragEnd}
              isColumnDragging={draggedColumnId === category.id}
              isColumnDragOver={dragOverColumnId === category.id}
            />
          ))}
      </div>
    </div>
  );
}