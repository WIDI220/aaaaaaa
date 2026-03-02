import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMonth } from '@/contexts/MonthContext';
import { renderPdfPageToBase64, getPdfPageCount } from '@/lib/pdf-renderer';
import { ocrSinglePage, fileToSha256 } from '@/lib/pdf-ocr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileText, Upload, CheckCircle, XCircle, AlertCircle, RotateCcw } from 'lucide-react';

interface PageResult {
  page: number;
  status: 'pending' | 'processing' | 'ok' | 'error' | 'no_match';
  a_nummer?: string | null;
  mitarbeiter?: string | null;
  stunden?: number | null;
  datum?: string | null;
  konfidenz?: number;
  error?: string;
}

export default function PdfRuecklauf() {
  const { activeMonth } = useMonth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<PageResult[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [fileName, setFileName] = useState('');
  const [done, setDone] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data } = await supabase.from('employees').select('*').eq('aktiv', true);
      return data ?? [];
    },
  });

  function findEmployee(name: string | null): string | null {
    if (!name) return null;
    const lower = name.toLowerCase();
    for (const emp of employees as any[]) {
      if (lower.includes(emp.name.toLowerCase().split(' ').pop() ?? '')) return emp.id;
      if (lower.includes(emp.kuerzel.toLowerCase())) return emp.id;
    }
    return null;
  }

  async function processFile(file: File) {
    if (isProcessing) return;
    setIsProcessing(true);
    setDone(false);
    setPages([]);
    setCurrentPage(0);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const count = await getPdfPageCount(buffer);
      setTotalPages(count);

      // Initialisiere alle Seiten als pending
      const initial: PageResult[] = Array.from({ length: count }, (_, i) => ({
        page: i + 1, status: 'pending'
      }));
      setPages(initial);

      let saved = 0, errors = 0, noMatch = 0;

      for (let i = 0; i < count; i++) {
        setCurrentPage(i + 1);
        setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'processing' } : p));

        try {
          // Seite rendern
          const imageBase64 = await renderPdfPageToBase64(buffer, i);
          
          // OCR via Proxy
          const ocr = await ocrSinglePage(imageBase64, '');

          if (!ocr.a_nummer) {
            setPages(prev => prev.map(p => p.page === i + 1 ? {
              ...p, status: 'error', error: 'Keine A-Nummer erkannt'
            } : p));
            errors++;
            continue;
          }

          // Ticket in Supabase suchen
          const { data: ticket } = await supabase
            .from('tickets')
            .select('id, a_nummer, status')
            .eq('a_nummer', ocr.a_nummer)
            .maybeSingle();

          if (!ticket) {
            setPages(prev => prev.map(p => p.page === i + 1 ? {
              ...p, status: 'no_match',
              a_nummer: ocr.a_nummer,
              error: `Ticket ${ocr.a_nummer} nicht in Datenbank`
            } : p));
            noMatch++;
            continue;
          }

          // Mitarbeiter zuordnen
          const employeeId = findEmployee(ocr.mitarbeiter_name);

          // Worklog eintragen
          if (ocr.stunden_gesamt && employeeId) {
            await supabase.from('ticket_worklogs').insert({
              ticket_id: ticket.id,
              employee_id: employeeId,
              stunden: ocr.stunden_gesamt,
              leistungsdatum: ocr.leistungsdatum,
            });
          }

          // Status auf erledigt setzen
          await supabase.from('tickets').update({
            status: 'erledigt',
            updated_at: new Date().toISOString(),
          }).eq('id', ticket.id);

          setPages(prev => prev.map(p => p.page === i + 1 ? {
            ...p, status: 'ok',
            a_nummer: ocr.a_nummer,
            mitarbeiter: ocr.mitarbeiter_name,
            stunden: ocr.stunden_gesamt,
            datum: ocr.leistungsdatum,
            konfidenz: ocr.konfidenz,
          } : p));
          saved++;

        } catch (err: any) {
          setPages(prev => prev.map(p => p.page === i + 1 ? {
            ...p, status: 'error', error: err.message?.slice(0, 100) ?? 'Unbekannter Fehler'
          } : p));
          errors++;
        }

        // Kurze Pause zwischen Anfragen
        await new Promise(r => setTimeout(r, 300));
      }

      setDone(true);
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['worklogs-analyse'] });
      toast.success(`Fertig! ${saved} gespeichert, ${noMatch} nicht gefunden, ${errors} Fehler`);

    } catch (err: any) {
      toast.error('Fehler: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const okCount = pages.filter(p => p.status === 'ok').length;
  const errorCount = pages.filter(p => p.status === 'error').length;
  const noMatchCount = pages.filter(p => p.status === 'no_match').length;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            PDF-Rücklauf
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload */}
          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50 hover:bg-muted/50'}`}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {isProcessing ? `Verarbeite ${fileName}... (Seite ${currentPage} von ${totalPages})` : 'PDF hier ablegen oder klicken'}
            </p>
            {isProcessing && (
              <div className="mt-3 w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${totalPages > 0 ? (currentPage / totalPages * 100) : 0}%` }}
                />
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} disabled={isProcessing} />
          </div>

          {/* Zusammenfassung */}
          {pages.length > 0 && (
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" />{okCount} gespeichert</span>
              <span className="flex items-center gap-1 text-yellow-600"><AlertCircle className="h-4 w-4" />{noMatchCount} nicht gefunden</span>
              <span className="flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4" />{errorCount} Fehler</span>
            </div>
          )}

          {/* Ergebnisliste */}
          {pages.length > 0 && (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {pages.map(p => (
                <div key={p.page} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                  ${p.status === 'ok' ? 'bg-green-50' :
                    p.status === 'error' ? 'bg-red-50' :
                    p.status === 'no_match' ? 'bg-yellow-50' :
                    p.status === 'processing' ? 'bg-blue-50 animate-pulse' : 'bg-muted/30'}`}>
                  <span className="text-muted-foreground w-16 shrink-0">Seite {p.page}</span>
                  {p.status === 'ok' && <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
                  {p.status === 'error' && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                  {p.status === 'no_match' && <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0" />}
                  {p.status === 'processing' && <RotateCcw className="h-4 w-4 text-blue-600 shrink-0 animate-spin" />}
                  {p.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted shrink-0" />}

                  {p.status === 'ok' && (
                    <span>
                      <strong>{p.a_nummer}</strong> · {p.mitarbeiter ?? '–'} · {p.stunden}h · {p.datum}
                      {p.konfidenz && p.konfidenz < 0.7 && <span className="ml-2 text-yellow-600">(niedrige Konfidenz)</span>}
                    </span>
                  )}
                  {p.status === 'no_match' && <span><strong>{p.a_nummer}</strong> – {p.error}</span>}
                  {p.status === 'error' && <span className="text-red-700">{p.error}</span>}
                  {p.status === 'processing' && <span className="text-blue-700">OCR läuft...</span>}
                  {p.status === 'pending' && <span className="text-muted-foreground">Wartend...</span>}
                </div>
              ))}
            </div>
          )}

          {done && (
            <Button variant="outline" onClick={() => { setPages([]); setDone(false); setFileName(''); }}>
              Neue Datei verarbeiten
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
