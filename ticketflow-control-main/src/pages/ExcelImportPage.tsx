import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMonth } from '@/contexts/MonthContext';
import { parseExcelFile, ParsedTicketRow } from '@/lib/excel-parser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle } from 'lucide-react';

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

    try {
      const buffer = await file.arrayBuffer();
      const result = parseExcelFile(buffer, activeMonth);
      setParseResult(result);
      toast.success(`${result.rows.filter(r => !r.isDuplicate).length} Zeilen erkannt`);
    } catch (err: any) {
      toast.error(`Parse-Fehler: ${err.message}`);
    }
  };

  const doImport = async () => {
    if (!parseResult) return;
    setImporting(true);
    const validRows = parseResult.rows.filter(r => !r.isDuplicate);
    let inserted = 0, updated = 0, skipped = 0, failed = 0;

    try {
      // Create import run
      const { data: importRun } = await supabase
        .from('import_runs')
        .insert({
          typ: 'excel',
          filename: fileName,
          rows_total: validRows.length,
          created_by: user?.id,
        })
        .select()
        .single();

      for (const row of validRows) {
        try {
          const { data: existing } = await supabase
            .from('tickets')
            .select('id')
            .eq('a_nummer', row.a_nummer)
            .maybeSingle();

          if (existing) {
            // Update eingangsdatum if null
            if (row.eingangsdatum) {
              await supabase
                .from('tickets')
                .update({ eingangsdatum: row.eingangsdatum.toISOString().split('T')[0] })
                .eq('id', existing.id)
                .is('eingangsdatum', null);
            }
            updated++;
          } else {
            const { error } = await supabase.from('tickets').insert({
              a_nummer: row.a_nummer,
              gewerk: row.gewerk,
              status: 'in_bearbeitung',
              eingangsdatum: row.eingangsdatum?.toISOString().split('T')[0] ?? null,
            });
            if (error) { failed++; continue; }
            inserted++;
          }
        } catch {
          failed++;
        }
      }

      skipped = parseResult.rows.filter(r => r.isDuplicate).length;

      // Update import run
      if (importRun) {
        await supabase.from('import_runs').update({
          inserted, updated, skipped_duplicates: skipped, failed,
        }).eq('id', importRun.id);
      }

      setReport({ inserted, updated, skipped, failed });
      queryClient.invalidateQueries({ queryKey: ['tickets-list'] });
      toast.success(`Import abgeschlossen: ${inserted} neu, ${updated} aktualisiert`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

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
          <p className="text-sm text-muted-foreground">
            Referenzmonat: <strong>{activeMonth}</strong> (änderbar in der Sidebar)
          </p>

          {/* Upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Excel-Datei hier ablegen oder klicken</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {/* Preview */}
          {parseResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-accent font-medium">
                  {parseResult.rows.filter(r => !r.isDuplicate).length} neue Zeilen
                </span>
                {parseResult.rows.filter(r => r.isDuplicate).length > 0 && (
                  <span className="text-muted-foreground">
                    {parseResult.rows.filter(r => r.isDuplicate).length} Duplikate
                  </span>
                )}
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="bg-secondary rounded-lg p-3">
                  <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Warnungen
                  </h4>
                  <div className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                    {parseResult.warnings.map((w, i) => (
                      <p key={i} className="text-muted-foreground">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Table preview */}
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="py-1 px-2 text-left">Zeile</th>
                      <th className="py-1 px-2 text-left">A-Nummer</th>
                      <th className="py-1 px-2 text-left">Gewerk</th>
                      <th className="py-1 px-2 text-left">Datum</th>
                      <th className="py-1 px-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.rows.slice(0, 20).map(r => (
                      <tr key={r.rowIndex} className={`border-b ${r.isDuplicate ? 'opacity-40' : ''}`}>
                        <td className="py-1 px-2">{r.rowIndex}</td>
                        <td className="py-1 px-2 font-mono">{r.a_nummer}</td>
                        <td className="py-1 px-2">{r.gewerk}</td>
                        <td className="py-1 px-2">{r.eingangsdatum?.toLocaleDateString('de-DE') ?? '–'}</td>
                        <td className="py-1 px-2">{r.isDuplicate ? 'Duplikat' : 'Neu'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button onClick={doImport} disabled={importing} className="w-full">
                {importing ? 'Importiere...' : `${parseResult.rows.filter(r => !r.isDuplicate).length} Tickets importieren`}
              </Button>
            </div>
          )}

          {/* Report */}
          {report && (
            <div className="bg-secondary rounded-lg p-4 space-y-1">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-accent" /> Import-Bericht
              </h4>
              <p className="text-sm">✅ {report.inserted} neu eingefügt</p>
              <p className="text-sm">🔄 {report.updated} aktualisiert</p>
              <p className="text-sm">⏭️ {report.skipped} Duplikate übersprungen</p>
              {report.failed > 0 && <p className="text-sm text-destructive">❌ {report.failed} fehlgeschlagen</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
