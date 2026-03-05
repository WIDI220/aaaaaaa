import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { renderPdfPageToBase64, getPdfPageCount } from '@/lib/pdf-renderer';
import { toast } from 'sonner';
import { FileText, Upload, CheckCircle, XCircle, AlertCircle, RotateCcw, RefreshCw } from 'lucide-react';

const OCR_URL = 'https://widi-220-ticketflow-control.vercel.app/api/ocr';

interface PageResult {
  page: number;
  status: 'pending' | 'processing' | 'ok' | 'error' | 'no_match';
  a_nummer?: string | null;
  mitarbeiter?: string | null;
  stunden?: number | null;
  datum?: string | null;
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
      const el = emp.name.toLowerCase();
      if (lower === el) return emp.id;
      const last = el.split(' ').pop() ?? '';
      if (last.length > 3 && lower.includes(last)) return emp.id;
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

          // XHR mit hartem 30s Timeout – bricht GARANTIERT ab, kein ewiges Hängen
          const ocrResult = await new Promise<any>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', OCR_URL, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.timeout = 30000;
            xhr.ontimeout = () => reject(new Error(`Timeout Seite ${i + 1} – bitte manuell nachtragen`));
            xhr.onerror = () => reject(new Error(`Netzwerkfehler Seite ${i + 1}`));
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText)); }
                catch { reject(new Error(`Antwort-Fehler Seite ${i + 1}`)); }
              } else {
                reject(new Error(`Server-Fehler ${xhr.status} Seite ${i + 1}`));
              }
            };
            xhr.send(JSON.stringify({
              imageBase64,
              fileName: file.name,
              pageNumber: i + 1,
              employees: (employees as any[]).map((e: any) => ({ name: e.name, kuerzel: e.kuerzel }))
            }));
          });

          if (!ocrResult.success) {
            setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'error', error: ocrResult.error ?? 'OCR fehlgeschlagen' } : p));
            errors++; continue;
          }

          const ocr = ocrResult.result;
          if (!ocr.a_nummer) {
            setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'error', error: `Keine A-Nummer erkannt` } : p));
            errors++; continue;
          }

          const { data: ticket } = await supabase.from('tickets').select('id, a_nummer, status').eq('a_nummer', ocr.a_nummer).maybeSingle();

          if (!ticket) {
            setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'no_match', a_nummer: ocr.a_nummer, error: `${ocr.a_nummer} nicht in Datenbank` } : p));
            noMatch++; continue;
          }

          const employeeId = findEmployee(ocr.mitarbeiter_name);
          if (ocr.stunden_gesamt && employeeId) {
            await supabase.from('ticket_worklogs').insert({
              ticket_id: ticket.id,
              employee_id: employeeId,
              stunden: ocr.stunden_gesamt,
              leistungsdatum: ocr.leistungsdatum,
            });
          }

          await supabase.from('tickets').update({ status: 'erledigt', updated_at: new Date().toISOString() }).eq('id', ticket.id);

          setPages(prev => prev.map(p => p.page === i + 1 ? {
            ...p, status: 'ok',
            a_nummer: ocr.a_nummer,
            mitarbeiter: ocr.mitarbeiter_name,
            stunden: ocr.stunden_gesamt,
            datum: ocr.leistungsdatum,
          } : p));
          saved++;

        } catch (err: any) {
          setPages(prev => prev.map(p => p.page === i + 1 ? { ...p, status: 'error', error: err.message?.slice(0, 80) } : p));
          errors++;
        }

        // Kleine Pause zwischen Seiten – verhindert Überlastung
        await new Promise(r => setTimeout(r, 150));
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

  const okCount = pages.filter(p => p.status === 'ok').length;
  const errorCount = pages.filter(p => p.status === 'error').length;
  const noMatchCount = pages.filter(p => p.status === 'no_match').length;
  const progress = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">PDF-Rücklauf</h1>
        <p className="text-sm text-gray-500 mt-0.5">PDFs hochladen, OCR erkennt A-Nummer + Mitarbeiter automatisch</p>
      </div>

      {/* Upload Zone */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-all
            ${isProcessing
              ? 'border-blue-200 bg-blue-50/50 cursor-not-allowed'
              : 'border-gray-200 hover:border-[#1e3a5f]/40 hover:bg-gray-50 cursor-pointer'
            }`}
        >
          <div className={`w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center ${isProcessing ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {isProcessing
              ? <RefreshCw className="h-7 w-7 text-blue-600 animate-spin" />
              : <Upload className="h-7 w-7 text-gray-400" />
            }
          </div>

          {isProcessing ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-blue-700">Verarbeite {fileName}</p>
              <p className="text-xs text-blue-500">Seite {currentPage} von {totalPages}</p>
              <div className="w-full max-w-xs mx-auto bg-blue-100 rounded-full h-2">
                <div className="bg-blue-500 rounded-full h-2 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-blue-400 font-mono">{progress}%</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-gray-700">PDF hier ablegen oder klicken</p>
              <p className="text-xs text-gray-400 mt-1">Alle Seiten werden automatisch per OCR verarbeitet</p>
              {fileName && <p className="text-xs text-[#1e3a5f] font-medium mt-2">📄 {fileName}</p>}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }}
            disabled={isProcessing} />
        </div>
      </div>

      {/* Statistiken */}
      {pages.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{okCount}</p>
              <p className="text-xs text-gray-500">Gespeichert</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{noMatchCount}</p>
              <p className="text-xs text-gray-500">Nicht gefunden</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{errorCount}</p>
              <p className="text-xs text-gray-500">Fehler</p>
            </div>
          </div>
        </div>
      )}

      {/* Ergebnisliste */}
      {pages.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Seitenübersicht</h2>
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {pages.map(p => (
              <div key={p.page} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors
                ${p.status === 'ok' ? 'bg-emerald-50 border border-emerald-100' :
                  p.status === 'error' ? 'bg-red-50 border border-red-100' :
                  p.status === 'no_match' ? 'bg-amber-50 border border-amber-100' :
                  p.status === 'processing' ? 'bg-blue-50 border border-blue-100' :
                  'bg-gray-50 border border-gray-100'}`}>
                <span className="text-xs text-gray-400 font-mono w-12 shrink-0">S. {p.page}</span>
                {p.status === 'ok' && <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />}
                {p.status === 'error' && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                {p.status === 'no_match' && <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />}
                {p.status === 'processing' && <RotateCcw className="h-4 w-4 text-blue-500 shrink-0 animate-spin" />}
                {p.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />}
                <div className="flex-1 min-w-0">
                  {p.status === 'ok' && (
                    <span className="text-emerald-800">
                      <strong>{p.a_nummer}</strong>
                      {p.mitarbeiter && <span className="text-emerald-600"> · {p.mitarbeiter}</span>}
                      {p.stunden && <span className="text-emerald-600"> · {p.stunden}h</span>}
                      {p.datum && <span className="text-emerald-500 text-xs"> · {p.datum}</span>}
                    </span>
                  )}
                  {p.status === 'no_match' && <span className="text-amber-700 truncate">{p.error}</span>}
                  {p.status === 'error' && <span className="text-red-600 truncate">{p.error}</span>}
                  {p.status === 'processing' && <span className="text-blue-600">OCR läuft...</span>}
                  {p.status === 'pending' && <span className="text-gray-400">Wartend</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {done && (
        <button
          onClick={() => { setPages([]); setDone(false); setFileName(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Upload className="h-4 w-4" /> Neue Datei verarbeiten
        </button>
      )}
    </div>
  );
}
