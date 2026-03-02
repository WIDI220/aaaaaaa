import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Pencil, UserCheck } from 'lucide-react';

export default function MitarbeiterPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ kuerzel: '', name: '', gewerk: 'Hochbau' });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').order('name');
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.kuerzel.trim() || !form.name.trim()) throw new Error('Kürzel und Name erforderlich');
      if (editing) {
        const { error } = await supabase.from('employees').update({
          kuerzel: form.kuerzel.toUpperCase().trim(),
          name: form.name.trim(),
          gewerk: form.gewerk,
        }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('employees').insert({
          kuerzel: form.kuerzel.toUpperCase().trim(),
          name: form.name.trim(),
          gewerk: form.gewerk,
          aktiv: true,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? 'Mitarbeiter aktualisiert' : 'Mitarbeiter hinzugefügt');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowAdd(false);
      setEditing(null);
      setForm({ kuerzel: '', name: '', gewerk: 'Hochbau' });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAktiv = useMutation({
    mutationFn: async ({ id, aktiv }: { id: string; aktiv: boolean }) => {
      await supabase.from('employees').update({ aktiv: !aktiv }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });

  const openEdit = (emp: any) => {
    setEditing(emp);
    setForm({ kuerzel: emp.kuerzel, name: emp.name, gewerk: emp.gewerk });
    setShowAdd(true);
  };

  const hochbau = employees.filter((e: any) => e.gewerk === 'Hochbau');
  const elektro = employees.filter((e: any) => e.gewerk === 'Elektro');

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UserCheck className="h-5 w-5" /> Mitarbeiter
        </h2>
        <Button onClick={() => { setEditing(null); setForm({ kuerzel: '', name: '', gewerk: 'Hochbau' }); setShowAdd(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Mitarbeiter hinzufügen
        </Button>
      </div>

      {['Hochbau', 'Elektro'].map(gewerk => (
        <Card key={gewerk}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{gewerk}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground w-20">Kürzel</th>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground w-24">Status</th>
                  <th className="py-2 px-4 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {(gewerk === 'Hochbau' ? hochbau : elektro).map((emp: any) => (
                  <tr key={emp.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="py-2 px-4 font-mono font-bold">{emp.kuerzel}</td>
                    <td className="py-2 px-4">{emp.name}</td>
                    <td className="py-2 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${emp.aktiv ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {emp.aktiv ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="py-2 px-4 flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(emp)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleAktiv.mutate({ id: emp.id, aktiv: emp.aktiv })}>
                        {emp.aktiv ? 'Deakt.' : 'Akt.'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      <Dialog open={showAdd} onOpenChange={v => { if (!v) { setShowAdd(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Kürzel (z.B. TA)</Label>
              <Input value={form.kuerzel} onChange={e => setForm(f => ({ ...f, kuerzel: e.target.value.toUpperCase() }))} placeholder="TA" maxLength={4} />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Tarik Alkan" />
            </div>
            <div>
              <Label>Gewerk</Label>
              <Select value={form.gewerk} onValueChange={v => setForm(f => ({ ...f, gewerk: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hochbau">Hochbau</SelectItem>
                  <SelectItem value="Elektro">Elektro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Speichert...' : 'Speichern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
