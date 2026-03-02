import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMonth } from '@/contexts/MonthContext';
import {
  LayoutDashboard,
  Ticket,
  FileSpreadsheet,
  FileText,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tickets', label: 'Tickets', icon: Ticket },
  { to: '/import', label: 'Excel-Import', icon: FileSpreadsheet },
  { to: '/pdf-ruecklauf', label: 'PDF-Rücklauf', icon: FileText },
  { to: '/mitarbeiter', label: 'Mitarbeiter', icon: Users },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const { activeMonth, setActiveMonth } = useMonth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const allItems = isAdmin
    ? [...navItems, { to: '/einstellungen', label: 'Einstellungen', icon: Settings }]
    : navItems;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/30 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:relative z-50 h-full bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300
          ${collapsed ? 'w-16' : 'w-60'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-sidebar-border">
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-primary tracking-tight">
              WIDI Controlling
            </span>
          )}
          {collapsed && (
            <span className="text-lg font-bold text-sidebar-primary mx-auto">W</span>
          )}
        </div>

        {/* Month selector */}
        {!collapsed && (
          <div className="px-3 py-2">
            <input
              type="month"
              value={activeMonth}
              onChange={e => setActiveMonth(e.target.value)}
              className="w-full bg-sidebar-accent text-sidebar-accent-foreground border-none rounded px-2 py-1 text-sm"
            />
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
          {allItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                }
                ${collapsed ? 'justify-center' : ''}
              `}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3">
          {!collapsed && user && (
            <p className="text-xs text-sidebar-foreground/60 truncate mb-2">
              {user.email}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              title="Abmelden"
            >
              <LogOut className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="text-sidebar-foreground hover:bg-sidebar-accent hidden md:flex"
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-card border-b flex items-center px-4 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">
            {allItems.find(i => i.to === location.pathname)?.label ?? 'WIDI'}
          </h1>
          <div className="ml-auto md:hidden">
            <input
              type="month"
              value={activeMonth}
              onChange={e => setActiveMonth(e.target.value)}
              className="bg-secondary border rounded px-2 py-1 text-sm"
            />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
