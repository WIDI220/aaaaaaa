import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Ticket, Clock, CheckCircle, AlertCircle, TrendingUp, ArrowUpRight } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'in_bearbeitung', label: 'In Bearbeitung', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  { value: 'erledigt', label: 'Erledigt', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { value: 'zur_unterschrift', label: 'Zur Unterschrift', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  { value: 'abrechenbar', label: 'Abrechenbar', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  { value: 'abgerechnet', label: 'Abgerechnet', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', dot: 'bg-gray-400' },
];

const PIE_COLORS = ['#3b82f6','#10b981','#f59e0b','#f97316','#6b7280'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800">{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }} className="font-medium">{p.value} {p.name}</p>)}
    </div>
  );
};

export default function Dashboard() {
  const { activeMonth } = useMonth();
  const [year, month] = activeMonth.split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;
  const monthName = new Date(parseInt(year), parseInt(month)-1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const { data: tickets = [] } = useQuery({ queryKey: ['tickets', activeMonth], queryFn: async () => { const { data } = await supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to); return data ?? []; } });
  const { data: allTickets = [] } = useQuery({ queryKey: ['tickets-all'], queryFn: async () => { const { data } = await supabase.from('tickets').select('status, gewerk'); return data ?? []; } });
  const { data: worklogs = [] } = useQuery({ queryKey: ['worklogs', activeMonth], queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('*, employees(name, gewerk)').gte('leistungsdatum', from).lte('leistungsdatum', to); return data ?? []; } });

  const totalTickets = tickets.length;
  const totalHours = worklogs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const openTickets = tickets.filter((t: any) => t.status === 'in_bearbeitung').length;
  const doneTickets = tickets.filter((t: any) => t.status === 'abgerechnet').length;
  const pieData = STATUS_OPTIONS.map(s => ({ name: s.label, value: tickets.filter((t: any) => t.status === s.value).length })).filter(d => d.value > 0);
  const gewerkData = [{ name: 'Hochbau', tickets: tickets.filter((t: any) => t.gewerk === 'Hochbau').length }, { name: 'Elektro', tickets: tickets.filter((t: any) => t.gewerk === 'Elektro').length }];
  const empHours = new Map<string, number>();
  worklogs.forEach((w: any) => { const n = w.employees?.name ?? 'Unbekannt'; empHours.set(n, (empHours.get(n) ?? 0) + Number(w.stunden ?? 0)); });
  const employeeData = Array.from(empHours.entries()).map(([name, stunden]) => ({ name, stunden: Math.round(stunden * 10) / 10 })).sort((a, b) => b.stunden - a.stunden);

  const kpis = [
    { icon: Ticket, label: 'Tickets im Monat', value: totalTickets, sub: monthName, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { icon: Clock, label: 'Stunden gesamt', value: `${totalHours.toFixed(1)}h`, sub: 'Monat', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100' },
    { icon: AlertCircle, label: 'In Bearbeitung', value: openTickets, sub: `${totalTickets > 0 ? Math.round(openTickets/totalTickets*100) : 0}% aller Tickets`, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { icon: CheckCircle, label: 'Abgerechnet', value: doneTickets, sub: `${totalTickets > 0 ? Math.round(doneTickets/totalTickets*100) : 0}% fertig`, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">{monthName} · Übersicht</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ icon: Icon, label, value, sub, color, bg, border }) => (
          <div key={label} className={`bg-white rounded-2xl border ${border} shadow-sm p-5 hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-300" />
            </div>
            <p className="text-3xl font-bold text-gray-900 tracking-tight">{value}</p>
            <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Status Kacheln */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Status-Verteilung · {monthName}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STATUS_OPTIONS.map(s => {
            const count = tickets.filter((t: any) => t.status === s.value).length;
            const pct = totalTickets ? Math.round(count/totalTickets*100) : 0;
            return (
              <div key={s.value} className={`${s.bg} border ${s.border} rounded-xl p-3 text-center`}>
                <div className={`w-2 h-2 rounded-full ${s.dot} mx-auto mb-2`} />
                <p className={`text-2xl font-bold ${s.text}`}>{count}</p>
                <p className={`text-xs font-medium ${s.text} mt-1 leading-tight`}>{s.label}</p>
                <p className={`text-xs ${s.text} opacity-60 mt-0.5`}>{pct}%</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Gewerk-Vergleich</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={gewerkData} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="tickets" name="Tickets" radius={[8,8,0,0]} fill="#1e3a5f" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Status (Pie)</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={35} paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">Keine Daten für {monthName}</div>}
        </div>
      </div>

      {/* Mitarbeiter + Gesamtbestand */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {employeeData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Mitarbeiter-Stunden · {monthName}</h2>
            <div className="space-y-2.5">
              {employeeData.map((e, i) => {
                const max = employeeData[0]?.stunden ?? 1;
                return (
                  <div key={e.name} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4 text-right font-mono">{i+1}</span>
                    <span className="text-sm text-gray-700 w-28 truncate font-medium">{e.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-[#1e3a5f] transition-all" style={{ width: `${(e.stunden/max)*100}%` }} />
                    </div>
                    <span className="text-xs font-mono font-semibold text-gray-700 w-12 text-right">{e.stunden}h</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Gesamtbestand (alle Monate)</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {STATUS_OPTIONS.map(s => {
              const count = allTickets.filter((t: any) => t.status === s.value).length;
              return (
                <div key={s.value} className={`${s.bg} border ${s.border} rounded-xl px-3 py-2 flex items-center justify-between`}>
                  <span className={`text-xs font-medium ${s.text}`}>{s.label}</span>
                  <span className={`text-lg font-bold ${s.text}`}>{count}</span>
                </div>
              );
            })}
          </div>
          <div className="bg-gray-50 rounded-xl px-3 py-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Gesamt alle Tickets</span>
            <span className="text-lg font-bold text-gray-800">{allTickets.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
