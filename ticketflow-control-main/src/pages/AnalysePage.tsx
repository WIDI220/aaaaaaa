import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp } from 'lucide-react';

export default function AnalysePage() {
  const { activeMonth } = useMonth();
  const [year, month] = activeMonth.split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;

  const monthName = new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleString('de-DE', { month: 'long', year: 'numeric' });

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
        .gte('leistungsdatum', from)
        .lte('leistungsdatum', to);
      return data ?? [];
    },
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-analyse', activeMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('tickets')
        .select('*')
        .gte('eingangsdatum', from)
        .lte('eingangsdatum', to);
      return data ?? [];
    },
  });

  // Stunden pro Mitarbeiter
  const empStats = employees.map((emp: any) => {
    const empWorklogs = worklogs.filter((w: any) => w.employee_id === emp.id);
    const stunden = empWorklogs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
    const ticketIds = new Set(empWorklogs.map((w: any) => w.ticket_id));
    return {
      name: emp.kuerzel,
      fullName: emp.name,
      stunden: Math.round(stunden * 100) / 100,
      tickets: ticketIds.size,
      gewerk: emp.gewerk,
    };
  }).filter((e: any) => e.stunden > 0).sort((a: any, b: any) => b.stunden - a.stunden);

  // Tickets pro Tag
  const tagStats: Record<string, number> = {};
  worklogs.forEach((w: any) => {
    if (w.leistungsdatum) {
      tagStats[w.leistungsdatum] = (tagStats[w.leistungsdatum] ?? 0) + Number(w.stunden ?? 0);
    }
  });
  const tagData = Object.entries(tagStats)
    .map(([datum, stunden]) => ({ datum: datum.slice(5), stunden: Math.round(Number(stunden) * 100) / 100 }))
    .sort((a, b) => a.datum.localeCompare(b.datum));

  // Gewerk-Vergleich
  const hochbauStunden = worklogs
    .filter((w: any) => w.employees?.gewerk === 'Hochbau')
    .reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const elektroStunden = worklogs
    .filter((w: any) => w.employees?.gewerk === 'Elektro')
    .reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);

  const totalStunden = empStats.reduce((s: any, e: any) => s + e.stunden, 0);
  const totalTickets = tickets.length;
  const erledigtTickets = tickets.filter((t: any) => ['erledigt','abrechenbar','abgerechnet'].includes(t.status)).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Mitarbeiter-Analyse – {monthName}</h2>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{totalStunden.toFixed(1)}h</p>
          <p className="text-xs text-muted-foreground mt-1">Stunden gesamt</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{empStats.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Aktive Mitarbeiter</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{totalTickets}</p>
          <p className="text-xs text-muted-foreground mt-1">Tickets im Monat</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold">{totalStunden > 0 && totalTickets > 0 ? (totalStunden / totalTickets).toFixed(1) : '–'}h</p>
          <p className="text-xs text-muted-foreground mt-1">Ø Std. pro Ticket</p>
        </CardContent></Card>
      </div>

      {/* Mitarbeiter Tabelle */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Mitarbeiter-Übersicht</CardTitle></CardHeader>
        <CardContent className="p-0">
          {empStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Keine Stundenbuchungen für {monthName}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground">Mitarbeiter</th>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground">Gewerk</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Stunden</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Tickets</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Ø Std/Ticket</th>
                  <th className="py-2 px-4 font-medium text-muted-foreground">Anteil</th>
                </tr>
              </thead>
              <tbody>
                {empStats.map((e: any) => (
                  <tr key={e.name} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-2 px-4">
                      <span className="font-mono font-bold mr-2">{e.name}</span>
                      <span className="text-muted-foreground">{e.fullName}</span>
                    </td>
                    <td className="py-2 px-4">{e.gewerk}</td>
                    <td className="py-2 px-4 text-right font-mono font-medium">{e.stunden}h</td>
                    <td className="py-2 px-4 text-right">{e.tickets}</td>
                    <td className="py-2 px-4 text-right font-mono">{e.tickets > 0 ? (e.stunden / e.tickets).toFixed(1) : '–'}h</td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2"
                            style={{ width: `${totalStunden > 0 ? (e.stunden / totalStunden * 100) : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right">
                          {totalStunden > 0 ? Math.round(e.stunden / totalStunden * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      {empStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Stunden pro Mitarbeiter</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={empStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => [`${v}h`, 'Stunden']} />
                  <Bar dataKey="stunden" fill="#1e3a5f" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Gewerk-Vergleich (Stunden)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4 py-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Hochbau</span>
                    <span className="font-mono">{hochbauStunden.toFixed(1)}h</span>
                  </div>
                  <div className="bg-muted rounded-full h-4">
                    <div className="bg-blue-600 rounded-full h-4" style={{ width: `${(hochbauStunden + elektroStunden) > 0 ? hochbauStunden / (hochbauStunden + elektroStunden) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Elektro</span>
                    <span className="font-mono">{elektroStunden.toFixed(1)}h</span>
                  </div>
                  <div className="bg-muted rounded-full h-4">
                    <div className="bg-orange-500 rounded-full h-4" style={{ width: `${(hochbauStunden + elektroStunden) > 0 ? elektroStunden / (hochbauStunden + elektroStunden) * 100 : 0}%` }} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tagData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Stunden pro Tag</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={tagData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="datum" />
                <YAxis />
                <Tooltip formatter={(v: any) => [`${v}h`, 'Stunden']} />
                <Line type="monotone" dataKey="stunden" stroke="#1e3a5f" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
