'use client';

import { useWorkspaceStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Search, Crown } from 'lucide-react';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

const statusConfig = {
  online:  { dot: 'bg-green-500',          ring: 'ring-green-500/30',        label: 'Çevrimiçi'  },
  away:    { dot: 'bg-yellow-400',          ring: 'ring-yellow-400/30',       label: 'Uzakta'     },
  offline: { dot: 'bg-muted-foreground/25', ring: 'ring-muted-foreground/15', label: 'Çevrimdışı' },
};

export function MembersPanel() {
  const { users, currentUser } = useWorkspaceStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = users.filter(u =>
    u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onlineUsers  = filteredUsers.filter(u => u.status === 'online');
  const awayUsers    = filteredUsers.filter(u => u.status === 'away');
  const offlineUsers = filteredUsers.filter(u => u.status === 'offline');

  const groups = [
    { key: 'online',  users: onlineUsers  },
    { key: 'away',    users: awayUsers    },
    { key: 'offline', users: offlineUsers },
  ].filter(g => g.users.length > 0);

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="px-6 pt-6 pb-4 sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b border-border/30">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-sm font-semibold text-foreground/90">Ekip Üyeleri</h1>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground/50">{users.length} üye</span>
              {onlineUsers.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[11px] font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  {onlineUsers.length} çevrimiçi
                </span>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 pointer-events-none" />
            <Input
              placeholder="İsim veya kullanıcı adı ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 pl-9 text-xs bg-secondary/40 border-border/40 focus:border-primary/30 rounded-lg placeholder:text-muted-foreground/35"
            />
          </div>
        </div>
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto py-4 px-6">
        <div className="max-w-sm mx-auto space-y-5">
          {groups.map(group => {
            const config = statusConfig[group.key as keyof typeof statusConfig];
            const isOfflineGroup = group.key === 'offline';

            return (
              <div key={group.key}>

                {/* Group label */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/45 select-none">
                    {config.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground/30 font-medium">{group.users.length}</span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>

                {/* Rows */}
                <div className="space-y-0.5">
                  {group.users.map(user => {
                    const isMe = currentUser?.id === user.id;

                    return (
                      <div
                        key={user.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-default select-none transition-colors duration-150',
                          isMe
                            ? 'bg-primary/[0.06] hover:bg-primary/[0.09]'
                            : 'hover:bg-secondary/50'
                        )}
                      >
                        {/* Avatar */}
                        <div className={cn(
                          'relative shrink-0 rounded-full',
                          isMe && `ring-2 ring-offset-1 ring-offset-background ${statusConfig[user.status as keyof typeof statusConfig].ring}`
                        )}>
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.display_name}
                              className={cn(
                                'w-9 h-9 rounded-full object-cover',
                                isOfflineGroup && 'opacity-40 grayscale'
                              )}
                            />
                          ) : (
                            <div
                              className={cn(
                                'w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold',
                                isOfflineGroup && 'opacity-30'
                              )}
                              style={{ backgroundColor: user.avatar_color }}
                            >
                              {user.display_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-[1.5px] border-background',
                            statusConfig[user.status as keyof typeof statusConfig].dot
                          )} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={cn(
                              'text-sm font-medium leading-none truncate',
                              isOfflineGroup ? 'text-foreground/35' : 'text-foreground/85'
                            )}>
                              {user.display_name}
                            </span>
                            {user.offline_reason && (
                              <span className="text-[11px] text-yellow-500/55 italic truncate min-w-0 max-w-[52%] leading-none">
                                ({user.offline_reason})
                              </span>
                            )}
                            {isMe && (
                              <span className="shrink-0 text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-full leading-none tracking-wide">
                                SEN
                              </span>
                            )}
                            {user.id === 'user-1' && (
                              <Crown className="shrink-0 w-3 h-3 text-yellow-400/80" />
                            )}
                          </div>

                          <div className="flex items-center gap-1 mt-[3px]">
                            <span className={cn(
                              'text-[11px] leading-none truncate',
                              isOfflineGroup ? 'text-muted-foreground/25' : 'text-muted-foreground/50'
                            )}>
                              @{user.username}
                            </span>
                            {user.status !== 'online' && user.last_seen && (
                              <>
                                <span className="text-muted-foreground/20 text-[10px] shrink-0">·</span>
                                <span className="text-[11px] text-muted-foreground/30 shrink-0 leading-none">
                                  {formatDistanceToNow(new Date(user.last_seen), { addSuffix: true, locale: tr })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div className="flex flex-col items-center justify-center pt-20 gap-2.5">
              <Search className="w-7 h-7 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground/40">Üye bulunamadı</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
