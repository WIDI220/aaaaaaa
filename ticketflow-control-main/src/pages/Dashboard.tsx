import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Ticket, Clock, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'in_bearbeitung', label: 'In Bearbeitung', color: 'bg-blue-100 text-blue-800' },
  { value: 'erledigt', label: 'Erledigt', color: 'bg-green-100 text-green-800' },
  { value: 'zur_unterschrift', label: 'Zur Unterschrift', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'abrechenbar', label: 'Abrechenbar', color: 'bg-orange-100 text-orange-800' },
  { value: 'abgerechnet', label: 'Abgerechnet', color: 'bg-gray-100 text-gray-700' },
];

const PIE_COLORS = ['#1e3a5f', '#0ea5e9', '#f97316', '#8b5cf6', '#22c55e'];

export default function Dashboard() {
  const { activeMonth } = useMonth();
  const [year, month] = activeMonth.split('-');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;

  const monthName = new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  // Tickets dieses Monats
  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets', activeMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('tickets')
        .select('*')
        .gte('eingangsdatum', from)
        .lte('eingangsdatum', to);
      return data ?? [];
    },
  });

  // Alle Tickets (für Gesamtübersicht)
  const { data: allTickets = [] } = useQuery({
    queryKey: ['tickets-all'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('status, gewerk');
      return data ?? [];
    },
  });

  const { data: worklogs = [] } = useQuery({
    queryKey: ['worklogs', activeMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('ticket_worklogs')
        .select('*, employees(name, gewerk)')
        .gte('leistungsdatum', from)
        .lte('leistungsdatum', to);
      return data ?? [];
    },
  });

  const totalTickets = tickets.length;
  const totalHours = worklogs.reduce((sum: number, w: any) => sum + Number(w.stunden ?? 0), 0);
  const openTickets = tickets.filter((t: any) => t.status === 'in_bearbeitung').length;
  const doneTickets = tickets.filter((t: any) => t.status === 'abgerechnet').length;

  const hochbauCount = tickets.filter((t: any) => t.gewerk === 'Hochbau').length;
  const elektroCount = tickets.filter((t: any) => t.gewerk === 'Elektro').length;

  const statusData = STATUS_OPTIONS.map(s => ({
    name: s.label,
    value: tickets.filter((t: any) => t.status === s.value).length,
  })).filter(d => d.value > 0);

  const gewerkData = [
    { name: 'Hochbau', tickets: hochbauCount },
    { name: 'Elektro', tickets: elektroCount },
  ];

  const empHours = new Map<string, number>();
  worklogs.forEach((w: any) => {
    const name = w.employees?.name ?? 'Unbekannt';
    empHours.set(name, (empHours.get(name) ?? 0) + Number(w.stunden ?? 0));
  });
  const employeeData = Array.from(empHours.entries())
    .map(([name, stunden]) => ({ name, stunden: Math.round(stunden * 10) / 10 }))
    .sort((a, b) => b.stunden - a.stunden)
    .slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Monatsheader */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{monthName}</h2>
        <span className="text-sm text-muted-foreground">Alle Zahlen beziehen sich auf den gewählten Monat</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Ticket} label="Tickets im Monat" value={totalTickets} color="text-primary" />
        <KpiCard icon={Clock} label="Stunden (Monat)" value={`${totalHours.toFixed(1)}h`} color="text-sky-600" />
        <KpiCard icon={AlertCircle} label="In Bearbeitung" value={openTickets} color="text-destructive" />
        <KpiCard icon={CheckCircle} label="Abgerechnet" value={doneTickets} color="text-green-600" />
      </div>

      {/* Status-Übersicht Monat */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {STATUS_OPTIONS.map(s => {
          const count = tickets.filter((t: any) => t.status === s.value).length;
          const pct = totalTickets ? Math.round((count / totalTickets) * 100) : 0;
          return (
            <div key={s.value} className={`${s.color} flex flex-col items-center py-3 px-2 rounded-lg`}>
              <span className="text-2xl font-bold">{count}</span>
              <span className="text-xs mt-1 text-center leading-tight">{s.label}</span>
              <span className="text-xs opacity-70">{pct}%</span>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Gewerk-Vergleich ({monthName})</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gewerkData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="tickets" fill="#1e3a5f" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Status-Verteilung ({monthName})</CardTitle></CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${value}`}>
                    {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Keine Daten für {monthName}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mitarbeiter Stunden */}
      {employeeData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Mitarbeiter-Stunden {monthName}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-muted-foreground">Mitarbeiter</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Stunden</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeData.map(e => (
                    <tr key={e.name} className="border-b last:border-0">
                      <td className="py-2">{e.name}</td>
                      <td className="py-2 text-right font-mono">{e.stunden}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gesamtübersicht alle Monate */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Gesamtbestand (alle Monate)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {STATUS_OPTIONS.map(s => {
              const count = allTickets.filter((t: any) => t.status === s.value).length;
              return (
                <div key={s.value} className={`${s.color} flex flex-col items-center py-2 px-2 rounded-lg`}>
                  <span className="text-xl font-bold">{count}</span>
                  <span className="text-xs mt-1 text-center leading-tight">{s.label}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Gesamt: {allTickets.length} Tickets in der Datenbank</p>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`p-2 rounded-lg bg-secondary ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
