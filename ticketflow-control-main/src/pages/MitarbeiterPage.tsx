import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Pencil, Users } from 'lucide-react';

export default function MitarbeiterPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ kuerzel: '', name: '', gewerk: 'Hochbau' });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => { const { data } = await supabase.from('employees').select('*').order('name'); return data ?? []; },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.kuerzel.trim() || !form.name.trim()) throw new Error('Kürzel und Name erforderlich');
      if (editing) {
        const { error } = await supabase.from('employees').update({ kuerzel: form.kuerzel.toUpperCase().trim(), name: form.name.trim(), gewerk: form.gewerk }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('employees').insert({ kuerzel: form.kuerzel.toUpperCase().trim(), name: form.name.trim(), gewerk: form.gewerk, aktiv: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Mitarbeiter aktualisiert' : 'Mitarbeiter hinzugefügt');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowAdd(false); setEditing(null); setForm({ kuerzel: '', name: '', gewerk: 'Hochbau' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAktiv = useMutation({
    mutationFn: async ({ id, aktiv }: { id: string; aktiv: boolean }) => {
      await supabase.from('employees').update({ aktiv: !aktiv }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });

  const openEdit = (emp: any) => { setEditing(emp); setForm({ kuerzel: emp.kuerzel, name: emp.name, gewerk: emp.gewerk }); setShowAdd(true); };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mitarbeiter</h1>
          <p className="text-sm text-gray-500 mt-0.5">{(employees as any[]).filter((e: any) => e.aktiv).length} aktive Mitarbeiter</p>
        </div>
        <button
          onClick={() => { setEditing(null); setForm({ kuerzel: '', name: '', gewerk: 'Hochbau' }); setShowAdd(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium hover:bg-[#162d4a] transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> Mitarbeiter hinzufügen
        </button>
      </div>

      {['Hochbau', 'Elektro'].map(gewerk => {
        const group = (employees as any[]).filter((e: any) => e.gewerk === gewerk);
        return (
          <div key={gewerk} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-700">{gewerk}</h2>
              <span className="text-xs text-gray-400 ml-1">({group.length})</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left py-2.5 px-5 font-medium text-gray-400 text-xs uppercase tracking-wide w-20">Kürzel</th>
                  <th className="text-left py-2.5 px-5 font-medium text-gray-400 text-xs uppercase tracking-wide">Name</th>
                  <th className="text-left py-2.5 px-5 font-medium text-gray-400 text-xs uppercase tracking-wide w-24">Status</th>
                  <th className="py-2.5 px-5 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {group.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-gray-400 text-xs">Keine Mitarbeiter</td></tr>
                )}
                {group.map((emp: any) => (
                  <tr key={emp.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-5 font-mono font-bold text-[#1e3a5f]">{emp.kuerzel}</td>
                    <td className="py-3 px-5 text-gray-700 font-medium">{emp.name}</td>
                    <td className="py-3 px-5">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${emp.aktiv ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {emp.aktiv ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex gap-1 justify-end">
                        <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600" onClick={() => openEdit(emp)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${emp.aktiv ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                          onClick={() => toggleAktiv.mutate({ id: emp.id, aktiv: emp.aktiv })}
                        >
                          {emp.aktiv ? 'Deaktiv.' : 'Aktivier.'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <Dialog open={showAdd} onOpenChange={v => { if (!v) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Kürzel</Label>
              <Input value={form.kuerzel} onChange={e => setForm(f => ({ ...f, kuerzel: e.target.value.toUpperCase() }))} placeholder="z.B. TA" maxLength={4} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Vor- und Nachname" className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Gewerk</Label>
              <Select value={form.gewerk} onValueChange={v => setForm(f => ({ ...f, gewerk: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Hochbau">Hochbau</SelectItem><SelectItem value="Elektro">Elektro</SelectItem></SelectContent>
              </Select>
            </div>
            <Button className="w-full rounded-xl" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Speichert...' : 'Speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
