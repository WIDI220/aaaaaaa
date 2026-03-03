import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis
} from 'recharts';
import { TrendingUp, Clock, Ticket, Users } from 'lucide-react';

const COLORS = ['#1e3a5f','#0ea5e9','#f97316','#8b5cf6','#22c55e','#ec4899','#14b8a6','#f59e0b','#6366f1'];

export default function AnalysePage() {
  const { activeMonth } = useMonth();
  const [year, month] = activeMonth.split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;
  const monthName = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('aktiv', true);
      return data ?? [];
    },
  });

  const { data: worklogs = [] } = useQuery({
    queryKey: ['worklogs-analyse', activeMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_worklogs')
        .select('*, employees(id, name, kuerzel, gewerk), tickets(a_nummer, gewerk, status)')
        .gte('leistungsdatum', from).lte('leistungsdatum', to);
      return data ?? [];
    },
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-analyse', activeMonth],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to);
      return data ?? [];
    },
  });

  // Stunden + Tickets pro Mitarbeiter
  const empStats = employees.map((emp: any) => {
    const empLogs = (worklogs as any[]).filter((w: any) => w.employee_id === emp.id);
    const stunden = empLogs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
    const ticketIds = new Set(empLogs.map((w: any) => w.ticket_id));
    return {
      name: emp.kuerzel,
      fullName: emp.name,
      stunden: Math.round(stunden * 100) / 100,
      tickets: ticketIds.size,
      gewerk: emp.gewerk,
      avgH: ticketIds.size > 0 ? Math.round(stunden / ticketIds.size * 100) / 100 : 0,
    };
  }).sort((a: any, b: any) => b.stunden - a.stunden);

  const activeEmp = empStats.filter((e: any) => e.stunden > 0);

  // Stunden pro Tag
  const tagMap: Record<string, number> = {};
  (worklogs as any[]).forEach((w: any) => {
    if (w.leistungsdatum) tagMap[w.leistungsdatum] = (tagMap[w.leistungsdatum] ?? 0) + Number(w.stunden ?? 0);
  });
  const tagData = Object.entries(tagMap)
    .map(([d, s]) => ({ datum: d.slice(5), stunden: Math.round(Number(s) * 10) / 10 }))
    .sort((a, b) => a.datum.localeCompare(b.datum));

  // Gewerk
  const hochbauH = (worklogs as any[]).filter((w: any) => w.employees?.gewerk === 'Hochbau').reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const elektroH = (worklogs as any[]).filter((w: any) => w.employees?.gewerk === 'Elektro').reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const gewerkData = [
    { name: 'Hochbau', stunden: Math.round(hochbauH * 10) / 10, tickets: (tickets as any[]).filter((t: any) => t.gewerk === 'Hochbau').length },
    { name: 'Elektro', stunden: Math.round(elektroH * 10) / 10, tickets: (tickets as any[]).filter((t: any) => t.gewerk === 'Elektro').length },
  ];

  const totalH = activeEmp.reduce((s: any, e: any) => s + e.stunden, 0);
  const totalTickets = (tickets as any[]).length;
  const erledigtT = (tickets as any[]).filter((t: any) => ['erledigt','abrechenbar','abgerechnet'].includes(t.status)).length;

  // Stunden vs Tickets Vergleich
  const vergleichData = activeEmp.map((e: any) => ({
    name: e.name,
    stunden: e.stunden,
    tickets: e.tickets,
  }));

  // Radar-Daten (normalisiert)
  const maxH = Math.max(...activeEmp.map((e: any) => e.stunden), 1);
  const maxT = Math.max(...activeEmp.map((e: any) => e.tickets), 1);
  const radarData = activeEmp.slice(0, 6).map((e: any) => ({
    name: e.name,
    Stunden: Math.round(e.stunden / maxH * 100),
    Tickets: Math.round(e.tickets / maxT * 100),
    Effizienz: Math.round((e.avgH > 0 ? Math.min(e.avgH, 4) / 4 : 0) * 100),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Analyse – {monthName}</h2>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Clock, label: 'Stunden gesamt', value: `${totalH.toFixed(1)}h`, color: 'text-blue-600' },
          { icon: Users, label: 'Aktive Mitarbeiter', value: activeEmp.length, color: 'text-purple-600' },
          { icon: Ticket, label: 'Tickets gesamt', value: totalTickets, color: 'text-orange-600' },
          { icon: TrendingUp, label: 'Erledigt', value: `${erledigtT}/${totalTickets}`, color: 'text-green-600' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label}><CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Icon className={`h-8 w-8 ${color} opacity-80`} />
              <div>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {activeEmp.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Keine Stundenbuchungen für {monthName}
        </CardContent></Card>
      ) : (
        <>
          {/* Stunden Balkendiagramm */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Stunden pro Mitarbeiter</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={activeEmp}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => [`${v}h`, 'Stunden']} labelFormatter={(l: any) => activeEmp.find((e: any) => e.name === l)?.fullName ?? l} />
                    <Bar dataKey="stunden" radius={[4,4,0,0]}>
                      {activeEmp.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Tickets pro Mitarbeiter</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={activeEmp}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => [v, 'Tickets']} labelFormatter={(l: any) => activeEmp.find((e: any) => e.name === l)?.fullName ?? l} />
                    <Bar dataKey="tickets" radius={[4,4,0,0]}>
                      {activeEmp.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Stunden vs Tickets Vergleich */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Stunden vs. Tickets – Mitarbeitervergleich</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={vergleichData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" orientation="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="stunden" name="Stunden" fill="#1e3a5f" radius={[4,4,0,0]} />
                  <Bar yAxisId="right" dataKey="tickets" name="Tickets" fill="#0ea5e9" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gewerk + Tagesverlauf */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Gewerk-Vergleich</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={gewerkData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={60} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="stunden" name="Stunden" fill="#1e3a5f" radius={[0,4,4,0]} />
                    <Bar dataKey="tickets" name="Tickets" fill="#f97316" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Ø Stunden pro Ticket</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={activeEmp}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => [`${v}h`, 'Ø Std/Ticket']} />
                    <Bar dataKey="avgH" name="Ø Std/Ticket" fill="#8b5cf6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tagesverlauf */}
          {tagData.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-sm font-medium">Stunden pro Tag</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={tagData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="datum" />
                    <YAxis />
                    <Tooltip formatter={(v: any) => [`${v}h`, 'Stunden']} />
                    <Line type="monotone" dataKey="stunden" stroke="#1e3a5f" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Detail Tabelle */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Detailübersicht</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">Mitarbeiter</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">Stunden</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">Tickets</th>
                    <th className="text-right py-2 px-4 font-medium text-muted-foreground">Ø Std/Ticket</th>
                    <th className="py-2 px-4 font-medium text-muted-foreground">Anteil</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEmp.map((e: any, i: number) => (
                    <tr key={e.name} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2.5 px-4">
                        <span className="font-mono font-bold mr-2" style={{ color: COLORS[i % COLORS.length] }}>{e.name}</span>
                        <span className="text-muted-foreground text-xs">{e.fullName}</span>
                        <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">{e.gewerk}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold">{e.stunden}h</td>
                      <td className="py-2.5 px-4 text-right">{e.tickets}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{e.avgH}h</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className="rounded-full h-2 transition-all"
                              style={{ width: `${totalH > 0 ? e.stunden / totalH * 100 : 0}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {totalH > 0 ? Math.round(e.stunden / totalH * 100) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
