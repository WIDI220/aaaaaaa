import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Users } from 'lucide-react';

export default function MitarbeiterPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmp, setNewEmp] = useState({ kuerzel: '', name: '', gewerk: 'Hochbau' as 'Hochbau' | 'Elektro' });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      return data ?? [];
    },
  });

  // Get hours per employee
  const { data: worklogs = [] } = useQuery({
    queryKey: ['all-worklogs'],
    queryFn: async () => {
      const { data } = await supabase.from('ticket_worklogs').select('employee_id, stunden');
      return data ?? [];
    },
  });

  const hoursMap = new Map<string, number>();
  worklogs.forEach((w: any) => {
    hoursMap.set(w.employee_id, (hoursMap.get(w.employee_id) ?? 0) + Number(w.stunden ?? 0));
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, aktiv }: { id: string; aktiv: boolean }) => {
      const { error } = await supabase.from('employees').update({ aktiv }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees-all'] }),
  });

  const createEmployee = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('employees').insert(newEmp);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees-all'] });
      setDialogOpen(false);
      setNewEmp({ kuerzel: '', name: '', gewerk: 'Hochbau' });
      toast.success('Mitarbeiter erstellt');
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Mitarbeiter</h2>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Neuer Mitarbeiter</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Neuer Mitarbeiter</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Kürzel</Label>
                  <Input value={newEmp.kuerzel} onChange={e => setNewEmp(p => ({ ...p, kuerzel: e.target.value }))} placeholder="MK" />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input value={newEmp.name} onChange={e => setNewEmp(p => ({ ...p, name: e.target.value }))} placeholder="Max Mustermann" />
                </div>
                <div>
                  <Label>Gewerk</Label>
                  <Select value={newEmp.gewerk} onValueChange={v => setNewEmp(p => ({ ...p, gewerk: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Hochbau">Hochbau</SelectItem>
                      <SelectItem value="Elektro">Elektro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => createEmployee.mutate()} className="w-full">Erstellen</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="py-3 px-4 text-left font-medium text-muted-foreground">Kürzel</th>
                <th className="py-3 px-4 text-left font-medium text-muted-foreground">Name</th>
                <th className="py-3 px-4 text-left font-medium text-muted-foreground">Gewerk</th>
                <th className="py-3 px-4 text-right font-medium text-muted-foreground">Stunden</th>
                <th className="py-3 px-4 text-center font-medium text-muted-foreground">Aktiv</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp: any) => (
                <tr key={emp.id} className="border-b last:border-0">
                  <td className="py-3 px-4 font-mono font-medium">{emp.kuerzel}</td>
                  <td className="py-3 px-4">{emp.name}</td>
                  <td className="py-3 px-4">{emp.gewerk}</td>
                  <td className="py-3 px-4 text-right font-mono">{(hoursMap.get(emp.id) ?? 0).toFixed(1)}h</td>
                  <td className="py-3 px-4 text-center">
                    <Switch
                      checked={emp.aktiv}
                      onCheckedChange={v => toggleActive.mutate({ id: emp.id, aktiv: v })}
                      disabled={!isAdmin}
                    />
                  </td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Keine Mitarbeiter vorhanden</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
