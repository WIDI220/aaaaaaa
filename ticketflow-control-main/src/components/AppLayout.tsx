import { ReactNode } from 'react';
import { NavLink } from '@/components/NavLink';
import { useMonth } from '@/contexts/MonthContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Ticket, FileSpreadsheet, FileText, Users, TrendingUp, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';

function MonthStepper() {
  const { activeMonth, setActiveMonth } = useMonth();
  const [year, month] = activeMonth.split('-').map(Number);

  const prev = () => {
    const d = new Date(year, month - 2, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const next = () => {
    const d = new Date(year, month, 1);
    setActiveMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const label = new Date(year, month - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-sidebar-accent rounded-lg">
      <button onClick={prev} className="p-1 hover:bg-white/10 rounded"><ChevronLeft className="h-3.5 w-3.5" /></button>
      <span className="text-xs font-medium flex-1 text-center">{label}</span>
      <button onClick={next} className="p-1 hover:bg-white/10 rounded"><ChevronRight className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-48 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        <div className="p-4 border-b border-sidebar-border">
          <h1 className="text-base font-bold">WIDI Controlling</h1>
        </div>

        <div className="p-3">
          <MonthStepper />
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          <NavLink to="/dashboard" icon={LayoutDashboard}>Dashboard</NavLink>
          <NavLink to="/tickets" icon={Ticket}>Tickets</NavLink>
          <NavLink to="/import" icon={FileSpreadsheet}>Excel-Import</NavLink>
          <NavLink to="/pdf-ruecklauf" icon={FileText}>PDF-Rücklauf</NavLink>
          <NavLink to="/mitarbeiter" icon={Users}>Mitarbeiter</NavLink>
          <NavLink to="/analyse" icon={TrendingUp}>Analyse</NavLink>
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/60 truncate mb-2">{user?.email}</p>
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground h-8" onClick={signOut}>
            <LogOut className="h-3.5 w-3.5 mr-2" />Abmelden
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
