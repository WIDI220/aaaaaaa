import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Settings } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  in_bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
  zur_unterschrift: 'Zur Unterschrift',
  abrechenbar: 'Abrechenbar',
  abgerechnet: 'Abgerechnet',
};

export default function EinstellungenPage() {
  const queryClient = useQueryClient();

  const { data: settings = [] } = useQuery({
    queryKey: ['escalation_settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('escalation_settings')
        .select('*')
        .order('status');
      return data ?? [];
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({ id, warntage }: { id: string; warntage: number }) => {
      const { error } = await supabase
        .from('escalation_settings')
        .update({ warntage })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation_settings'] });
      toast.success('Einstellung gespeichert');
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-xl">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Einstellungen</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Eskalation – Warntage pro Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between gap-4">
              <span className={`status-badge status-${s.status} text-sm`}>
                {STATUS_LABELS[s.status] ?? s.status}
              </span>
              <Input
                type="number"
                defaultValue={s.warntage}
                className="w-24 text-right"
                onBlur={e => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val !== s.warntage) {
                    updateSetting.mutate({ id: s.id, warntage: val });
                  }
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
