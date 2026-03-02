import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMonth } from '@/contexts/MonthContext';
import { parseExcelFile, ParsedTicketRow } from '@/lib/excel-parser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Info } from 'lucide-react';

export default function ExcelImportPage() {
  const { user } = useAuth();
  const { activeMonth } = useMonth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parseResult, setParseResult] = useState<{
    rows: ParsedTicketRow[];
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null);
    setParseResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseExcelFile(buffer, activeMonth);
      setParseResult(result);
      const neu = result.rows.filter(r => !r.isDuplicate).length;
      toast.success(`${neu} neue Tickets erkannt, ${result.rows.filter(r => r.isDuplicate).length} Duplikate`);
    } catch (err: any) {
      toast.error(`Parse-Fehler: ${err.message}`);
    }
  };

  const doImport = async () => {
    if (!parseResult || !user) return;
    setImporting(true);
    const validRows = parseResult.rows.filter(r => !r.isDuplicate);
    let inserted = 0, updated = 0, skipped = 0, failed = 0;

    try {
      // Import-Run erstellen
      const { data: importRun, error: runError } = await supabase
        .from('import_runs')
        .insert({
          typ: 'excel',
          filename: fileName,
          rows_total: validRows.length,
          created_by: user.id,
        })
        .select()
        .single();

      if (runError) {
        console.error('Import run Fehler:', runError);
        toast.error('Import-Run konnte nicht erstellt werden: ' + runError.message);
        setImporting(false);
        return;
      }

      // Tickets einzeln einfügen
      for (const row of validRows) {
        try {
          const eingangsdatum = row.eingangsdatum?.toISOString().split('T')[0] ?? null;

          const { data: existing, error: checkError } = await supabase
            .from('tickets')
            .select('id, eingangsdatum')
            .eq('a_nummer', row.a_nummer)
            .maybeSingle();

          if (checkError) {
            console.error('Check error:', checkError);
            failed++;
            continue;
          }

          if (existing) {
            if (eingangsdatum && !existing.eingangsdatum) {
              await supabase.from('tickets').update({ eingangsdatum }).eq('id', existing.id);
            }
            updated++;
          } else {
            const { error: insertError } = await supabase.from('tickets').insert({
              a_nummer: row.a_nummer,
              gewerk: row.gewerk,
              status: 'in_bearbeitung',
              eingangsdatum,
            });
            if (insertError) {
              console.error('Insert error:', insertError);
              failed++;
              continue;
            }
            inserted++;
          }
        } catch (err) {
          console.error('Row error:', err);
          failed++;
        }
      }

      skipped = parseResult.rows.filter(r => r.isDuplicate).length;

      // Import-Run aktualisieren
      await supabase.from('import_runs').update({
        inserted, updated, skipped_duplicates: skipped, failed,
      }).eq('id', importRun.id);

      setReport({ inserted, updated, skipped, failed });
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });

      if (inserted > 0) {
        toast.success(`✅ ${inserted} Tickets für ${activeMonth} importiert!`);
      } else if (updated > 0) {
        toast.success(`🔄 ${updated} Tickets aktualisiert`);
      } else {
        toast.info('Alle Tickets bereits vorhanden');
      }
    } catch (err: any) {
      console.error('Import Fehler:', err);
      toast.error('Import fehlgeschlagen: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const [year, month] = activeMonth.split('-');
  const monthName = new Date(parseInt(year), parseInt(month) - 1, 1)
    .toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Excel-Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 bg-blue-50 text-blue-800 rounded-lg px-4 py-2 text-sm">
            <Info className="h-4 w-4 shrink-0" />
            <span>Tickets werden in <strong>{monthName}</strong> importiert (Monat in der Sidebar ändern)</span>
          </div>

          {/* Upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Excel-Datei hier ablegen oder klicken</p>
            {fileName && <p className="text-xs text-primary mt-1">{fileName}</p>}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </div>

          {/* Vorschau */}
          {parseResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-600 font-medium">
                  {parseResult.rows.filter(r => !r.isDuplicate).length} neue Tickets
                </span>
                <span className="text-muted-foreground">
                  {parseResult.rows.filter(r => r.isDuplicate).length} Duplikate übersprungen
                </span>
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <h4 className="text-xs font-medium text-yellow-800 mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {parseResult.warnings.length} Warnungen
                  </h4>
                  <div className="text-xs space-y-0.5 max-h-24 overflow-y-auto">
                    {parseResult.warnings.slice(0, 10).map((w, i) => (
                      <p key={i} className="text-yellow-700">{w}</p>
                    ))}
                    {parseResult.warnings.length > 10 && <p className="text-yellow-600">...und {parseResult.warnings.length - 10} weitere</p>}
                  </div>
                </div>
              )}

              {/* Tabelle */}
              <div className="overflow-x-auto max-h-48 border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="py-1.5 px-3 text-left">Zeile</th>
                      <th className="py-1.5 px-3 text-left">A-Nummer</th>
                      <th className="py-1.5 px-3 text-left">Gewerk</th>
                      <th className="py-1.5 px-3 text-left">Datum</th>
                      <th className="py-1.5 px-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.rows.slice(0, 30).map(r => (
                      <tr key={r.rowIndex} className={`border-t ${r.isDuplicate ? 'opacity-40 bg-muted/30' : ''}`}>
                        <td className="py-1 px-3">{r.rowIndex}</td>
                        <td className="py-1 px-3 font-mono">{r.a_nummer}</td>
                        <td className="py-1 px-3">{r.gewerk}</td>
                        <td className="py-1 px-3">{r.eingangsdatum?.toLocaleDateString('de-DE') ?? '–'}</td>
                        <td className="py-1 px-3">{r.isDuplicate ? '⚠ Duplikat' : '✓ Neu'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                onClick={doImport}
                disabled={importing || parseResult.rows.filter(r => !r.isDuplicate).length === 0}
                className="w-full"
                size="lg"
              >
                {importing
                  ? `Importiere... (bitte warten)`
                  : `${parseResult.rows.filter(r => !r.isDuplicate).length} Tickets in ${monthName} importieren`}
              </Button>
            </div>
          )}

          {/* Bericht */}
          {report && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-1">
              <h4 className="font-medium flex items-center gap-2 text-green-800">
                <CheckCircle className="h-4 w-4" /> Import abgeschlossen
              </h4>
              <p className="text-sm text-green-700">✅ {report.inserted} neu importiert</p>
              <p className="text-sm text-green-700">🔄 {report.updated} aktualisiert</p>
              <p className="text-sm text-muted-foreground">⏭ {report.skipped} Duplikate übersprungen</p>
              {report.failed > 0 && <p className="text-sm text-red-600">❌ {report.failed} fehlgeschlagen – siehe Browser-Konsole</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
