'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  LayoutGrid,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  Tag,
  BarChart3,
  Clock,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { 
    currentUser, 
    uploadAvatar,
    users,
    notifications,
    isSidebarCollapsed,
    toggleSidebar,
    labels
  } = useWorkspaceStore();

  const statusColors: Record<string, string> = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    offline: 'bg-gray-400',
  };

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [versionText, setVersionText] = useState('Sürüm -');

  useEffect(() => {
    let isMounted = true;

    const loadVersion = async () => {
      try {
        const version = await window.electron?.getAppVersion?.();
        if (!isMounted) return;

        if (typeof version === 'string' && version.trim()) {
          setVersionText(`Sürüm v${version.trim()}`);
          return;
        }
      } catch {
        // fallback metin korunur
      }

      if (isMounted) {
        setVersionText('Sürüm -');
      }
    };

    loadVersion();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAvatar(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const onlineUsers = users.filter(u => u.status === 'online' || u.status === 'away');

  const menuItems = [
    { id: 'board', label: 'Pano', icon: LayoutGrid },
    { id: 'members', label: 'Üyeler', icon: Users, badge: onlineUsers.length },
    { id: 'labels', label: 'Etiketler', icon: Tag, badge: labels.length },
    { id: 'analytics', label: 'Analiz', icon: BarChart3 },
    { id: 'activity', label: 'Aktivite', icon: Clock },
  ];

  return (
    <aside 
      className={cn(
        "h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
        isSidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="font-semibold text-sidebar-foreground">YGA Workspace</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            onClick={() => onTabChange(item.id)}
            className={cn(
              "w-full justify-start gap-3 h-10 text-sidebar-foreground hover:bg-sidebar-accent",
              isSidebarCollapsed && "justify-center px-2",
              activeTab === item.id && "bg-sidebar-accent text-sidebar-primary"
            )}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && (
              <>
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge !== undefined && (
                  <Badge variant="secondary" className="bg-sidebar-accent text-xs">
                    {item.badge}
                  </Badge>
                )}
              </>
            )}
          </Button>
        ))}

        {/* Notifications */}
        <Button
          variant="ghost"
          onClick={() => onTabChange('notifications')}
          className={cn(
            "w-full justify-start gap-3 h-10 text-sidebar-foreground hover:bg-sidebar-accent",
            isSidebarCollapsed && "justify-center px-2",
            activeTab === 'notifications' && "bg-sidebar-accent text-sidebar-primary"
          )}
        >
          <div className="relative">
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full" />
            )}
          </div>
          {!isSidebarCollapsed && (
            <>
              <span className="flex-1 text-left">Bildirimler</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {unreadCount}
                </Badge>
              )}
            </>
          )}
        </Button>
        {!isSidebarCollapsed && (
          <p className="px-3 pb-2 text-xs text-muted-foreground">{versionText}</p>
        )}
      </nav>

      {/* Online Users (when expanded) */}
      {!isSidebarCollapsed && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Çevrimiçi ({onlineUsers.length})
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {onlineUsers.slice(0, 5).map((user) => (
              <div key={`${user.id}-${user.username}`} className="flex items-center gap-2 py-1">
                <div className="relative">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.display_name}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div 
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: user.avatar_color }}
                    >
                      {user.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span 
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar",
                      user.status === 'online' && "bg-green-500",
                      user.status === 'away' && "bg-yellow-500"
                    )}
                  />
                </div>
                <span className="text-sm text-sidebar-foreground truncate">
                  {user.display_name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Profile */}
      <div className="p-3 border-t border-sidebar-border">
        {currentUser && (
          <div className={cn(
            "flex items-center gap-2",
            isSidebarCollapsed && "justify-center"
          )}>
{/* Avatar with status dot */}
                <div
                  className="relative shrink-0 cursor-pointer group"
                  title="Profil fotoğrafı yükle"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {currentUser.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt={currentUser.display_name}
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: currentUser.avatar_color }}
                    >
                      {currentUser.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-[8px]">📷</span>
                  </div>
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-sidebar",
                    statusColors[currentUser.status] ?? 'bg-gray-400'
                  )} />
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
            {!isSidebarCollapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
                    {currentUser.display_name}
                  </p>
                  <p className="text-xs text-muted-foreground">@{currentUser.username}</p>
                </div>
                </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
