'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/lib/types';

const presetColors = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', 
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

export function LabelsPanel() {
  const { labels, addLabel, updateLabel, deleteLabel, todos } = useWorkspaceStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [selectedColor, setSelectedColor] = useState(presetColors[0]);

  // Edit state
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(presetColors[0]);

  // Delete confirmation state
  const [deletingLabel, setDeletingLabel] = useState<Label | null>(null);

  const handleCreateLabel = () => {
    if (newLabelName.trim()) {
      void addLabel(newLabelName.trim(), selectedColor);
      setNewLabelName('');
      setSelectedColor(presetColors[0]);
      setIsCreateOpen(false);
    }
  };

  const openEdit = (label: Label) => {
    setEditingLabel(label);
    setEditName(label.name);
    setEditColor(label.color);
  };

  const handleUpdateLabel = () => {
    if (!editingLabel || !editName.trim()) return;
    void updateLabel(editingLabel.id, { name: editName.trim(), color: editColor });
    setEditingLabel(null);
  };

  const getLabelUsageCount = (labelId: string) => {
    return todos.filter(todo => 
      todo.labels?.some(l => l.label_id === labelId)
    ).length;
  };

  const handleConfirmDelete = () => {
    if (!deletingLabel) return;
    void deleteLabel(deletingLabel.id);
    setDeletingLabel(null);
  };

  const ColorGrid = ({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) => (
    <div className="grid grid-cols-8 gap-2">
      {presetColors.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          className={cn(
            "w-8 h-8 rounded-full transition-all hover:scale-110",
            selected === color && "ring-2 ring-offset-2 ring-white scale-110"
          )}
          style={{
            backgroundColor: color,
            boxShadow: selected === color ? `0 0 0 3px ${color}55` : undefined
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Tag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Etiketler</h1>
              <p className="text-sm text-muted-foreground">
                {labels.length} etiket · Görevleri organize edin
              </p>
            </div>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Yeni Etiket
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni Etiket Oluştur</DialogTitle>
                <DialogDescription className="sr-only">Yeni etiket adı ve renk seçimi</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Etiket Adı</label>
                  <Input
                    placeholder="Etiket adı..."
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateLabel()}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Renk Seç</label>
                  <ColorGrid selected={selectedColor} onSelect={setSelectedColor} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Önizleme</label>
                  <div className="bg-secondary/50 rounded-lg p-4 flex items-center justify-center gap-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium text-white"
                      style={{ backgroundColor: selectedColor }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-white/70 inline-block" />
                      {newLabelName || 'Etiket Adı'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>İptal</Button>
                  <Button onClick={handleCreateLabel} disabled={!newLabelName.trim()}>Oluştur</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deletingLabel} onOpenChange={(open) => { if (!open) setDeletingLabel(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Etiketi Sil</DialogTitle>
              <DialogDescription>
                {deletingLabel && (() => {
                  const count = getLabelUsageCount(deletingLabel.id);
                  return (
                    <>
                      <strong>&quot;{deletingLabel.name}&quot;</strong> etiketini silmek istediğinizden emin misiniz?
                      {count > 0 && (
                        <> Bu etiket <strong>{count} görev</strong>de kullanılmaktadır ve tüm görevlerden kaldırılacak.</>
                      )}
                      {count === 0 && <> Bu etiket hiçbir görevde kullanılmamaktadır.</>}
                    </>
                  );
                })()}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeletingLabel(null)}>İptal</Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>Sil</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingLabel} onOpenChange={(open) => { if (!open) setEditingLabel(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Etiketi Düzenle</DialogTitle>
              <DialogDescription className="sr-only">Etiket adı ve renk düzenleme</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Etiket Adı</label>
                <Input
                  placeholder="Etiket adı..."
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateLabel()}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Renk Seç</label>
                <ColorGrid selected={editColor} onSelect={setEditColor} />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Önizleme</label>
                <div className="bg-secondary/50 rounded-lg p-4 flex items-center justify-center gap-3">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: editColor }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70 inline-block" />
                    {editName || 'Etiket Adı'}
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingLabel(null)}>İptal</Button>
                <Button onClick={handleUpdateLabel} disabled={!editName.trim()}>Kaydet</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Labels Grid */}
        <div className="grid gap-2">
          {labels.map((label) => {
            const usageCount = getLabelUsageCount(label.id);
            return (
              <div
                key={label.id}
                className="group bg-card border border-border rounded-xl overflow-hidden flex items-center hover:border-border/80 hover:shadow-sm transition-all duration-200"
              >
                {/* Color accent bar */}
                <div className="w-1 self-stretch shrink-0" style={{ backgroundColor: label.color }} />

                <div className="flex items-center gap-4 flex-1 px-4 py-3">
                  {/* Label badge */}
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white shrink-0"
                    style={{ backgroundColor: label.color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/70 inline-block" />
                    {label.name}
                  </span>

                  <div className="flex-1" />

                  {/* Usage count */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: label.color }} />
                    <span>{usageCount} görevde kullanılıyor</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg"
                      onClick={() => openEdit(label)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeletingLabel(label)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {labels.length === 0 && (
            <div className="text-center py-16 bg-secondary/20 rounded-2xl border-2 border-dashed border-border mt-2">
              <div className="w-16 h-16 rounded-2xl bg-secondary mx-auto mb-4 flex items-center justify-center">
                <Tag className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">Henüz etiket yok</h3>
              <p className="text-sm text-muted-foreground mb-5">
                Görevleri organize etmek için etiketler oluşturun
              </p>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                İlk Etiketi Oluştur
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}