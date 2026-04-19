'use client';

import { useWorkspaceStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp,
  Users,
  Target,
  Calendar,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AnalyticsPanel() {
  const { todos, users, categories } = useWorkspaceStore();

  // Calculate stats
  const totalTodos = todos.length;
  const completedTodos = todos.filter(t => t.status === 'done').length;
  const inProgressTodos = todos.filter(t => t.status === 'in_progress').length;
  const blockedTodos = todos.filter(t => t.status === 'blocked').length;
  const overdueTodos = todos.filter(t => {
    if (!t.due_date || t.status === 'done') return false;
    return new Date(t.due_date) < new Date();
  }).length;

  const completionRate = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

  // Priority distribution
  const priorityStats = {
    urgent: todos.filter(t => t.priority === 'urgent' && t.status !== 'done').length,
    high: todos.filter(t => t.priority === 'high' && t.status !== 'done').length,
    medium: todos.filter(t => t.priority === 'medium' && t.status !== 'done').length,
    low: todos.filter(t => t.priority === 'low' && t.status !== 'done').length,
  };

  // User productivity
  const userStats = users.map(user => {
    const assigned = todos.filter(t => t.assignees?.some(a => a.user_id === user.id));
    const completed = assigned.filter(t => t.status === 'done').length;
    return {
      ...user,
      assigned: assigned.length,
      completed,
      rate: assigned.length > 0 ? Math.round((completed / assigned.length) * 100) : 0,
    };
  }).sort((a, b) => b.completed - a.completed);

  // Category distribution
  const categoryStats = categories.map(cat => ({
    ...cat,
    count: todos.filter(t => t.category_id === cat.id).length,
  }));

  const statCards = [
    {
      title: 'Toplam Gorev',
      value: totalTodos,
      icon: Target,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'Tamamlanan',
      value: completedTodos,
      icon: CheckCircle2,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      subtitle: `%${completionRate} tamamlandi`,
    },
    {
      title: 'Devam Eden',
      value: inProgressTodos,
      icon: Clock,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'Geciken',
      value: overdueTodos,
      icon: AlertTriangle,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
    },
  ];

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Analiz ve Raporlar</h1>
          <p className="text-muted-foreground">
            Workspace performansinizi takip edin
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", stat.bg)}>
                    <stat.icon className={cn("w-5 h-5", stat.color)} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    {stat.subtitle && (
                      <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Completion Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Tamamlanma Orani
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Genel Ilerleme</span>
                    <span className="text-sm font-medium">{completionRate}%</span>
                  </div>
                  <Progress value={completionRate} className="h-3" />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="text-center p-4 bg-secondary/50 rounded-lg">
                    <p className="text-3xl font-bold text-green-500">{completedTodos}</p>
                    <p className="text-sm text-muted-foreground">Tamamlandi</p>
                  </div>
                  <div className="text-center p-4 bg-secondary/50 rounded-lg">
                    <p className="text-3xl font-bold">{totalTodos - completedTodos}</p>
                    <p className="text-sm text-muted-foreground">Kalan</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Priority Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Oncelik Dagilimi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { key: 'urgent', label: 'Acil', color: 'bg-red-500' },
                  { key: 'high', label: 'Yuksek', color: 'bg-orange-500' },
                  { key: 'medium', label: 'Orta', color: 'bg-yellow-500' },
                  { key: 'low', label: 'Dusuk', color: 'bg-blue-500' },
                ].map((priority) => {
                  const count = priorityStats[priority.key as keyof typeof priorityStats];
                  const percentage = totalTodos > 0 ? Math.round((count / totalTodos) * 100) : 0;
                  
                  return (
                    <div key={priority.key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-3 h-3 rounded-full", priority.color)} />
                          <span className="text-sm">{priority.label}</span>
                        </div>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full rounded-full transition-all", priority.color)}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* User Productivity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Ekip Performansi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {userStats.slice(0, 5).map((user, index) => (
                  <div key={user.id} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-4">{index + 1}</span>
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                      style={{ backgroundColor: user.avatar_color }}
                    >
                      {user.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.display_name}</p>
                      <div className="flex items-center gap-2">
                        <Progress value={user.rate} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground">{user.rate}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-500">{user.completed}</p>
                      <p className="text-xs text-muted-foreground">/{user.assigned}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Category Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                Kategori Dagilimi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categoryStats.map((cat) => {
                  const percentage = totalTodos > 0 ? Math.round((cat.count / totalTodos) * 100) : 0;
                  
                  return (
                    <div key={cat.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-sm">{cat.name}</span>
                        </div>
                        <span className="text-sm font-medium">{cat.count}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percentage}%`, backgroundColor: cat.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
