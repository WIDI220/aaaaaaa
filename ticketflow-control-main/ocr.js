export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 fehlt' });
    }

    const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC API Key nicht konfiguriert' });
    }

    const prompt = `Du analysierst einen gescannten Arbeitsauftrag der Märkischen Kliniken GmbH.

Extrahiere diese Felder:
1. a_nummer: Nach "Auftragsnr.:" - Format A26-XXXXX oder A25-XXXXX. Beispiele: "A26-02015"
2. werkstatt: Nach "Werkstatt:" - z.B. "Hochbau", "Elektrotechnik"
3. mitarbeiter_name: HANDSCHRIFTLICH nach "Name:" - z.B. "Frank Werner", "Stefan Giesmann", "Sigrid Büter"
4. leistungsdatum: HANDSCHRIFTLICH unter "Datum:" - Format "06.01.26" → "2026-01-06". Bei mehreren Zeilen das FRÜHESTE Datum.
5. stunden_gesamt: In Spalte "Std./Stk." - Komma ist Dezimaltrennzeichen. Bei mehreren Zeilen SUMMIEREN. "0,5"→0.5, "1,5"→1.5, "2,5"→2.5
6. konfidenz: 0.0 bis 1.0

Antworte NUR mit JSON, kein anderer Text:
{"a_nummer":"A26-02015","werkstatt":"Hochbau","mitarbeiter_name":"Frank Werner","leistungsdatum":"2026-01-06","stunden_gesamt":2.5,"konfidenz":0.95}

Wenn ein Feld nicht lesbar ist: null. ERFINDE KEINE WERTE.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
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
                  data: imageBase64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Claude API Fehler: ${errText.slice(0, 200)}` });
    }

    const data = await response.json();
    const rawText = data.content[0]?.text ?? '';

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Kein JSON in Antwort');
      const parsed = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ success: true, result: parsed, raw: rawText });
    } catch {
      return res.status(200).json({ success: false, error: 'JSON-Parse fehlgeschlagen', raw: rawText });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
