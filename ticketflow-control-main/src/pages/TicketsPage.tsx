// WIDI Ticketsystem v2.1 - EmailJS
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMonth } from '@/contexts/MonthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Search, ChevronLeft, ChevronRight, Trash2, Pencil, Clock, Plus, AlertTriangle, Mail } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'in_bearbeitung', label: 'In Bearbeitung', bg: 'bg-blue-100', text: 'text-blue-700' },
  { value: 'erledigt', label: 'Erledigt', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { value: 'zur_unterschrift', label: 'Zur Unterschrift', bg: 'bg-amber-100', text: 'text-amber-700' },
  { value: 'abrechenbar', label: 'Abrechenbar', bg: 'bg-orange-100', text: 'text-orange-700' },
  { value: 'abgerechnet', label: 'Abgerechnet', bg: 'bg-gray-100', text: 'text-gray-600' },
];

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
  const [monthFilter, setMonthFilter] = useState<'month'|'all'>('month');
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailNote, setEmailNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tickets-list', search, statusFilter, gewerkFilter, page, activeMonth, monthFilter],
    queryFn: async () => {
      let query = supabase.from('tickets')
        .select('*, ticket_worklogs(stunden, employees(name, kuerzel))', { count: 'exact' })
        .order('eingangsdatum', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (search) query = query.ilike('a_nummer', `%${search}%`);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (gewerkFilter !== 'all') query = query.eq('gewerk', gewerkFilter);
      if (monthFilter === 'month') {
        const [y, m] = activeMonth.split('-');
        const from = `${y}-${m}-01`;
        const to = `${y}-${m}-${String(new Date(parseInt(y), parseInt(m), 0).getDate()).padStart(2,'0')}`;
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
    mutationFn: async (ids: string[]) => { const { error } = await supabase.from('tickets').delete().in('id', ids); if (error) throw error; },
    onSuccess: (_: any, ids: string[]) => { toast.success(`${ids.length} Ticket(s) gelöscht`); setSelected(new Set()); queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000'); if (error) throw error; },
    onSuccess: () => { toast.success('Alle Tickets gelöscht'); setShowDeleteAll(false); queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const allSelected = tickets.length > 0 && tickets.every((t: any) => selected.has(t.id));
  const toggleAll = () => allSelected ? setSelected(new Set()) : setSelected(new Set(tickets.map((t: any) => t.id)));
  const toggleOne = (id: string) => { const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next); };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tickets</h1>
        <p className="text-sm text-gray-500 mt-0.5">{totalCount} Tickets gefunden</p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="A-Nummer suchen..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9 h-9 border-gray-200 rounded-xl" />
        </div>
        <Select value={monthFilter} onValueChange={(v: any) => { setMonthFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px] h-9 rounded-xl border-gray-200"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="month">Monat: {activeMonth}</SelectItem><SelectItem value="all">Alle Monate</SelectItem></SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-9 rounded-xl border-gray-200"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle Status</SelectItem>{STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={gewerkFilter} onValueChange={v => { setGewerkFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[120px] h-9 rounded-xl border-gray-200"><SelectValue placeholder="Gewerk" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle</SelectItem><SelectItem value="Hochbau">Hochbau</SelectItem><SelectItem value="Elektro">Elektro</SelectItem></SelectContent>
        </Select>
        {selected.size > 0 && (<>
          <Button variant="outline" size="sm" className="h-9 rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"
            onClick={() => { setEmailSubject(`Rückmeldung zu ${selected.size} Ticket(s)`); setShowEmail(true); }}>
            <Mail className="h-4 w-4 mr-1" />{selected.size} per E-Mail
          </Button>
          <Button variant="destructive" size="sm" className="h-9 rounded-xl"
            onClick={() => { if (confirm(`${selected.size} löschen?`)) deleteMutation.mutate(Array.from(selected)); }}
            disabled={deleteMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-1" />{selected.size} löschen
          </Button>
        </>)}
        <Button variant="outline" size="sm" className="h-9 rounded-xl text-red-500 border-red-200 hover:bg-red-50 ml-auto"
          onClick={() => setShowDeleteAll(true)}>
          <Trash2 className="h-4 w-4 mr-1" />Alle löschen
        </Button>
      </div>

      {/* Tabelle */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="py-3 px-4 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">A-Nummer</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">Gewerk</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">Eingang</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">Mitarbeiter</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500 text-xs uppercase tracking-wide">Stunden</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={8} className="py-12 text-center text-gray-400">Lädt...</td></tr>}
              {tickets.map((t: any) => {
                const wl = t.ticket_worklogs ?? [];
                const totalH = wl.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
                const ma = [...new Set(wl.map((w: any) => w.employees?.kuerzel).filter(Boolean))].join(', ');
                const st = STATUS_OPTIONS.find(s => s.value === t.status);
                return (
                  <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50/70 cursor-pointer transition-colors ${selected.has(t.id) ? 'bg-blue-50/40' : ''}`}
                    onClick={() => setSelectedTicket(t)}>
                    <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleOne(t.id)} />
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-gray-800">{t.a_nummer}</td>
                    <td className="py-3 px-4 text-gray-500">{t.gewerk}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st?.bg} ${st?.text}`}>{st?.label}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{t.eingangsdatum ? new Date(t.eingangsdatum).toLocaleDateString('de-DE') : '–'}</td>
                    <td className="py-3 px-4">{ma ? <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded-lg text-gray-600">{ma}</span> : <span className="text-gray-300">–</span>}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-gray-700">{totalH > 0 ? `${totalH}h` : <span className="text-gray-300">–</span>}</td>
                    <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600" onClick={() => setSelectedTicket(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {tickets.length === 0 && !isLoading && (
                <tr><td colSpan={8} className="py-12 text-center text-gray-400">Keine Tickets gefunden</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-sm text-gray-500 px-2">Seite {page + 1} von {totalPages}</span>
          <button className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      )}

      {/* Alle löschen Dialog */}
      <Dialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" />Alle Tickets löschen?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-500">Diese Aktion löscht alle Tickets unwiderruflich!</p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowDeleteAll(false)}>Abbrechen</Button>
            <Button variant="destructive" className="flex-1" onClick={() => deleteAllMutation.mutate()} disabled={deleteAllMutation.isPending}>
              {deleteAllMutation.isPending ? 'Löscht...' : 'Ja, alle löschen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* E-Mail Rückmeldung Dialog */}
      <Dialog open={showEmail} onOpenChange={setShowEmail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-blue-500" />Rückmeldung per E-Mail</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Empfänger E-Mail</Label>
              <Input placeholder="empfaenger@beispiel.de" value={emailTo} onChange={e => setEmailTo(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Betreff</Label>
              <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Begründung / Anliegen</Label>
              <Textarea placeholder="Beschreiben Sie Ihr Anliegen zu den markierten Tickets..." value={emailNote} onChange={e => setEmailNote(e.target.value)} className="rounded-xl min-h-[100px]" />
            </div>
            {/* Ticket Vorschau */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">Markierte Tickets ({selected.size}):</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {tickets.filter((t: any) => selected.has(t.id)).map((t: any) => {
                  const st = STATUS_OPTIONS.find(s => s.value === t.status);
                  return (
                    <div key={t.id} className="flex items-center gap-2 text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <span className="font-mono font-bold text-[#1e3a5f]">{t.a_nummer}</span>
                      <span className="text-gray-400">{t.gewerk}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st?.bg} ${st?.text}`}>{st?.label}</span>
                      {t.eingangsdatum && <span className="text-gray-400 ml-auto">{new Date(t.eingangsdatum).toLocaleDateString('de-DE')}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowEmail(false)}>Abbrechen</Button>
              <Button className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700" onClick={() => {
                setSendingEmail(true);
                try {
                  const STATUS_LABELS: Record<string,string> = {
                    'in_bearbeitung':'In Bearbeitung','erledigt':'Erledigt',
                    'zur_unterschrift':'Zur Unterschrift','abrechenbar':'Abrechenbar','abgerechnet':'Abgerechnet'
                  };
                  const selectedTickets = tickets.filter((t: any) => selected.has(t.id));
                  const ticketLines = selectedTickets.map((t: any) =>
                    `• ${t.a_nummer} | ${t.gewerk ?? '–'} | ${STATUS_LABELS[t.status] ?? t.status} | Eingang: ${t.eingangsdatum ? new Date(t.eingangsdatum).toLocaleDateString('de-DE') : '–'}`
                  ).join('\n');
                  const content = `${emailNote ? 'Anliegen:\n' + emailNote + '\n\n' : ''}Betroffene Tickets (${selectedTickets.length}):\n${ticketLines}\n\n---\nGesendet von WIDI Controlling System\n${new Date().toLocaleDateString('de-DE')}`;
                  emailjs.init('y7g5YcPgorv_NmH0y');
                  await emailjs.send('service_bhia75n', 'template_s043jzj', {
                    to_email: emailTo,
                    to_name: emailTo,
                    subject: emailSubject,
                    content,
                  });
                  setEmailSent(true);
                  toast.success('E-Mail erfolgreich gesendet!');
                  setTimeout(() => { setShowEmail(false); setEmailSent(false); setEmailTo(''); setEmailNote(''); setEmailSubject(''); }, 2000);
                } catch (e: any) {
                  toast.error('E-Mail Fehler: ' + (e?.text ?? e?.message ?? 'Unbekannt'));
                } finally { setSendingEmail(false); }
              }}>
                <><Mail className="h-4 w-4 mr-1" />E-Mail öffnen</>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          onClose={() => { setSelectedTicket(null); queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); }}
          userId={user?.id}
        />
      )}
    </div>
  );
}

function TicketDetail({ ticket, onClose, userId }: { ticket: any; onClose: () => void; userId?: string }) {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');
  const [showStunden, setShowStunden] = useState(false);
  const [stundenForm, setStundenForm] = useState({ employee_id: '', stunden: '', leistungsdatum: new Date().toISOString().split('T')[0] });

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name'); return data ?? []; } });
  const { data: notes = [] } = useQuery({ queryKey: ['ticket-notes', ticket.id], queryFn: async () => { const { data } = await supabase.from('ticket_notes').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: false }); return data ?? []; } });
  const { data: worklogs = [], refetch: refetchWorklogs } = useQuery({ queryKey: ['ticket-worklogs', ticket.id], queryFn: async () => { const { data } = await supabase.from('ticket_worklogs').select('*, employees(name, kuerzel)').eq('ticket_id', ticket.id).order('leistungsdatum', { ascending: false }); return data ?? []; } });

  const totalHours = worklogs.reduce((s: number, w: any) => s + Number(w.stunden ?? 0), 0);
  const st = STATUS_OPTIONS.find(s => s.value === ticket.status);

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      await supabase.from('status_history').insert({ ticket_id: ticket.id, old_status: ticket.status, new_status: newStatus, changed_by: userId });
      const { error } = await supabase.from('tickets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', ticket.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); toast.success('Status aktualisiert'); onClose(); },
  });

  const deleteTicket = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('tickets').delete().eq('id', ticket.id); if (error) throw error; },
    onSuccess: () => { toast.success('Ticket gelöscht'); queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); onClose(); },
  });

  const addNote = useMutation({
    mutationFn: async () => { if (!newNote.trim()) return; await supabase.from('ticket_notes').insert({ ticket_id: ticket.id, note: newNote.trim(), created_by: userId }); },
    onSuccess: () => { setNewNote(''); queryClient.invalidateQueries({ queryKey: ['ticket-notes', ticket.id] }); },
  });

  const addStunden = useMutation({
    mutationFn: async () => {
      if (!stundenForm.employee_id || !stundenForm.stunden) throw new Error('Mitarbeiter und Stunden erforderlich');
      const stunden = parseFloat(stundenForm.stunden.replace(',', '.'));
      if (isNaN(stunden) || stunden <= 0) throw new Error('Ungültige Stunden');
      const { error } = await supabase.from('ticket_worklogs').insert({ ticket_id: ticket.id, employee_id: stundenForm.employee_id, stunden, leistungsdatum: stundenForm.leistungsdatum });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Stunden eingetragen'); setStundenForm({ employee_id: '', stunden: '', leistungsdatum: new Date().toISOString().split('T')[0] }); setShowStunden(false); refetchWorklogs(); queryClient.invalidateQueries({ queryKey: ['tickets-list'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-lg flex items-center gap-3">
            {ticket.a_nummer}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st?.bg} ${st?.text}`}>{st?.label}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-4 text-sm">
            <div><span className="text-gray-400">Gewerk:</span> <strong className="text-gray-700">{ticket.gewerk}</strong></div>
            <div><span className="text-gray-400">Eingang:</span> <strong className="text-gray-700">{ticket.eingangsdatum ? new Date(ticket.eingangsdatum).toLocaleDateString('de-DE') : '–'}</strong></div>
            <div><span className="text-gray-400">Stunden:</span> <strong className="text-[#1e3a5f]">{totalHours}h</strong></div>
            <div><span className="text-gray-400">Mitarbeiter:</span> <strong className="text-gray-700">{[...new Set((worklogs as any[]).map((w: any) => w.employees?.name).filter(Boolean))].join(', ') || '–'}</strong></div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs text-gray-400 mb-2 block uppercase tracking-wide">Status ändern</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.filter(s => s.value !== ticket.status).map(s => (
                <button key={s.value} onClick={() => updateStatus.mutate(s.value)} disabled={updateStatus.isPending}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium border transition-all ${s.bg} ${s.text} border-transparent hover:opacity-80`}>
                  → {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stunden */}
          <div className="border border-gray-100 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Clock className="h-4 w-4" />Stunden ({totalHours}h)</h4>
              <button onClick={() => setShowStunden(!showStunden)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium text-gray-600 transition-colors">
                <Plus className="h-3.5 w-3.5" />Eintragen
              </button>
            </div>
            {showStunden && (
              <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-xl p-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Mitarbeiter</Label>
                  <Select value={stundenForm.employee_id} onValueChange={v => setStundenForm(f => ({ ...f, employee_id: v }))}>
                    <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>{(employees as any[]).map((e: any) => <SelectItem key={e.id} value={e.id}>{e.kuerzel} – {e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Stunden</Label>
                  <Input className="h-8 text-xs rounded-lg" placeholder="1.5" value={stundenForm.stunden} onChange={e => setStundenForm(f => ({ ...f, stunden: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Datum</Label>
                  <Input type="date" className="h-8 text-xs rounded-lg" value={stundenForm.leistungsdatum} onChange={e => setStundenForm(f => ({ ...f, leistungsdatum: e.target.value }))} />
                </div>
                <Button size="sm" className="col-span-3 rounded-xl" onClick={() => addStunden.mutate()} disabled={addStunden.isPending}>Speichern</Button>
              </div>
            )}
            {(worklogs as any[]).length > 0 && (
              <div className="space-y-1">
                {(worklogs as any[]).map((w: any) => (
                  <div key={w.id} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <span><strong className="font-mono text-gray-700">{w.employees?.kuerzel}</strong> <span className="text-gray-500">– {w.employees?.name}</span></span>
                    <span className="font-mono text-gray-600">{w.stunden}h · {w.leistungsdatum ? new Date(w.leistungsdatum).toLocaleDateString('de-DE') : '–'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notizen */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Notizen</h4>
            <div className="flex gap-2">
              <Input placeholder="Notiz hinzufügen..." value={newNote} onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote.mutate()} className="h-9 text-sm rounded-xl" />
              <Button size="sm" className="h-9 rounded-xl" onClick={() => addNote.mutate()}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="mt-2 space-y-1">
              {(notes as any[]).map((n: any) => (
                <div key={n.id} className="text-sm bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-gray-700">{n.note}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(n.created_at).toLocaleString('de-DE')}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Löschen */}
          <div className="pt-2 border-t border-gray-100">
            <Button variant="destructive" size="sm" className="rounded-xl"
              onClick={() => { if (confirm('Ticket löschen?')) deleteTicket.mutate(); }}
              disabled={deleteTicket.isPending}>
              <Trash2 className="h-4 w-4 mr-1" />Ticket löschen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
