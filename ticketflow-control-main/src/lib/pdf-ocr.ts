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

export async function ocrSinglePage(
  pageImageBase64: string,
  _anthropicApiKey: string // nicht mehr direkt genutzt - Proxy übernimmt
): Promise<OcrPageResult & { pageNumber: number }> {
  
  // Proxy-Route aufrufen statt direkt Anthropic
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: pageImageBase64 }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OCR Proxy Fehler ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error ?? 'OCR fehlgeschlagen');
  }

  const parsed = data.result;
  return {
    pageNumber: 0,
    a_nummer: parsed.a_nummer ?? null,
    werkstatt: parsed.werkstatt ?? null,
    mitarbeiter_name: parsed.mitarbeiter_name ?? null,
    leistungsdatum: parsed.leistungsdatum ?? null,
    stunden_gesamt: parsed.stunden_gesamt ?? null,
    konfidenz: parsed.konfidenz ?? 0.5,
    raw_text: data.raw ?? '',
  };
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
