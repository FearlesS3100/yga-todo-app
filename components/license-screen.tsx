'use client';

import { useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { KeyRound, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function LicenseScreen() {
  const { activateLicense } = useWorkspaceStore();
  const [key, setKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const formatKey = (value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const parts = [];
    for (let i = 0; i < clean.length && i < 12; i += 3) {
      parts.push(clean.slice(i, i + 3));
    }
    return parts.join('-');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setKey(formatKey(e.target.value));
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || isLoading) return;
    setIsLoading(true);
    setError('');
    const result = await activateLicense(key);
    setIsLoading(false);
    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error ?? 'Bir hata oluştu.');
    }
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
          <p className="text-sm text-muted-foreground">Ürün anahtarınızı girerek devam edin</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
          {success ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-lg">Lisans Aktive Edildi!</p>
                <p className="text-sm text-muted-foreground mt-1">Uygulamayı kullanmaya başlayabilirsiniz.</p>
              </div>
              <Button
                className="w-full h-11 mt-2"
                onClick={() => window.location.reload()}
              >
                Devam Et
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleActivate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <KeyRound className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Ürün Anahtarı <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="XXX-XXX-XXX-XXX"
                  value={key}
                  onChange={handleChange}
                  maxLength={15}
                  className={cn(
                    "h-12 text-center text-lg tracking-widest font-mono bg-input border-border",
                    error && "border-destructive focus-visible:ring-destructive"
                  )}
                  autoFocus
                  spellCheck={false}
                />
                {error && (
                  <div className="flex items-center gap-1.5 mt-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-12"
                disabled={key.length < 15 || isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Kontrol ediliyor...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Etkinleştir
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Her lisans anahtarı yalnızca bir kez kullanılabilir.
        </p>
      </div>
    </div>
  );
}