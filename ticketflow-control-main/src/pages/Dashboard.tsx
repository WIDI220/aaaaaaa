import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Ticket, Clock, CheckCircle, AlertCircle, TrendingUp, ArrowUpRight, Building2, Zap } from 'lucide-react';

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

  // Alle Daten NUR für den aktiven Monat
  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-dash', activeMonth],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to);
      return data ?? [];
    },
  });

  const { data: worklogs = [] } = useQuery({
    queryKey: ['worklogs-dash', activeMonth],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs')
        .select('*, employees(name, kuerzel, gewerk)')
        .gte('leistungsdatum', from).lte('leistungsdatum', to);
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true); return data ?? []; },
  });

  // Vormonat für Vergleich
  const prevDate = new Date(parseInt(year), parseInt(month) - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
  const prevFrom = `${prevYear}-${prevMonth}-01`;
  const prevLastDay = new Date(prevYear, prevDate.getMonth() + 1, 0).getDate();
  const prevTo = `${prevYear}-${prevMonth}-${String(prevLastDay).padStart(2,'0')}`;

  const { data: prevWorklogs = [] } = useQuery({
    queryKey: ['prev-worklogs-dash', activeMonth],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs').select('stunden').gte('leistungsdatum', prevFrom).lte('leistungsdatum', prevTo);
      return data ?? [];
    },
  });

  const t = tickets as any[];
  const w = worklogs as any[];
  const e = employees as any[];
  const pw = prevWorklogs as any[];

  const totalH = w.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const prevTotalH = pw.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const erledigtCount = t.filter((x: any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const inBearbeitungCount = t.filter((x: any) => x.status === 'in_bearbeitung').length;
  const abgerechnetCount = t.filter((x: any) => x.status === 'abgerechnet').length;
  const stundenTrend = prevTotalH > 0 ? ((totalH - prevTotalH) / prevTotalH * 100).toFixed(1) : null;

  // Status Verteilung (nur aktueller Monat)
  const statusData = STATUS_OPTIONS.map(s => ({
    name: s.label,
    value: t.filter((x: any) => x.status === s.value).length,
    pct: t.length > 0 ? Math.round(t.filter((x: any) => x.status === s.value).length / t.length * 100) : 0,
    ...s,
  })).filter(s => s.value > 0);

  // Gewerk Vergleich (nur aktueller Monat)
  const hochbauTickets = t.filter((x: any) => x.gewerk === 'Hochbau');
  const elektroTickets = t.filter((x: any) => x.gewerk === 'Elektro');
  const hochbauH = w.filter((x: any) => x.employees?.gewerk === 'Hochbau').reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const elektroH = w.filter((x: any) => x.employees?.gewerk === 'Elektro').reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
  const hochbauErledigt = hochbauTickets.filter((x: any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const elektroErledigt = elektroTickets.filter((x: any) => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;

  const gewerkData = [
    { name: 'Hochbau', Tickets: hochbauTickets.length, Stunden: Math.round(hochbauH * 10) / 10, Erledigt: hochbauErledigt },
    { name: 'Elektro', Tickets: elektroTickets.length, Stunden: Math.round(elektroH * 10) / 10, Erledigt: elektroErledigt },
  ];

  // Mitarbeiter Stunden (nur aktueller Monat)
  const empStunden = e.map((emp: any) => {
    const logs = w.filter((x: any) => x.employee_id === emp.id);
    const stunden = logs.reduce((s: number, x: any) => s + Number(x.stunden ?? 0), 0);
    return { name: emp.kuerzel, stunden: Math.round(stunden * 10) / 10 };
  }).filter((x: any) => x.stunden > 0).sort((a: any, b: any) => b.stunden - a.stunden);

  const maxEmpH = Math.max(...empStunden.map((e: any) => e.stunden), 1);

  const kpis = [
    {
      label: 'Tickets gesamt', value: t.length, icon: Ticket,
      sub: `${inBearbeitungCount} offen`, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100',
      trend: null,
    },
    {
      label: 'Stunden gesamt', value: `${totalH.toFixed(1)}h`, icon: Clock,
      sub: stundenTrend ? `${parseFloat(stundenTrend) >= 0 ? '▲' : '▼'} ${Math.abs(parseFloat(stundenTrend))}% zum Vormonat` : 'kein Vormonat',
      color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100',
      trend: stundenTrend,
    },
    {
      label: 'In Bearbeitung', value: inBearbeitungCount, icon: AlertCircle,
      sub: `${t.length > 0 ? Math.round(inBearbeitungCount/t.length*100) : 0}% des Monats`,
      color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100',
      trend: null,
    },
    {
      label: 'Abgerechnet', value: abgerechnetCount, icon: CheckCircle,
      sub: `${erledigtCount} erledigt gesamt`,
      color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
      trend: null,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">{monthName} · {t.length} Tickets</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(({ label, value, icon: Icon, sub, color, bg, border, trend }) => (
          <div key={label} className={`bg-white rounded-2xl border ${border} shadow-sm p-5 relative overflow-hidden`}>
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <p className="text-3xl font-bold text-gray-900 tracking-tight">{value}</p>
            <p className="text-xs font-medium text-gray-600 mt-1">{label}</p>
            <p className={`text-xs mt-0.5 ${trend !== null ? (parseFloat(trend) >= 0 ? 'text-emerald-500' : 'text-red-400') : 'text-gray-400'}`}>{sub}</p>
            <ArrowUpRight className="absolute top-4 right-4 h-4 w-4 text-gray-200" />
          </div>
        ))}
      </div>

      {/* Status Kacheln */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {STATUS_OPTIONS.map((s, i) => {
          const count = t.filter((x: any) => x.status === s.value).length;
          const pct = t.length > 0 ? Math.round(count / t.length * 100) : 0;
          return (
            <div key={s.value} className={`bg-white rounded-2xl border ${s.border} shadow-sm p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                <span className="text-xs font-medium text-gray-500">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-400 mt-0.5">{pct}%</p>
            </div>
          );
        })}
      </div>

      {/* Charts Reihe 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Gewerk Vergleich - vollständig */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-0.5">Gewerk Vergleich</h2>
          <p className="text-xs text-gray-400 mb-4">Tickets · Stunden · Erledigt – {monthName}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={gewerkData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
              <Bar dataKey="Tickets" fill="#3b82f6" radius={[5,5,0,0]} />
              <Bar dataKey="Stunden" fill="#8b5cf6" radius={[5,5,0,0]} />
              <Bar dataKey="Erledigt" fill="#10b981" radius={[5,5,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          {/* Gewerk Detail */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-50">
            {[
              { name: 'Hochbau', icon: Building2, tickets: hochbauTickets.length, stunden: hochbauH, erledigt: hochbauErledigt, color: '#3b82f6' },
              { name: 'Elektro', icon: Zap, tickets: elektroTickets.length, stunden: elektroH, erledigt: elektroErledigt, color: '#8b5cf6' },
            ].map(g => (
              <div key={g.name} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <g.icon className="h-3.5 w-3.5" style={{ color: g.color }} />
                  <span className="text-xs font-semibold text-gray-700">{g.name}</span>
                </div>
                <div className="space-y-0.5 text-xs text-gray-500">
                  <div className="flex justify-between"><span>Tickets</span><strong className="text-gray-700">{g.tickets}</strong></div>
                  <div className="flex justify-between"><span>Stunden</span><strong className="text-gray-700">{g.stunden}h</strong></div>
                  <div className="flex justify-between"><span>Erledigt</span><strong className="text-emerald-600">{g.erledigt}</strong></div>
                  <div className="flex justify-between"><span>Quote</span><strong style={{ color: g.color }}>{g.tickets > 0 ? Math.round(g.erledigt/g.tickets*100) : 0}%</strong></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status PieChart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-0.5">Status Verteilung</h2>
          <p className="text-xs text-gray-400 mb-2">{monthName}</p>
          {t.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Keine Tickets</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {statusData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [`${v} Tickets`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Mitarbeiter Stunden */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-0.5">Mitarbeiter Stunden</h2>
        <p className="text-xs text-gray-400 mb-4">{monthName} – nur gebuchte Stunden dieses Monats</p>
        {empStunden.length === 0 ? (
          <p className="text-sm text-gray-300 py-4 text-center">Keine Stunden für {monthName}</p>
        ) : (
          <div className="space-y-2.5">
            {empStunden.map((emp: any, i: number) => (
              <div key={emp.name} className="flex items-center gap-3">
                <span className="font-mono font-bold text-sm w-8 text-gray-700">{emp.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                  <div className="h-2.5 rounded-full transition-all" style={{ width: `${emp.stunden/maxEmpH*100}%`, background: `hsl(${210 + i*25}, 70%, 50%)` }} />
                </div>
                <span className="font-mono text-sm font-semibold text-gray-700 w-12 text-right">{emp.stunden}h</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
