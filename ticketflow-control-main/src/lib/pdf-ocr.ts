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

const OCR_PROMPT = `Du analysierst einen gescannten Arbeitsauftrag der Märkischen Kliniken GmbH.

Extrahiere diese Felder:

1. a_nummer: Nach "Auftragsnr.:" - Format A26-XXXXX oder A25-XXXXX. Beispiele: "A26-02015"
2. werkstatt: Nach "Werkstatt:" - z.B. "Elektrotechnik", "Hochbau"
3. mitarbeiter_name: HANDSCHRIFTLICH nach "Name:" - oder Kürzel wie "TA", "UG", "TB", "MK", "CE", "CR", "SB", "SG", "FW"
4. leistungsdatum: HANDSCHRIFTLICH unter "Datum:" - Format "14.01.26" → "2026-01-14"
5. stunden_gesamt: In Spalte "Std./Stk." - Komma ist Dezimaltrennzeichen, bei mehreren Zeilen summieren
6. konfidenz: 0.0 bis 1.0

Antworte NUR mit JSON:
{"a_nummer":"A26-02015","werkstatt":"Hochbau","mitarbeiter_name":"Tarik Alkan","leistungsdatum":"2026-01-14","stunden_gesamt":1.5,"konfidenz":0.95}

Wenn nicht lesbar: null. ERFINDE KEINE WERTE.`;

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
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 300,
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
            { type: 'text', text: OCR_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const rawText = data.content[0]?.text ?? '';

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Kein JSON');
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
