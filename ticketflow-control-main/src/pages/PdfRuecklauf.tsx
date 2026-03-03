import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { renderPdfPageToBase64, getPdfPageCount } from '@/lib/pdf-renderer';
import { fileToSha256 } from '@/lib/pdf-ocr';
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
      const empLower = emp.name.toLowerCase();
      // Exakter Match
      if (lower === empLower) return emp.id;
      // Nachname Match
      const lastName = empLower.split(' ').pop() ?? '';
      if (lastName.length > 3 && lower.includes(lastName)) return emp.id;
      // Kürzel Match
      if (lower === emp.kuerzel.toLowerCase()) return emp.id;
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
      setPages(Array.from({ length: count }, (_, i) => ({ page: i + 1, status: 'pending' })));

      let saved = 0, errors = 0, noMatch = 0;

      for (let i = 0; i < count; i++) {
        setCurrentPage(i + 1);
        setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'processing' } : p));

        try {
          const imageBase64 = await renderPdfPageToBase64(buffer, i);

          // OCR mit Timeout
          const ocrPromise = fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64, fileName: file.name, pageNumber: i + 1 }),
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout: Seite übersprungen nach 30s')), 30000)
          );

          const response = await Promise.race([ocrPromise, timeoutPromise]) as Response;

          if (!response.ok) {
            throw new Error(`Proxy Fehler ${response.status}`);
          }

          const data = await response.json();

          if (!data.success) {
            const errMsg = `${data.error ?? 'OCR fehlgeschlagen'} | Datei: ${file.name} | Seite: ${i + 1}`;
            setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'error', error: errMsg } : p));
            errors++;
            continue;
          }

          const ocr = data.result;

          if (!ocr.a_nummer) {
            setPages(prev => prev.map(p => p.page === i + 1 ? {
              ...p, status: 'error',
              error: `Keine A-Nummer erkannt | Datei: ${file.name} | Seite: ${i + 1}`
            } : p));
            errors++;
            continue;
          }

          // Ticket suchen
          const { data: ticket } = await supabase
            .from('tickets')
            .select('id, a_nummer, status')
            .eq('a_nummer', ocr.a_nummer)
            .maybeSingle();

          if (!ticket) {
            setPages(prev => prev.map(p => p.page === i + 1 ? {
              ...p, status: 'no_match',
              a_nummer: ocr.a_nummer,
              error: `${ocr.a_nummer} nicht in Datenbank | Datei: ${file.name} | Seite: ${i + 1}`
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

          // Status auf erledigt
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
          const errMsg = err.message?.includes('Timeout')
            ? `Timeout | Datei: ${file.name} | Seite: ${i + 1} – bitte manuell nachtragen`
            : `${err.message?.slice(0, 80)} | Datei: ${file.name} | Seite: ${i + 1}`;
          setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'error', error: errMsg } : p));
          errors++;
        }

        await new Promise(r => setTimeout(r, 200));
      }

      setDone(true);
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['worklogs-analyse'] });
      toast.success(`Fertig! ✅ ${saved} gespeichert · ⚠️ ${noMatch} nicht gefunden · ❌ ${errors} Fehler`);

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
            <FileText className="h-5 w-5" /> PDF-Rücklauf
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary/50 hover:bg-muted/50'}`}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {isProcessing ? `Verarbeite Seite ${currentPage} von ${totalPages}...` : 'PDF hier ablegen oder klicken'}
            </p>
            {isProcessing && (
              <div className="mt-3 w-full bg-muted rounded-full h-2">
                <div className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${totalPages > 0 ? (currentPage / totalPages * 100) : 0}%` }} />
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} disabled={isProcessing} />
          </div>

          {pages.length > 0 && (
            <div className="flex gap-6 text-sm font-medium">
              <span className="flex items-center gap-1.5 text-green-600"><CheckCircle className="h-4 w-4" />{okCount} gespeichert</span>
              <span className="flex items-center gap-1.5 text-yellow-600"><AlertCircle className="h-4 w-4" />{noMatchCount} nicht gefunden</span>
              <span className="flex items-center gap-1.5 text-red-600"><XCircle className="h-4 w-4" />{errorCount} Fehler</span>
            </div>
          )}

          {pages.length > 0 && (
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {pages.map(p => (
                <div key={p.page} className={`flex items-start gap-3 px-3 py-2 rounded-lg text-sm
                  ${p.status === 'ok' ? 'bg-green-50' :
                    p.status === 'error' ? 'bg-red-50' :
                    p.status === 'no_match' ? 'bg-yellow-50' :
                    p.status === 'processing' ? 'bg-blue-50' : 'bg-muted/20'}`}>
                  <span className="text-muted-foreground w-14 shrink-0 pt-0.5">S. {p.page}</span>
                  {p.status === 'ok' && <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />}
                  {p.status === 'error' && <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
                  {p.status === 'no_match' && <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />}
                  {p.status === 'processing' && <RotateCcw className="h-4 w-4 text-blue-600 shrink-0 mt-0.5 animate-spin" />}
                  {p.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    {p.status === 'ok' && (
                      <span>
                        <strong>{p.a_nummer}</strong> · {p.mitarbeiter ?? '–'} · {p.stunden}h · {p.datum}
                        {p.konfidenz && p.konfidenz < 0.7 && <span className="ml-2 text-xs text-yellow-600 font-medium">(niedrige Konfidenz – bitte prüfen)</span>}
                      </span>
                    )}
                    {p.status === 'no_match' && <span className="text-yellow-800 break-words">{p.error}</span>}
                    {p.status === 'error' && <span className="text-red-700 break-words">{p.error}</span>}
                    {p.status === 'processing' && <span className="text-blue-700">OCR läuft...</span>}
                    {p.status === 'pending' && <span className="text-muted-foreground">Wartend</span>}
                  </div>
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
