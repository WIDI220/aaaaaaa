import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts';
import { TrendingUp, Clock, Ticket, Users, FileDown, Award, Target, Zap, BarChart2 } from 'lucide-react';

const COLORS = ['#1e3a5f','#0ea5e9','#f97316','#8b5cf6','#22c55e','#ec4899','#14b8a6','#f59e0b','#6366f1'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      {payload.map((p: any, i: number) => <p key={i} style={{ color: p.color }} className="font-medium">{typeof p.value === 'number' ? p.value.toFixed(2) : p.value} {p.name}</p>)}
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
  const { data: allWorklogs = [] } = useQuery({ queryKey: ['all-worklogs'], queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('*, employees(id,name,kuerzel,gewerk)'); return data ?? []; } });

  // Statistiken pro Mitarbeiter
  const empStats = (employees as any[]).map((emp: any) => {
    const logs = (worklogs as any[]).filter((w: any) => w.employee_id === emp.id);
    const stunden = logs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
    const ticketIds = new Set(logs.map((w: any) => w.ticket_id));
    const avgStunden = ticketIds.size > 0 ? stunden / ticketIds.size : 0;

    // Alle Monate für Trend
    const allLogs = (allWorklogs as any[]).filter((w: any) => w.employee_id === emp.id);
    const allStunden = allLogs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);

    return {
      name: emp.kuerzel,
      fullName: emp.name,
      stunden: Math.round(stunden * 100) / 100,
      tickets: ticketIds.size,
      gewerk: emp.gewerk,
      avgStunden: Math.round(avgStunden * 100) / 100,
      allStunden: Math.round(allStunden * 100) / 100,
      efficiency: ticketIds.size > 0 ? Math.round((ticketIds.size / Math.max(stunden, 0.25)) * 100) / 100 : 0,
    };
  }).sort((a: any, b: any) => b.stunden - a.stunden);

  const activeEmp = empStats.filter((e: any) => e.stunden > 0);
  const totalH = activeEmp.reduce((s: any, e: any) => s + e.stunden, 0);
  const totalTickets = (tickets as any[]).length;
  const erledigtT = (tickets as any[]).filter((t: any) => ['erledigt','abrechenbar','abgerechnet'].includes(t.status)).length;
  const avgHperTicket = erledigtT > 0 ? totalH / erledigtT : 0;
  const erledigungsQuote = totalTickets > 0 ? Math.round(erledigtT / totalTickets * 100) : 0;

  // Tagesverlauf
  const tagMap: Record<string, number> = {};
  (worklogs as any[]).forEach((w: any) => { if (w.leistungsdatum) tagMap[w.leistungsdatum] = (tagMap[w.leistungsdatum] ?? 0) + Number(w.stunden ?? 0); });
  const tagData = Object.entries(tagMap).map(([d, s]) => ({ datum: d.slice(5), stunden: Math.round(Number(s)*10)/10 })).sort((a, b) => a.datum.localeCompare(b.datum));

  // Gewerk
  const hochbauH = (worklogs as any[]).filter((w: any) => w.employees?.gewerk === 'Hochbau').reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const elektroH = (worklogs as any[]).filter((w: any) => w.employees?.gewerk === 'Elektro').reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const gewerkData = [
    { name: 'Hochbau', stunden: Math.round(hochbauH*10)/10, tickets: (tickets as any[]).filter((t: any) => t.gewerk === 'Hochbau').length },
    { name: 'Elektro', stunden: Math.round(elektroH*10)/10, tickets: (tickets as any[]).filter((t: any) => t.gewerk === 'Elektro').length },
  ];

  // Top Performer
  const topPerformer = [...activeEmp].sort((a: any, b: any) => b.tickets - a.tickets)[0];
  const mostHours = [...activeEmp].sort((a: any, b: any) => b.stunden - a.stunden)[0];

  // Radar Daten (normalisiert 0-100)
  const maxStunden = Math.max(...activeEmp.map((e: any) => e.stunden), 1);
  const maxTickets = Math.max(...activeEmp.map((e: any) => e.tickets), 1);
  const radarData = activeEmp.slice(0, 6).map((e: any) => ({
    name: e.name,
    Stunden: Math.round(e.stunden / maxStunden * 100),
    Tickets: Math.round(e.tickets / maxTickets * 100),
    Effizienz: Math.min(Math.round(e.efficiency * 20), 100),
  }));

  const kpis = [
    { icon: Clock, label: 'Stunden gesamt', value: `${totalH.toFixed(1)}h`, sub: `Ø ${avgHperTicket.toFixed(2)}h/Ticket`, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { icon: Users, label: 'Aktive Mitarbeiter', value: activeEmp.length, sub: `von ${(employees as any[]).length} gesamt`, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100' },
    { icon: Ticket, label: 'Tickets erledigt', value: `${erledigtT}/${totalTickets}`, sub: `${erledigungsQuote}% Quote`, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100' },
    { icon: Target, label: 'Erledigungsquote', value: `${erledigungsQuote}%`, sub: erledigungsQuote >= 80 ? '🟢 Sehr gut' : erledigungsQuote >= 60 ? '🟡 Gut' : '🔴 Ausbaufähig', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { icon: Award, label: 'Top Tickets', value: topPerformer?.name ?? '–', sub: `${topPerformer?.tickets ?? 0} Tickets`, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { icon: Zap, label: 'Meiste Stunden', value: mostHours?.name ?? '–', sub: `${mostHours?.stunden ?? 0}h`, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100' },
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
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(({ icon: Icon, label, value, sub, color, bg, border }) => (
          <div key={label} className={`bg-white rounded-2xl border ${border} shadow-sm p-4`}>
            <div className={`w-8 h-8 ${bg} rounded-xl flex items-center justify-center mb-2`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
            <p className="text-xs font-medium text-gray-600 mt-0.5">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {activeEmp.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center text-gray-400">
          Keine Stundenbuchungen für {monthName}
        </div>
      ) : (<>
        {/* Charts Reihe 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Stunden pro Mitarbeiter</h2>
            <p className="text-xs text-gray-400 mb-4">Gesamtstunden im Monat</p>
            <ResponsiveContainer width="100%" height={220}>
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
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Tickets pro Mitarbeiter</h2>
            <p className="text-xs text-gray-400 mb-4">Anzahl bearbeiteter Tickets</p>
            <ResponsiveContainer width="100%" height={220}>
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

        {/* Charts Reihe 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Ø Stunden pro Ticket</h2>
            <p className="text-xs text-gray-400 mb-4">Effizienzindikator – niedriger = effizienter</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={activeEmp.filter((e: any) => e.tickets > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avgStunden" name="Ø Std/Ticket" radius={[6,6,0,0]} fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {tagData.length > 1 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Stunden Tagesverlauf</h2>
              <p className="text-xs text-gray-400 mb-4">Arbeitslast über den Monat</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={tagData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="datum" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="stunden" name="Stunden" stroke="#1e3a5f" strokeWidth={2.5} dot={{ r: 3, fill: '#1e3a5f' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Gewerk-Vergleich</h2>
              <p className="text-xs text-gray-400 mb-4">Stunden und Tickets nach Gewerk</p>
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
          )}
        </div>

        {/* Radar + Gesamtstunden */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {radarData.length >= 3 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Team Performance Radar</h2>
              <p className="text-xs text-gray-400 mb-4">Stunden · Tickets · Effizienz (normalisiert 0–100)</p>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#f3f4f6" />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Radar name="Stunden" dataKey="Stunden" stroke="#1e3a5f" fill="#1e3a5f" fillOpacity={0.15} />
                  <Radar name="Tickets" dataKey="Tickets" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} />
                  <Legend />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Gesamtstunden aller Zeiten</h2>
            <p className="text-xs text-gray-400 mb-4">Kumuliert über alle Monate</p>
            <div className="space-y-2.5">
              {empStats.filter((e: any) => e.allStunden > 0).sort((a: any, b: any) => b.allStunden - a.allStunden).map((e: any, i: number) => {
                const maxAll = Math.max(...empStats.map((x: any) => x.allStunden), 1);
                return (
                  <div key={e.name} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4 text-right font-mono">{i+1}</span>
                    <span className="font-mono font-bold text-xs w-8" style={{ color: COLORS[i % COLORS.length] }}>{e.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${(e.allStunden/maxAll)*100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="text-xs font-mono font-semibold text-gray-700 w-14 text-right">{e.allStunden}h</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detail Tabelle */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Detailübersicht · {monthName}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2.5 px-3 font-medium text-gray-400 text-xs uppercase tracking-wide">#</th>
                  <th className="text-left py-2.5 px-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Mitarbeiter</th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Stunden</th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Tickets</th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Ø Std/Ticket</th>
                  <th className="text-right py-2.5 px-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Tickets/h</th>
                  <th className="py-2.5 px-3 font-medium text-gray-400 text-xs uppercase tracking-wide">Anteil</th>
                </tr>
              </thead>
              <tbody>
                {activeEmp.map((e: any, i: number) => (
                  <tr key={e.name} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-3 text-xs text-gray-400 font-mono">{i+1}</td>
                    <td className="py-3 px-3">
                      <span className="font-mono font-bold mr-2 text-sm" style={{ color: COLORS[i % COLORS.length] }}>{e.name}</span>
                      <span className="text-gray-500 text-xs">{e.fullName}</span>
                      <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md">{e.gewerk}</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-gray-800">{e.stunden}h</td>
                    <td className="py-3 px-3 text-right text-gray-600 font-medium">{e.tickets}</td>
                    <td className="py-3 px-3 text-right font-mono text-gray-600">{e.avgStunden}h</td>
                    <td className="py-3 px-3 text-right font-mono text-gray-500">{e.efficiency}</td>
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
                <tr className="bg-gray-50">
                  <td className="py-2.5 px-3"></td>
                  <td className="py-2.5 px-3 text-xs font-bold text-gray-600">GESAMT</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-800">{totalH.toFixed(1)}h</td>
                  <td className="py-2.5 px-3 text-right font-bold text-gray-800">{activeEmp.reduce((s: number, e: any) => s + e.tickets, 0)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-gray-600">{avgHperTicket.toFixed(2)}h</td>
                  <td className="py-2.5 px-3"></td>
                  <td className="py-2.5 px-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </>)}
    </div>
  );
}
