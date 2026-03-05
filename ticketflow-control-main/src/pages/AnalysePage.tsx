import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';
import { TrendingUp, Clock, Ticket, Users, FileDown } from 'lucide-react';

const COLORS = ['#1e3a5f','#0ea5e9','#f97316','#8b5cf6','#22c55e','#ec4899','#14b8a6','#f59e0b','#6366f1'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }} className="font-medium">{p.value} {p.name}</p>)}
    </div>
  );
};

export default function AnalysePage() {
  const { activeMonth } = useMonth();
  const [year, month] = activeMonth.split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;
  const monthName = new Date(parseInt(year), parseInt(month)-1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true); return data ?? []; } });
  const { data: worklogs = [] } = useQuery({ queryKey: ['worklogs-analyse', activeMonth], queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('*, employees(id,name,kuerzel,gewerk), tickets(a_nummer,gewerk,status)').gte('leistungsdatum', from).lte('leistungsdatum', to); return data ?? []; } });
  const { data: tickets = [] } = useQuery({ queryKey: ['tickets-analyse', activeMonth], queryFn: async () => { const { data } = await supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to); return data ?? []; } });

  const empStats = (employees as any[]).map((emp: any) => {
    const logs = (worklogs as any[]).filter((w: any) => w.employee_id === emp.id);
    const stunden = logs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
    const ticketIds = new Set(logs.map((w: any) => w.ticket_id));
    return { name: emp.kuerzel, fullName: emp.name, stunden: Math.round(stunden*100)/100, tickets: ticketIds.size, gewerk: emp.gewerk, avgH: ticketIds.size > 0 ? Math.round(stunden/ticketIds.size*100)/100 : 0 };
  }).sort((a: any, b: any) => b.stunden - a.stunden);

  const activeEmp = empStats.filter((e: any) => e.stunden > 0);
  const tagMap: Record<string, number> = {};
  (worklogs as any[]).forEach((w: any) => { if (w.leistungsdatum) tagMap[w.leistungsdatum] = (tagMap[w.leistungsdatum] ?? 0) + Number(w.stunden ?? 0); });
  const tagData = Object.entries(tagMap).map(([d, s]) => ({ datum: d.slice(5), stunden: Math.round(Number(s)*10)/10 })).sort((a, b) => a.datum.localeCompare(b.datum));
  const hochbauH = (worklogs as any[]).filter((w: any) => w.employees?.gewerk === 'Hochbau').reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const elektroH = (worklogs as any[]).filter((w: any) => w.employees?.gewerk === 'Elektro').reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const gewerkData = [{ name: 'Hochbau', stunden: Math.round(hochbauH*10)/10, tickets: (tickets as any[]).filter((t: any) => t.gewerk === 'Hochbau').length }, { name: 'Elektro', stunden: Math.round(elektroH*10)/10, tickets: (tickets as any[]).filter((t: any) => t.gewerk === 'Elektro').length }];
  const totalH = activeEmp.reduce((s: any, e: any) => s + e.stunden, 0);
  const totalTickets = (tickets as any[]).length;
  const erledigtT = (tickets as any[]).filter((t: any) => ['erledigt','abrechenbar','abgerechnet'].includes(t.status)).length;

  const kpis = [
    { icon: Clock, label: 'Stunden gesamt', value: `${totalH.toFixed(1)}h`, color: 'text-blue-600', bg: 'bg-blue-50' },
    { icon: Users, label: 'Aktive Mitarbeiter', value: activeEmp.length, color: 'text-purple-600', bg: 'bg-purple-50' },
    { icon: Ticket, label: 'Tickets gesamt', value: totalTickets, color: 'text-orange-600', bg: 'bg-orange-50' },
    { icon: TrendingUp, label: 'Erledigt', value: `${erledigtT}/${totalTickets}`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analyse</h1>
          <p className="text-sm text-gray-500 mt-0.5">{monthName}</p>
        </div>
        <button
          onClick={() => window.open(`https://widi-220-ticketflow-control.vercel.app/api/monatsbericht?month=${activeMonth}`, '_blank')}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium hover:bg-[#162d4a] transition-colors shadow-sm"
        >
          <FileDown className="h-4 w-4" /> Monatsbericht PDF
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {activeEmp.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-gray-400">
          Keine Stundenbuchungen für {monthName}
        </div>
      ) : (<>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Stunden pro Mitarbeiter</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={activeEmp}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="stunden" name="Stunden" radius={[6,6,0,0]}>
                  {activeEmp.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Tickets pro Mitarbeiter</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={activeEmp}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="tickets" name="Tickets" radius={[6,6,0,0]}>
                  {activeEmp.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Gewerk-Vergleich</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={gewerkData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="stunden" name="Stunden" fill="#1e3a5f" radius={[0,6,6,0]} />
                <Bar dataKey="tickets" name="Tickets" fill="#f97316" radius={[0,6,6,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {tagData.length > 1 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Stunden pro Tag</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={tagData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="datum" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="stunden" name="Stunden" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 4, fill: '#1e3a5f' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Detail Tabelle */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Detailübersicht</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Mitarbeiter</th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Stunden</th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Tickets</th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Ø Std/Ticket</th>
                  <th className="py-2.5 px-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Anteil</th>
                </tr>
              </thead>
              <tbody>
                {activeEmp.map((e: any, i: number) => (
                  <tr key={e.name} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-mono font-bold mr-2 text-sm" style={{ color: COLORS[i % COLORS.length] }}>{e.name}</span>
                      <span className="text-gray-500 text-xs">{e.fullName}</span>
                      <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md">{e.gewerk}</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-gray-800">{e.stunden}h</td>
                    <td className="py-3 px-3 text-right text-gray-600">{e.tickets}</td>
                    <td className="py-3 px-3 text-right font-mono text-gray-600">{e.avgH}h</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div className="rounded-full h-1.5" style={{ width: `${totalH > 0 ? e.stunden/totalH*100 : 0}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                        </div>
                        <span className="text-xs text-gray-400 w-8 text-right">{totalH > 0 ? Math.round(e.stunden/totalH*100) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </div>
  );
}
