'use client';

import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import type { Priority, ChecklistItem, TodoAssignee, TodoLabel } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
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
  Flag
} from 'lucide-react';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const priorityOptions = [
  { value: 'urgent', label: 'Acil', icon: AlertTriangle, color: 'text-red-500' },
  { value: 'high', label: 'Yüksek', icon: ArrowUp, color: 'text-orange-500' },
  { value: 'medium', label: 'Orta', icon: Minus, color: 'text-yellow-500' },
  { value: 'low', label: 'Düşük', icon: ArrowDown, color: 'text-blue-500' },
  { value: 'none', label: 'Yok', icon: Flag, color: 'text-muted-foreground' },
];

export function CreateTodoModal() {
  const { 
    isCreateTodoOpen, 
    setCreateTodoOpen, 
    createTodoCategoryId,
    setCreateTodoCategoryId,
    addTodo,
    categories,
    users,
    labels,
    currentUser
  } = useWorkspaceStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('none');
  const [categoryId, setCategoryId] = useState(createTodoCategoryId || categories[0]?.id || '');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [estimatedHours, setEstimatedHours] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [checklistItems, setChecklistItems] = useState<{ id: string; content: string; is_completed: boolean }[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  const handleClose = () => {
    setCreateTodoOpen(false);
    setCreateTodoCategoryId(null);
    resetForm();
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('none');
    setCategoryId(createTodoCategoryId || categories[0]?.id || '');
    setDueDate(undefined);
    setStartDate(undefined);
    setEstimatedHours('');
    setSelectedAssignees([]);
    setSelectedLabels([]);
    setChecklistItems([]);
    setNewChecklistItem('');
  };

  useEffect(() => {
    if (!isCreateTodoOpen) {
      return;
    }

    setCategoryId((prev) => {
      const next = createTodoCategoryId || categories[0]?.id || '';
      const hasPrevCategory = categories.some((category) => category.id === prev);
      if (createTodoCategoryId) {
        return createTodoCategoryId;
      }
      if (hasPrevCategory) {
        return prev;
      }
      return next;
    });
  }, [isCreateTodoOpen, createTodoCategoryId, categories]);

  const handleSubmit = () => {
    if (!title.trim() || !categoryId) return;

    const assignees: TodoAssignee[] = selectedAssignees.map(userId => ({
      id: `assign-${Date.now()}-${userId}`,
      todo_id: '',
      user_id: userId,
      assigned_at: new Date().toISOString(),
      user: users.find(u => u.id === userId),
    }));

    const todoLabels: TodoLabel[] = selectedLabels.map(labelId => ({
      id: `tl-${Date.now()}-${labelId}`,
      todo_id: '',
      label_id: labelId,
      label: labels.find(l => l.id === labelId),
    }));

    const checklist: ChecklistItem[] = checklistItems.map((item, index) => ({
      id: item.id,
      todo_id: '',
      content: item.content,
      is_completed: item.is_completed,
      position: index,
      completed_at: null,
      completed_by: null,
    }));

    addTodo({
      title: title.trim(),
      description: description.trim(),
      priority,
      category_id: categoryId,
      due_date: dueDate?.toISOString() || null,
      start_date: startDate?.toISOString() || null,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
      assignees,
      labels: todoLabels,
      checklist_items: checklist,
    });

    handleClose();
  };

  const handleAddChecklistItem = () => {
    if (newChecklistItem.trim()) {
      setChecklistItems([
        ...checklistItems,
        { id: `check-${Date.now()}`, content: newChecklistItem.trim(), is_completed: false }
      ]);
      setNewChecklistItem('');
    }
  };

  const handleRemoveChecklistItem = (id: string) => {
    setChecklistItems(checklistItems.filter(item => item.id !== id));
  };

  const toggleAssignee = (userId: string) => {
    setSelectedAssignees(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabels(prev => 
      prev.includes(labelId) 
        ? prev.filter(id => id !== labelId)
        : [...prev, labelId]
    );
  };

  return (
    <Dialog open={isCreateTodoOpen} onOpenChange={setCreateTodoOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni Görev Oluştur</DialogTitle>
          <DialogDescription className="sr-only">
            Yeni görev oluşturma formu
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Title */}
          <div>
            <Input
              placeholder="Görev başlığı..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-medium h-12"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <Textarea
              placeholder="Açıklama ekle..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-24 resize-none"
            />
          </div>

          {/* Row 1: Category & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                Kategori
              </label>
              <Select value={categoryId} onValueChange={setCategoryId}>
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

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                Öncelik
              </label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
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
          </div>

          {/* Row 2: Dates & Time */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                Başlangıç Tarihi
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {startDate ? format(startDate, 'd MMM yyyy', { locale: tr }) : 'Seç...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                Bitiş Tarihi
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {dueDate ? format(dueDate, 'd MMM yyyy', { locale: tr }) : 'Seç...'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                Tahmini Süre (saat)
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Assignees */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center gap-2">
              <User className="w-4 h-4" />
              Atananlar
            </label>
            <div className="flex flex-wrap gap-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => toggleAssignee(user.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all",
                    selectedAssignees.includes(user.id)
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div 
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                    style={{ backgroundColor: user.avatar_color }}
                  >
                    {user.display_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm">{user.display_name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Etiketler
            </label>
            <div className="flex flex-wrap gap-2">
              {labels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => toggleLabel(label.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-sm transition-all",
                    selectedLabels.includes(label.id)
                      ? "ring-2 ring-offset-2 ring-offset-background"
                      : "opacity-70 hover:opacity-100"
                  )}
                  style={{ 
                    backgroundColor: label.color,
                    color: 'white',
                    ...(selectedLabels.includes(label.id) && { ringColor: label.color })
                  }}
                >
                  {label.name}
                </button>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center gap-2">
              <CheckSquare className="w-4 h-4" />
              Kontrol Listesi
            </label>
            
            <div className="space-y-2">
              {checklistItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <Checkbox 
                    checked={item.is_completed}
                    onCheckedChange={(checked) => {
                      setChecklistItems(checklistItems.map(i => 
                        i.id === item.id ? { ...i, is_completed: !!checked } : i
                      ));
                    }}
                  />
                  <span className={cn(
                    "flex-1 text-sm",
                    item.is_completed && "line-through text-muted-foreground"
                  )}>
                    {item.content}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={() => handleRemoveChecklistItem(item.id)}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Yeni madde ekle..."
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                  className="flex-1 h-8 text-sm"
                />
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={handleAddChecklistItem}
                  disabled={!newChecklistItem.trim()}
                >
                  Ekle
                </Button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              İptal
            </Button>
            <Button onClick={handleSubmit} disabled={!title.trim() || !categoryId}>
              Oluştur
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
