export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 fehlt' });

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt in Vercel Environment Variables' });

    const prompt = `Du analysierst einen gescannten Arbeitsauftrag der Märkischen Kliniken GmbH.

Extrahiere diese Felder und antworte NUR mit JSON:
1. a_nummer: Nach "Auftragsnr.:" - Format A26-XXXXX oder A25-XXXXX
2. werkstatt: Nach "Werkstatt:" - z.B. "Hochbau", "Elektrotechnik"
3. mitarbeiter_name: Handschriftlicher Name nach "Name:" unten im Formular
4. leistungsdatum: Handschriftliches Datum - umwandeln in YYYY-MM-DD. Bei mehreren das früheste.
5. stunden_gesamt: Zahl in "Std./Stk." Spalte - Komma=Dezimal, mehrere Zeilen summieren
6. konfidenz: 0.0 bis 1.0

Antworte NUR mit JSON:
{"a_nummer":"A26-02015","werkstatt":"Hochbau","mitarbeiter_name":"Frank Werner","leistungsdatum":"2026-01-06","stunden_gesamt":2.5,"konfidenz":0.9}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(200).json({ success: false, error: `Claude API ${response.status}: ${errText.slice(0, 300)}` });
    }

    const data = await response.json();
    const rawText = data.content[0]?.text ?? '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(200).json({ success: false, error: 'Kein JSON in Antwort', raw: rawText });

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ success: true, result: parsed, raw: rawText });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
