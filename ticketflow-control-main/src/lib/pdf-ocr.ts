// PDF OCR mit Claude Vision API
// Verarbeitet JEDE SEITE EINZELN – niemals das gesamte PDF auf einmal!

export interface OcrPageResult {
  pageNumber: number;
  a_nummer: string | null;
  werkstatt: string | null;
  mitarbeiter_name: string | null;
  leistungsdatum: string | null;
  stunden_gesamt: number | null;
  konfidenz: number;
  raw_text: string;
  error?: string;
}

const OCR_PROMPT = `Du analysierst einen gescannten Arbeitsauftrag der Märkischen Kliniken GmbH oder Märkischen Seniorenzentren GmbH.

Das Formular hat OBEN gedruckten Text und UNTEN handschriftliche Einträge.

Extrahiere diese Felder:

1. a_nummer: Steht oben nach "Auftragsnr.:" - Format A26-XXXXX oder A25-XXXXX. GEDRUCKT, immer gut lesbar. Beispiele: "A26-02015", "A25-28166"

2. werkstatt: Steht nach "Werkstatt:" - z.B. "Elektrotechnik", "Hochbau", "Nachrichtentechnik"

3. mitarbeiter_name: HANDSCHRIFTLICH nach "Name:" im unteren Durchführungsbereich. Häufige Namen: "Matthias Kubista", "M. Münch", "N. Willing", "Timo Bartelt"

4. leistungsdatum: HANDSCHRIFTLICH unter "Datum:" in der Tabelle unten. Format wie "14.01.26" oder "16.01.2026". Gib aus als ISO-Format "YYYY-MM-DD". Bei mehreren Zeilen nimm das FRÜHESTE Datum. "14.01.26" → "2026-01-14"

5. stunden_gesamt: HANDSCHRIFTLICH in Spalte "Std./Stk.:" der Tabelle. Werte wie "0,5h"→0.5, "1,5h"→1.5, "0,75h"→0.75, "2,75h"→2.75, "1,25h"→1.25. Komma ist Dezimaltrennzeichen. Bei MEHREREN Zeilen: SUMMIERE alle Stunden. Runde auf 0,25-Schritte.

6. konfidenz: Zahl 0.0 bis 1.0 wie sicher du dir bist.

Antworte NUR mit diesem JSON, kein anderer Text:
{
  "a_nummer": "A26-02015",
  "werkstatt": "Elektrotechnik",
  "mitarbeiter_name": "Matthias Kubista",
  "leistungsdatum": "2026-01-14",
  "stunden_gesamt": 0.5,
  "konfidenz": 0.95
}

Wenn ein Feld WIRKLICH nicht lesbar ist: null. ERFINDE KEINE WERTE.`;

export async function ocrSinglePage(
  pageImageBase64: string,
  anthropicApiKey: string
): Promise<OcrPageResult & { pageNumber: number }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: pageImageBase64,
              },
            },
            {
              type: 'text',
              text: OCR_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API Fehler ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.content[0]?.text ?? '';

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Kein JSON in Antwort');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      pageNumber: 0,
      a_nummer: parsed.a_nummer ?? null,
      werkstatt: parsed.werkstatt ?? null,
      mitarbeiter_name: parsed.mitarbeiter_name ?? null,
      leistungsdatum: parsed.leistungsdatum ?? null,
      stunden_gesamt: parsed.stunden_gesamt ?? null,
      konfidenz: parsed.konfidenz ?? 0.5,
      raw_text: rawText,
    };
  } catch {
    return {
      pageNumber: 0,
      a_nummer: null,
      werkstatt: null,
      mitarbeiter_name: null,
      leistungsdatum: null,
      stunden_gesamt: null,
      konfidenz: 0,
      raw_text: rawText,
      error: 'JSON-Parse fehlgeschlagen',
    };
  }
}

export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function fileToSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
