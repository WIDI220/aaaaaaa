import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Settings, Trash2, AlertTriangle } from 'lucide-react';

// Hilfsfunktionen
function getKW(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(kw).padStart(2, '0')}`;
}

function kwLabel(periode: string): string {
  const [year, week] = periode.replace('W', '').split('-W');
  return `KW ${week} / ${year}`;
}

function monatLabel(periode: string): string {
  const [year, month] = periode.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
}

function getMonatPeriode(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function prevPeriode(periode: string, intervall: string): string {
  if (intervall === 'wöchentlich') {
    const [year, week] = periode.replace('W', '').split('-W').map(Number);
    const d = new Date(year, 0, 1 + (week - 1) * 7);
    d.setDate(d.getDate() - 7);
    return getKW(d);
  } else {
    const [year, month] = periode.split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    return getMonatPeriode(d);
  }
}

function nextPeriode(periode: string, intervall: string): string {
  if (intervall === 'wöchentlich') {
    const [year, week] = periode.replace('W', '').split('-W').map(Number);
    const d = new Date(year, 0, 1 + (week - 1) * 7);
    d.setDate(d.getDate() + 7);
    return getKW(d);
  } else {
    const [year, month] = periode.split('-').map(Number);
    const d = new Date(year, month, 1);
    return getMonatPeriode(d);
  }
}

function isCurrentPeriode(periode: string, intervall: string): boolean {
  const now = new Date();
  return intervall === 'wöchentlich' ? periode === getKW(now) : periode === getMonatPeriode(now);
}

export default function AufgabenPage() {
  const [tab, setTab] = useState<'woechentlich' | 'monatlich'>('woechentlich');
  const [showAdmin, setShowAdmin] = useState(false);
  const [periodeW, setPeriodeW] = useState(getKW(new Date()));
  const [periodeM, setPeriodeM] = useState(getMonatPeriode(new Date()));

  const periode = tab === 'woechentlich' ? periodeW : periodeM;
  const setPeriode = tab === 'woechentlich' ? setPeriodeW : setPeriodeM;
  const intervall = tab === 'woechentlich' ? 'wöchentlich' : 'monatlich';
  const periodeLabel = tab === 'woechentlich' ? kwLabel(periode) : monatLabel(periode);

  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').eq('aktiv', true).order('name'); return data ?? []; },
  });

  const { data: pruefpunkte = [] } = useQuery({
    queryKey: ['pruefpunkte', intervall],
    queryFn: async () => {
      const { data } = await supabase.from('pruefpunkte').select('*').eq('intervall', intervall).eq('aktiv', true).order('kategorie').order('name');
      return data ?? [];
    },
  });

  const { data: begehung, refetch: refetchBegehung } = useQuery({
    queryKey: ['begehung', intervall, periode],
    queryFn: async () => {
      const { data } = await supabase.from('begehungen').select('*, begehung_ergebnisse(*, pruefpunkte(*), employees(name,kuerzel))').eq('intervall', intervall).eq('periode', periode).maybeSingle();
      return data;
    },
  });

  const startBegehung = useMutation({
    mutationFn: async () => {
      // Begehung erstellen
      const { data: b, error: bErr } = await supabase.from('begehungen').insert({ intervall, periode }).select().single();
      if (bErr) throw bErr;
      // Alle Prüfpunkte als Ergebnisse anlegen
      const ergebnisse = (pruefpunkte as any[]).map((p: any) => ({ begehung_id: b.id, pruefpunkt_id: p.id, status: 'offen' }));
      if (ergebnisse.length > 0) await supabase.from('begehung_ergebnisse').insert(ergebnisse);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['begehung'] }); refetchBegehung(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateErgebnis = useMutation({
    mutationFn: async ({ id, status, notiz, geprueft_von }: { id: string; status: string; notiz?: string; geprueft_von?: string }) => {
      const { error } = await supabase.from('begehung_ergebnisse').update({
        status, notiz: notiz ?? null,
        geprueft_von: geprueft_von ?? null,
        geprueft_am: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['begehung'] }); refetchBegehung(); },
  });

  const abschliessen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('begehungen').update({ abgeschlossen: true, abgeschlossen_am: new Date().toISOString() }).eq('id', (begehung as any).id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Begehung abgeschlossen!'); queryClient.invalidateQueries({ queryKey: ['begehung'] }); refetchBegehung(); },
  });

  const ergebnisse = (begehung as any)?.begehung_ergebnisse ?? [];
  const kategorien = [...new Set((pruefpunkte as any[]).map((p: any) => p.kategorie ?? 'Allgemein'))];
  const offenCount = ergebnisse.filter((e: any) => e.status === 'offen').length;
  const nioCount = ergebnisse.filter((e: any) => e.status === 'nio').length;
  const ioCount = ergebnisse.filter((e: any) => e.status === 'io').length;
  const isCurrent = isCurrentPeriode(periode, intervall);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Begehungen & Aufgaben</h1>
          <p className="text-sm text-gray-500 mt-0.5">Wiederkehrende Prüfungen und Checklisten</p>
        </div>
        <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={() => setShowAdmin(true)}>
          <Settings className="h-4 w-4 mr-1" />Prüfpunkte verwalten
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['woechentlich', 'monatlich'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'woechentlich' ? '🗓 Wöchentlich' : '📅 Monatlich'}
          </button>
        ))}
      </div>

      {/* Perioden-Navigation */}
      <div className="flex items-center gap-3">
        <button onClick={() => setPeriode(prevPeriode(periode, intervall))} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <div className="text-center">
          <p className="font-bold text-gray-900">{periodeLabel}</p>
          {isCurrent && <p className="text-xs text-blue-500 font-medium">Aktuell</p>}
        </div>
        <button onClick={() => setPeriode(nextPeriode(periode, intervall))} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      {/* Noch keine Prüfpunkte */}
      {pruefpunkte.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-gray-400 text-sm">Noch keine Prüfpunkte angelegt.</p>
          <Button className="mt-4 rounded-xl" onClick={() => setShowAdmin(true)}><Plus className="h-4 w-4 mr-1" />Prüfpunkte anlegen</Button>
        </div>
      )}

      {/* Begehung noch nicht gestartet */}
      {pruefpunkte.length > 0 && !begehung && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="h-7 w-7 text-blue-400" />
          </div>
          <p className="font-semibold text-gray-700 mb-1">Begehung noch nicht gestartet</p>
          <p className="text-sm text-gray-400 mb-6">{periodeLabel} · {(pruefpunkte as any[]).length} Prüfpunkte</p>
          {isCurrent && (
            <Button className="rounded-xl bg-[#1e3a5f] hover:bg-[#162d4a]" onClick={() => startBegehung.mutate()} disabled={startBegehung.isPending}>
              {startBegehung.isPending ? 'Startet...' : 'Begehung starten'}
            </Button>
          )}
          {!isCurrent && <p className="text-sm text-gray-300">Diese Periode liegt in der Vergangenheit</p>}
        </div>
      )}

      {/* Begehung aktiv */}
      {begehung && (
        <div className="space-y-4">
          {/* Status Bar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
            <div className="flex gap-4 flex-1">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-300">{offenCount}</p>
                <p className="text-xs text-gray-400">Offen</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-500">{ioCount}</p>
                <p className="text-xs text-gray-400">i.O.</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{nioCount}</p>
                <p className="text-xs text-gray-400">n.i.O.</p>
              </div>
              <div className="flex-1">
                <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-100 mt-2">
                  <div className="bg-emerald-400 rounded-full transition-all" style={{ width: `${ergebnisse.length > 0 ? ioCount/ergebnisse.length*100 : 0}%` }} />
                  <div className="bg-red-400 rounded-full transition-all" style={{ width: `${ergebnisse.length > 0 ? nioCount/ergebnisse.length*100 : 0}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{ergebnisse.length > 0 ? Math.round((ioCount+nioCount)/ergebnisse.length*100) : 0}% bearbeitet</p>
              </div>
            </div>
            {!(begehung as any).abgeschlossen && offenCount === 0 && (
              <Button className="rounded-xl bg-emerald-500 hover:bg-emerald-600" onClick={() => abschliessen.mutate()}>
                <CheckCircle className="h-4 w-4 mr-1" />Abschließen
              </Button>
            )}
            {(begehung as any).abgeschlossen && (
              <span className="flex items-center gap-1.5 text-emerald-600 font-medium text-sm bg-emerald-50 px-3 py-1.5 rounded-xl">
                <CheckCircle className="h-4 w-4" />Abgeschlossen
              </span>
            )}
          </div>

          {/* Prüfpunkte nach Kategorie */}
          {kategorien.map(kat => {
            const punkte = (pruefpunkte as any[]).filter((p: any) => (p.kategorie ?? 'Allgemein') === kat);
            return (
              <div key={kat} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-700 text-sm">{kat}</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {punkte.map((punkt: any) => {
                    const ergebnis = ergebnisse.find((e: any) => e.pruefpunkt_id === punkt.id);
                    if (!ergebnis) return null;
                    const isIO = ergebnis.status === 'io';
                    const isNIO = ergebnis.status === 'nio';
                    return (
                      <PruefpunktRow
                        key={punkt.id}
                        punkt={punkt}
                        ergebnis={ergebnis}
                        employees={employees as any[]}
                        isIO={isIO}
                        isNIO={isNIO}
                        disabled={(begehung as any).abgeschlossen}
                        onUpdate={(status, notiz, geprueft_von) => updateErgebnis.mutate({ id: ergebnis.id, status, notiz, geprueft_von })}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Dialog */}
      {showAdmin && <AdminDialog onClose={() => setShowAdmin(false)} />}
    </div>
  );
}

function PruefpunktRow({ punkt, ergebnis, employees, isIO, isNIO, disabled, onUpdate }: any) {
  const [showNotiz, setShowNotiz] = useState(false);
  const [notiz, setNotiz] = useState(ergebnis.notiz ?? '');
  const [mitarbeiter, setMitarbeiter] = useState(ergebnis.geprueft_von ?? '');

  return (
    <div className={`px-5 py-3.5 transition-colors ${isIO ? 'bg-emerald-50/30' : isNIO ? 'bg-red-50/30' : ''}`}>
      <div className="flex items-center gap-3">
        {/* Status Buttons */}
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            disabled={disabled}
            onClick={() => { onUpdate('io', notiz, mitarbeiter || null); setShowNotiz(false); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isIO ? 'bg-emerald-500 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-emerald-100 hover:text-emerald-700'} disabled:opacity-50`}>
            <CheckCircle className="h-3.5 w-3.5" />i.O.
          </button>
          <button
            disabled={disabled}
            onClick={() => { onUpdate('nio', notiz, mitarbeiter || null); setShowNotiz(true); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isNIO ? 'bg-red-500 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-700'} disabled:opacity-50`}>
            <XCircle className="h-3.5 w-3.5" />n.i.O.
          </button>
        </div>

        {/* Punkt Name */}
        <div className="flex-1">
          <p className={`text-sm font-medium ${isIO ? 'text-emerald-700' : isNIO ? 'text-red-700' : 'text-gray-700'}`}>{punkt.name}</p>
          {ergebnis.geprueft_am && (
            <p className="text-xs text-gray-400 mt-0.5">
              {ergebnis.employees?.kuerzel && <span className="font-mono font-bold">{ergebnis.employees.kuerzel} · </span>}
              {new Date(ergebnis.geprueft_am).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
            </p>
          )}
        </div>

        {/* Notiz Toggle */}
        {!disabled && (
          <button onClick={() => setShowNotiz(!showNotiz)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">
            {ergebnis.notiz ? '📝' : '+ Notiz'}
          </button>
        )}
        {ergebnis.notiz && !showNotiz && (
          <span className="text-xs text-gray-500 italic max-w-[200px] truncate">{ergebnis.notiz}</span>
        )}
      </div>

      {/* Notiz + Mitarbeiter */}
      {showNotiz && !disabled && (
        <div className="mt-3 ml-[88px] flex gap-2">
          <Select value={mitarbeiter} onValueChange={setMitarbeiter}>
            <SelectTrigger className="w-[160px] h-8 text-xs rounded-lg"><SelectValue placeholder="Mitarbeiter..." /></SelectTrigger>
            <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.kuerzel} – {e.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Notiz (optional)..." value={notiz} onChange={e => setNotiz(e.target.value)}
            className="flex-1 h-8 text-xs rounded-lg" />
          <Button size="sm" className="h-8 text-xs rounded-lg px-3"
            onClick={() => { onUpdate(ergebnis.status === 'offen' ? 'nio' : ergebnis.status, notiz, mitarbeiter || null); setShowNotiz(false); }}>
            Speichern
          </Button>
        </div>
      )}
    </div>
  );
}

function AdminDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', kategorie: '', intervall: 'wöchentlich' });

  const { data: alle = [] } = useQuery({
    queryKey: ['pruefpunkte-alle'],
    queryFn: async () => { const { data } = await supabase.from('pruefpunkte').select('*').order('intervall').order('kategorie').order('name'); return data ?? []; },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Name erforderlich');
      const { error } = await supabase.from('pruefpunkte').insert({ name: form.name.trim(), kategorie: form.kategorie.trim() || null, intervall: form.intervall });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Prüfpunkt hinzugefügt'); setForm({ name: '', kategorie: '', intervall: 'wöchentlich' }); queryClient.invalidateQueries({ queryKey: ['pruefpunkte'] }); queryClient.invalidateQueries({ queryKey: ['pruefpunkte-alle'] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, aktiv }: { id: string; aktiv: boolean }) => {
      const { error } = await supabase.from('pruefpunkte').update({ aktiv }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pruefpunkte'] }); queryClient.invalidateQueries({ queryKey: ['pruefpunkte-alle'] }); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pruefpunkte').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Gelöscht'); queryClient.invalidateQueries({ queryKey: ['pruefpunkte'] }); queryClient.invalidateQueries({ queryKey: ['pruefpunkte-alle'] }); },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Prüfpunkte verwalten</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Neuer Prüfpunkt */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Neuer Prüfpunkt</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Name *</Label>
                <Input placeholder="z.B. Sicherheitsbeleuchtung Flur 3" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-sm rounded-lg" />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Kategorie</Label>
                <Input placeholder="z.B. Sicherheitsbeleuchtung" value={form.kategorie} onChange={e => setForm(f => ({ ...f, kategorie: e.target.value }))} className="h-8 text-sm rounded-lg" />
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs text-gray-500 mb-1 block">Intervall</Label>
                <Select value={form.intervall} onValueChange={v => setForm(f => ({ ...f, intervall: v }))}>
                  <SelectTrigger className="h-8 text-sm rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="wöchentlich">Wöchentlich</SelectItem><SelectItem value="monatlich">Monatlich</SelectItem></SelectContent>
                </Select>
              </div>
              <Button className="h-8 rounded-lg px-4" onClick={() => add.mutate()} disabled={add.isPending}>
                <Plus className="h-4 w-4 mr-1" />Hinzufügen
              </Button>
            </div>
          </div>

          {/* Liste */}
          <div className="space-y-1">
            {(alle as any[]).map((p: any) => (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${p.aktiv ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.kategorie ?? 'Kein Kategorie'} · {p.intervall}</p>
                </div>
                <button onClick={() => toggle.mutate({ id: p.id, aktiv: !p.aktiv })}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${p.aktiv ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}>
                  {p.aktiv ? 'Aktiv' : 'Inaktiv'}
                </button>
                <button onClick={() => { if (confirm('Prüfpunkt löschen?')) del.mutate(p.id); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {alle.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Noch keine Prüfpunkte</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
