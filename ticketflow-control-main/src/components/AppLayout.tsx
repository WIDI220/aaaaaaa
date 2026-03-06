import { ReactNode } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useMonth } from '@/contexts/MonthContext';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Ticket, FileSpreadsheet, FileText, Users, TrendingUp, LogOut, ChevronLeft, ChevronRight, Building2 } from 'lucide-react';

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
    <div className="mx-3 mb-2">
      <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold px-1 mb-1">Zeitraum</p>
      <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5">
        <button onClick={prev} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
          <ChevronLeft className="h-3 w-3 text-white/60" />
        </button>
        <span className="text-xs font-semibold flex-1 text-center text-white/90 tracking-tight">{label}</span>
        <button onClick={next} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
          <ChevronRight className="h-3 w-3 text-white/60" />
        </button>
      </div>
    </div>
  );
}

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tickets', icon: Ticket, label: 'Tickets' },
  { to: '/import', icon: FileSpreadsheet, label: 'Excel-Import' },
  { to: '/pdf-ruecklauf', icon: FileText, label: 'PDF-Rücklauf' },
  { to: '/mitarbeiter', icon: Users, label: 'Mitarbeiter' },
  { to: '/analyse', icon: TrendingUp, label: 'Analyse' },
  { to: '/aufgaben', icon: ClipboardCheck, label: 'Begehungen' },
];

function SidebarNavLink({ to, icon: Icon, children }: { to: string; icon: any; children: string }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 group
        ${active
          ? 'bg-white/15 text-white shadow-sm'
          : 'text-white/55 hover:text-white/90 hover:bg-white/8'
        }`}
    >
      <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`} />
      <span className="truncate">{children}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400" />}
    </Link>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-[#f0f2f5]">
      {/* Sidebar */}
      <aside
        className="w-52 flex flex-col shrink-0 fixed top-0 left-0 h-screen z-20"
        style={{ background: 'linear-gradient(160deg, #1a3356 0%, #0f2440 60%, #0a1a30 100%)' }}
      >
        {/* Logo */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-sky-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">WIDI</p>
              <p className="text-[10px] text-white/40 leading-tight">Controlling</p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 mb-3 h-px bg-white/8" />

        {/* Month Stepper */}
        <MonthStepper />

        {/* Divider */}
        <div className="mx-4 mb-3 h-px bg-white/8" />

        {/* Nav */}
        <p className="text-[10px] uppercase tracking-widest text-white/30 font-semibold px-4 mb-1">Navigation</p>
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <SidebarNavLink key={to} to={to} icon={icon}>{label}</SidebarNavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="mx-4 mb-4 mt-3">
          <div className="h-px bg-white/8 mb-3" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-sky-500/20 border border-sky-400/20 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-sky-400">{user?.email?.[0]?.toUpperCase()}</span>
            </div>
            <p className="text-[11px] text-white/40 truncate flex-1">{user?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs text-white/40 hover:text-white/70 hover:bg-white/8 transition-all"
          >
            <LogOut className="h-3.5 w-3.5" />
            Abmelden
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-52 min-h-screen">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[#f0f2f5]/80 backdrop-blur-sm border-b border-black/5 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-gray-500 font-medium">Live</span>
          </div>
          <span className="text-xs text-gray-400">WIDI Gebäudeservice GmbH</span>
        </div>

        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
