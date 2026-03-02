import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { renderPdfPageToBase64, getPdfPageCount } from '@/lib/pdf-renderer';
import { ocrSinglePage, fileToSha256, sha256 } from '@/lib/pdf-ocr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { FileText, Upload } from 'lucide-react';

interface ProcessingStatus {
  total: number;
  current: number;
  saved: number;
  review: number;
  duplicates: number;
  errors: number;
  worklogs: number;
}

export default function PdfRuecklauf() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'saved' | 'review'>('saved');

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('aktiv', true)
        .order('name');
      return data ?? [];
    },
  });

  const { data: savedPages = [] } = useQuery({
    queryKey: ['pdf_page_results', 'saved'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pdf_page_results')
        .select('*')
        .eq('status', 'saved')
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { data: reviewPages = [], refetch: refetchReview } = useQuery({
    queryKey: ['pdf_page_results', 'review'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pdf_page_results')
        .select('*')
        .eq('status', 'review')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  function matchMitarbeiter(name: string | null): string | null {
    if (!name) return null;
    const lower = name.toLowerCase().replace(/[^a-züäöß\s]/g, '');
    for (const emp of employees) {
      const empLower = emp.name.toLowerCase();
      const nameParts = lower.split(' ').filter(Boolean);
      if (nameParts.every((part: string) => empLower.includes(part))) return emp.id;
      const lastName = nameParts[nameParts.length - 1];
      if (lastName && lastName.length > 3 && empLower.includes(lastName)) return emp.id;
    }
    return null;
  }

  async function processFile(file: File) {
    const apiKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      toast.error('VITE_ANTHROPIC_API_KEY fehlt. Bitte als Umgebungsvariable setzen.');
      return;
    }

    setIsProcessing(true);
    const stats: ProcessingStatus = { total: 0, current: 0, saved: 0, review: 0, duplicates: 0, errors: 0, worklogs: 0 };

    try {
      const buffer = await file.arrayBuffer();
      const fileHash = await fileToSha256(buffer);
      const pageCount = await getPdfPageCount(buffer);
      stats.total = pageCount;
      setStatus({ ...stats });

      const { data: importRun, error: runError } = await supabase
        .from('import_runs')
        .insert({
          typ: 'pdf',
          filename: file.name,
          file_hash: fileHash,
          pages_expected: pageCount,
          created_by: user?.id,
        })
        .select()
        .single();

      if (runError || !importRun) throw new Error('Import-Run konnte nicht erstellt werden');

      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        stats.current = pageNum;
        setStatus({ ...stats });

        try {
          const hashUnique = await sha256(`${fileHash}|${pageNum}`);
          const { data: existing } = await supabase
            .from('pdf_page_results')
            .select('id')
            .eq('hash_unique', hashUnique)
            .maybeSingle();

          if (existing) { stats.duplicates++; setStatus({ ...stats }); continue; }

          const pageBase64 = await renderPdfPageToBase64(buffer, pageNum, 2.0);
          const ocrResult = await ocrSinglePage(pageBase64, apiKey);
          ocrResult.pageNumber = pageNum;

          const mitarbeiterId = matchMitarbeiter(ocrResult.mitarbeiter_name);

          const reviewReasons: string[] = [];
          if (!ocrResult.a_nummer) reviewReasons.push('KEIN_AUFTRAG');
          if (!ocrResult.mitarbeiter_name) reviewReasons.push('KEIN_MITARBEITER');
          if (!mitarbeiterId) reviewReasons.push('MITARBEITER_NICHT_GEFUNDEN');
          if (!ocrResult.stunden_gesamt) reviewReasons.push('KEINE_STUNDEN');
          if (!ocrResult.leistungsdatum) reviewReasons.push('KEIN_DATUM');
          if ((ocrResult.konfidenz ?? 0) < 0.7) reviewReasons.push('NIEDRIGE_KONFIDENZ');

          const needsReview = reviewReasons.length > 0;
          const pageStatus = needsReview ? 'review' : 'saved';

          let ticketId: string | null = null;
          if (ocrResult.a_nummer) {
            const { data: ticket } = await supabase
              .from('tickets')
              .select('id')
              .eq('a_nummer', ocrResult.a_nummer)
              .maybeSingle();

            if (ticket) {
              ticketId = ticket.id;
            } else {
              const { data: newTicket } = await supabase
                .from('tickets')
                .insert({
                  a_nummer: ocrResult.a_nummer,
                  gewerk: ocrResult.werkstatt?.toLowerCase().includes('hochbau') ? 'Hochbau' : 'Elektro',
                  status: 'in_bearbeitung',
                  eingangsdatum: null,
                })
                .select()
                .single();
              ticketId = newTicket?.id ?? null;
            }
          }

          const { data: pageResult, error: pageError } = await supabase
            .from('pdf_page_results')
            .insert({
              import_run_id: importRun.id,
              page_number: pageNum,
              hash_unique: hashUnique,
              a_nummer_raw: ocrResult.a_nummer,
              a_nummer_matched: ocrResult.a_nummer,
              mitarbeiter_raw: ocrResult.mitarbeiter_name,
              mitarbeiter_matched: mitarbeiterId ? employees.find((e: any) => e.id === mitarbeiterId)?.name : null,
              stunden: ocrResult.stunden_gesamt,
              leistungsdatum: ocrResult.leistungsdatum,
              konfidenz: ocrResult.konfidenz,
              raw_ocr_text: ocrResult.raw_text,
              status: pageStatus,
              review_reason: reviewReasons.join(', ') || null,
              needs_review: needsReview,
              created_by: user?.id,
            })
            .select()
            .single();

          if (pageError) {
            if (pageError.code === '23505') stats.duplicates++;
            else stats.errors++;
            setStatus({ ...stats });
            continue;
          }

          if (pageStatus === 'saved' && ticketId && mitarbeiterId && ocrResult.stunden_gesamt) {
            const { error: wlError } = await supabase
              .from('ticket_worklogs')
              .insert({
                ticket_id: ticketId,
                employee_id: mitarbeiterId,
                stunden: ocrResult.stunden_gesamt,
                leistungsdatum: ocrResult.leistungsdatum,
                pdf_page_result_id: pageResult!.id,
              });
            if (!wlError) stats.worklogs++;
          }

          if (pageStatus === 'saved') stats.saved++;
          else stats.review++;
          setStatus({ ...stats });
        } catch (pageErr) {
          console.error(`Fehler Seite ${pageNum}:`, pageErr);
          stats.errors++;
          setStatus({ ...stats });
        }
      }

      await supabase.from('import_runs').update({
        pages_saved: stats.saved,
        pages_review: stats.review,
        worklogs_created: stats.worklogs,
      }).eq('id', importRun.id);

      queryClient.invalidateQueries({ queryKey: ['pdf_page_results'] });
      toast.success(`Fertig: ${stats.saved} gespeichert, ${stats.review} zur Prüfung, ${stats.worklogs} Worklogs`);
    } catch (err) {
      console.error(err);
      toast.error(`Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}`);
    } finally {
      setIsProcessing(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">PDF-Rücklauf</h2>
      </div>

      {/* Upload */}
      <Card>
        <CardContent className="p-0">
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          <div
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') processFile(f); }}
            onDragOver={e => e.preventDefault()}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
              ${isProcessing ? 'border-border bg-muted cursor-not-allowed' : 'border-primary/30 hover:border-primary/60 hover:bg-muted/50'}`}
          >
            {isProcessing && status ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  Verarbeite Seite {status.current} von {status.total}...
                </p>
                <Progress value={(status.current / status.total) * 100} className="h-2" />
                <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                  <span>✅ {status.saved} gespeichert</span>
                  <span>🔍 {status.review} zur Prüfung</span>
                  <span>⚠️ {status.errors} Fehler</span>
                </div>
              </div>
            ) : (
              <div>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">PDF hier ablegen oder klicken</p>
                <p className="text-sm text-muted-foreground mt-1">Jede Seite wird einzeln mit Claude Vision OCR verarbeitet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Result badges */}
      {status && !isProcessing && (
        <div className="flex flex-wrap gap-2">
          <span className="status-badge bg-muted text-muted-foreground">📄 {status.total} Seiten</span>
          <span className="status-badge status-abgerechnet">✅ {status.saved} gespeichert</span>
          <span className="status-badge status-in_bearbeitung">🔍 {status.review} zur Prüfung</span>
          <span className="status-badge status-erledigt">📋 {status.worklogs} Worklogs</span>
          {status.duplicates > 0 && <span className="status-badge bg-muted text-muted-foreground">⏭️ {status.duplicates} Duplikate</span>}
          {status.errors > 0 && <span className="status-badge bg-destructive/10 text-destructive">❌ {status.errors} Fehler</span>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab('saved')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'saved' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Gespeichert ({savedPages.length})
        </button>
        <button
          onClick={() => setActiveTab('review')}
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'review' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Prüfung nötig ({reviewPages.length})
        </button>
      </div>

      {/* Saved Tab */}
      {activeTab === 'saved' && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Seite</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">A-Nummer</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Mitarbeiter</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Datum</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Stunden</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">Konfidenz</th>
                </tr>
              </thead>
              <tbody>
                {savedPages.map((p: any) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 px-3">{p.page_number}</td>
                    <td className="py-2 px-3 font-mono">{p.a_nummer_matched}</td>
                    <td className="py-2 px-3">{p.mitarbeiter_matched}</td>
                    <td className="py-2 px-3">{p.leistungsdatum}</td>
                    <td className="py-2 px-3 font-mono">{p.stunden}h</td>
                    <td className="py-2 px-3">
                      <span className={`status-badge ${Number(p.konfidenz) >= 0.9 ? 'status-abgerechnet' : 'status-in_bearbeitung'}`}>
                        {Math.round(Number(p.konfidenz) * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
                {savedPages.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Keine gespeicherten Ergebnisse</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Review Tab */}
      {activeTab === 'review' && (
        <ReviewTable
          pages={reviewPages}
          employees={employees}
          onRefresh={() => {
            refetchReview();
            queryClient.invalidateQueries({ queryKey: ['pdf_page_results', 'saved'] });
          }}
        />
      )}
    </div>
  );
}

function ReviewTable({ pages, employees, onRefresh }: { pages: any[]; employees: any[]; onRefresh: () => void }) {
  const [editState, setEditState] = useState<Record<string, any>>({});

  const updateField = (pageId: string, field: string, value: any) => {
    setEditState(prev => ({
      ...prev,
      [pageId]: { ...prev[pageId], [field]: value },
    }));
  };

  const savePage = async (page: any) => {
    const edit = editState[page.id] ?? {};
    const a_nummer = edit.a_nummer ?? page.a_nummer_matched;
    const employee_id = edit.employee_id ?? null;
    const stunden = parseFloat(edit.stunden ?? page.stunden ?? 0);
    const leistungsdatum = edit.leistungsdatum ?? page.leistungsdatum;

    const { data: ticket } = await supabase
      .from('tickets')
      .select('id')
      .eq('a_nummer', a_nummer)
      .maybeSingle();

    let ticketId = ticket?.id;
    if (!ticketId && a_nummer) {
      const { data: newTicket } = await supabase
        .from('tickets')
        .insert({ a_nummer, gewerk: 'Elektro', status: 'in_bearbeitung' })
        .select()
        .single();
      ticketId = newTicket?.id;
    }

    await supabase
      .from('pdf_page_results')
      .update({ status: 'saved', a_nummer_matched: a_nummer, mitarbeiter_matched: employee_id })
      .eq('id', page.id);

    if (ticketId && employee_id && stunden > 0) {
      await supabase.from('ticket_worklogs').upsert({
        ticket_id: ticketId,
        employee_id,
        stunden,
        leistungsdatum,
        pdf_page_result_id: page.id,
      }, { onConflict: 'pdf_page_result_id' });
    }

    toast.success(`Seite ${page.page_number} gespeichert`);
    onRefresh();
  };

  const rejectPage = async (page: any) => {
    await supabase
      .from('pdf_page_results')
      .update({ status: 'failed', review_reason: 'MANUALLY_REJECTED' })
      .eq('id', page.id);
    toast.info(`Seite ${page.page_number} verworfen`);
    onRefresh();
  };

  if (pages.length === 0) {
    return <p className="text-center text-muted-foreground py-8">Keine Einträge zur Prüfung</p>;
  }

  return (
    <div className="space-y-4">
      {pages.map((page: any) => {
        const edit = editState[page.id] ?? {};
        return (
          <Card key={page.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Seite {page.page_number}</CardTitle>
                <span className="text-xs text-muted-foreground">{page.review_reason}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {page.raw_ocr_text && (
                <p className="text-xs bg-muted rounded p-2 max-h-20 overflow-y-auto font-mono">
                  {page.raw_ocr_text.substring(0, 200)}...
                </p>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">A-Nummer</label>
                  <Input
                    defaultValue={page.a_nummer_matched ?? ''}
                    onChange={e => updateField(page.id, 'a_nummer', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Mitarbeiter</label>
                  <Select onValueChange={v => updateField(page.id, 'employee_id', v)}>
                    <SelectTrigger className="mt-1 h-8 text-sm">
                      <SelectValue placeholder="-- auswählen --" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp: any) => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Stunden</label>
                  <Input
                    type="number"
                    step="0.25"
                    defaultValue={page.stunden ?? ''}
                    onChange={e => updateField(page.id, 'stunden', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Leistungsdatum</label>
                  <Input
                    type="date"
                    defaultValue={page.leistungsdatum ?? ''}
                    onChange={e => updateField(page.id, 'leistungsdatum', e.target.value)}
                    className="mt-1 h-8 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={() => savePage(page)} className="text-xs">
                  ✅ Speichern
                </Button>
                <Button size="sm" variant="outline" onClick={() => rejectPage(page)} className="text-xs text-destructive">
                  ❌ Verwerfen
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
