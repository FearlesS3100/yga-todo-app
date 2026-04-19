'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight } from 'lucide-react';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useWorkspaceStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setIsLoading(true);
    await login(username.trim());
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <img src="/logo.png" alt="YGA Logo" style={{ height: '180px', width: 'auto', maxWidth: '500px', objectFit: 'contain' }} />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">YouGameArea Todo Workspace</h1>
          <p className="text-muted-foreground text-sm">
            Takım çalışma alanı — Görevleri yönet, iş birliği yap
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                İsminizi girin
              </label>
              <Input
                type="text"
                placeholder="Adınızı girin..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-12 bg-input border-border text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={!username.trim() || isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Giriş yapılıyor...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Devam Et
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Herkes aynı workspace&apos;i kullanır. Giriş yaparak başlayabilirsiniz.
        </p>
      </div>
    </div>
  );
}