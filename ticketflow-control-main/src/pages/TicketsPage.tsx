import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMonth } from '@/contexts/MonthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Search, ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Clock } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'in_bearbeitung', label: 'In Bearbeitung' },
  { value: 'erledigt', label: 'Erledigt' },
  { value: 'zur_unterschrift', label: 'Zur Unterschrift' },
  { value: 'abrechenbar', label: 'Abrechenbar' },
  { value: 'abgerechnet', label: 'Abgerechnet' },
];

const STATUS_COLORS: Record<string, string> = {
  in_bearbeitung: 'bg-blue-100 text-blue-800',
  erledigt: 'bg-green-100 text-green-800',
  zur_unterschrift: 'bg-yellow-100 text-yellow-800',
  abrechenbar: 'bg-orange-100 text-orange-800',
  abgerechnet: 'bg-gray-100 text-gray-700',
};

const PAGE_SIZE = 50;

export default function TicketsPage() {
  const { user } = useAuth();
  const { activeMonth } = useMonth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gewerkFilter, setGewerkFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [monthFilter, setMonthFilter] = useState<'all' | 'month'>('month');

  const { data, isLoading } = useQuery({
    queryKey: ['tickets-list', search, statusFilter, gewerkFilter, page, activeMonth, monthFilter],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select('*', { count: 'exact' })
        .order('eingangsdatum', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) query = query.ilike('a_nummer', `%${search}%`);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (gewerkFilter !== 'all') query = query.eq('gewerk', gewerkFilter);

      if (monthFilter === 'month') {
        const [year, month] = activeMonth.split('-');
        const from = `${year}-${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        const to = `${year}-${month}-${String(lastDay).padStart(2,'0')}`;
        query = query.gte('eingangsdatum', from).lte('eingangsdatum', to);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      return { tickets: data ?? [], total: count ?? 0 };
    },
  });

  const tickets = data?.tickets ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('tickets').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_: any, ids: string[]) => {
      toast.success(`${ids.length} Ticket(s) gelöscht`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const allSelected = tickets.length > 0 && tickets.every((t: any) => selected.has(t.id));
  const toggleAll = () => allSelected ? setSelected(new Set()) : setSelected(new Set(tickets.map((t: any) => t.id)));
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="A-Nummer suchen..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={monthFilter} onValueChange={(v: any) => { setMonthFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Monat: {activeMonth}</SelectItem>
            <SelectItem value="all">Alle Monate</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={gewerkFilter} onValueChange={v => { setGewerkFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Gewerk" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="Hochbau">Hochbau</SelectItem>
            <SelectItem value="Elektro">Elektro</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{totalCount} Tickets</span>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" onClick={() => { if (confirm(`${selected.size} Ticket(s) löschen?`)) deleteMutation.mutate(Array.from(selected)); }} disabled={deleteMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-1" />{selected.size} löschen
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="py-3 px-3 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">A-Nummer</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Gewerk</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Eingangsdatum</th>
                  <th className="py-3 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Lädt...</td></tr>}
                {tickets.map((t: any) => (
                  <tr key={t.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${selected.has(t.id) ? 'bg-muted/20' : ''}`}>
                    <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} />
                    </td>
                    <td className="py-3 px-4 font-mono font-medium cursor-pointer" onClick={() => setSelectedTicket(t)}>{t.a_nummer}</td>
                    <td className="py-3 px-4 cursor-pointer" onClick={() => setSelectedTicket(t)}>{t.gewerk}</td>
                    <td className="py-3 px-4 cursor-pointer" onClick={() => setSelectedTicket(t)}>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[t.status] ?? ''}`}>
                        {STATUS_OPTIONS.find(s => s.value === t.status)?.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 cursor-pointer" onClick={() => setSelectedTicket(t)}>
                      {t.eingangsdatum ? new Date(t.eingangsdatum).toLocaleDateString('de-DE') : '–'}
                    </td>
                    <td className="py-3 px-4">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setSelectedTicket(t); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && !isLoading && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">
                    {monthFilter === 'month' ? `Keine Tickets für ${activeMonth}` : 'Keine Tickets gefunden'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">Seite {page + 1} von {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      {selectedTicket && <TicketDetail ticket={selectedTicket} onClose={() => setSelectedTicket(null)} userId={user?.id} />}
    </div>
  );
}

function TicketDetail({ ticket, onClose, userId }: { ticket: any; onClose: () => void; userId?: string }) {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');
  const [showStunden, setShowStunden] = useState(false);
  const [stundenForm, setStundenForm] = useState({ employee_id: '', stunden: '', leistungsdatum: new Date().toISOString().split('T')[0] });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name');
      return data ?? [];
    },
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['ticket-notes', ticket.id],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_notes').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const { data: worklogs = [], refetch: refetchWorklogs } = useQuery({
    queryKey: ['ticket-worklogs', ticket.id],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs').select('*, employees(name, kuerzel)').eq('ticket_id', ticket.id).order('leistungsdatum', { ascending: false });
      return data ?? [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      await supabase.from('status_history').insert({ ticket_id: ticket.id, old_status: ticket.status, new_status: newStatus, changed_by: userId });
      const { error } = await supabase.from('tickets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', ticket.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Status aktualisiert');
      onClose();
    },
  });

  const deleteTicket = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tickets').delete().eq('id', ticket.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Ticket gelöscht');
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      onClose();
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!newNote.trim()) return;
      await supabase.from('ticket_notes').insert({ ticket_id: ticket.id, note: newNote.trim(), created_by: userId });
    },
    onSuccess: () => {
      setNewNote('');
      queryClient.invalidateQueries({ queryKey: ['ticket-notes', ticket.id] });
      toast.success('Notiz hinzugefügt');
    },
  });

  const addStunden = useMutation({
    mutationFn: async () => {
      if (!stundenForm.employee_id || !stundenForm.stunden) throw new Error('Mitarbeiter und Stunden erforderlich');
      const stunden = parseFloat(stundenForm.stunden.replace(',', '.'));
      if (isNaN(stunden) || stunden <= 0) throw new Error('Ungültige Stundenzahl');
      const { error } = await supabase.from('ticket_worklogs').insert({
        ticket_id: ticket.id,
        employee_id: stundenForm.employee_id,
        stunden,
        leistungsdatum: stundenForm.leistungsdatum,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Stunden eingetragen');
      setStundenForm({ employee_id: '', stunden: '', leistungsdatum: new Date().toISOString().split('T')[0] });
      setShowStunden(false);
      refetchWorklogs();
      queryClient.invalidateQueries({ queryKey: ['worklogs-analyse'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalHours = worklogs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg">{ticket.a_nummer}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-4">
            <div><span className="text-muted-foreground">Gewerk:</span> <strong>{ticket.gewerk}</strong></div>
            <div><span className="text-muted-foreground">Eingangsdatum:</span> <strong>{ticket.eingangsdatum ? new Date(ticket.eingangsdatum).toLocaleDateString('de-DE') : '–'}</strong></div>
            <div><span className="text-muted-foreground">Stunden gesamt:</span> <strong>{totalHours}h</strong></div>
            <div>
              <span className="text-muted-foreground">Status: </span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[ticket.status] ?? ''}`}>
                {STATUS_OPTIONS.find(s => s.value === ticket.status)?.label}
              </span>
            </div>
          </div>

          {/* Status ändern */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Status ändern</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.filter(s => s.value !== ticket.status).map(s => (
                <Button key={s.value} variant="outline" size="sm" onClick={() => updateStatus.mutate(s.value)} disabled={updateStatus.isPending} className="text-xs">
                  → {s.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Stunden eintragen */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" />Stundenbuchungen ({totalHours}h)</h4>
              <Button size="sm" variant="outline" onClick={() => setShowStunden(!showStunden)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Stunden eintragen
              </Button>
            </div>

            {showStunden && (
              <div className="grid grid-cols-3 gap-2 bg-muted/30 rounded p-3">
                <div>
                  <Label className="text-xs">Mitarbeiter</Label>
                  <Select value={stundenForm.employee_id} onValueChange={v => setStundenForm(f => ({ ...f, employee_id: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>{e.kuerzel} – {e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Stunden</Label>
                  <Input className="h-8 text-xs" placeholder="1.5" value={stundenForm.stunden} onChange={e => setStundenForm(f => ({ ...f, stunden: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Datum</Label>
                  <Input type="date" className="h-8 text-xs" value={stundenForm.leistungsdatum} onChange={e => setStundenForm(f => ({ ...f, leistungsdatum: e.target.value }))} />
                </div>
                <Button size="sm" className="col-span-3" onClick={() => addStunden.mutate()} disabled={addStunden.isPending}>
                  Speichern
                </Button>
              </div>
            )}

            {worklogs.length > 0 && (
              <div className="space-y-1">
                {worklogs.map((w: any) => (
                  <div key={w.id} className="flex justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                    <span><strong>{w.employees?.kuerzel}</strong> – {w.employees?.name}</span>
                    <span className="font-mono">{w.stunden}h · {w.leistungsdatum ? new Date(w.leistungsdatum).toLocaleDateString('de-DE') : '–'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notizen */}
          <div>
            <h4 className="text-sm font-medium mb-2">Notizen</h4>
            <div className="flex gap-2">
              <Input placeholder="Notiz hinzufügen..." value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote.mutate()} />
              <Button size="sm" onClick={() => addNote.mutate()}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="mt-2 space-y-1">
              {notes.map((n: any) => (
                <div key={n.id} className="text-sm bg-muted/50 rounded px-3 py-1.5">
                  <p>{n.note}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString('de-DE')}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Löschen */}
          <div className="pt-2 border-t">
            <Button variant="destructive" size="sm" onClick={() => { if (confirm('Ticket wirklich löschen?')) deleteTicket.mutate(); }} disabled={deleteTicket.isPending}>
              <Trash2 className="h-4 w-4 mr-1" />Ticket löschen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
