export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, fileName, pageNumber } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 fehlt' });

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // 25 Sekunden Timeout

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
              { type: 'text', text: `Analysiere diesen Arbeitsauftrag der Märkischen Kliniken GmbH.

Extrahiere folgende Felder. Antworte NUR mit JSON, kein anderer Text:

a_nummer: Steht nach "Auftragsnr.:" - immer Format A26-XXXXX oder A25-XXXXX (5 Ziffern)
werkstatt: Steht nach "Werkstatt:" - z.B. "Hochbau" oder "Elektrotechnik"
mitarbeiter_name: Der VOLLSTÄNDIGE handschriftliche Name nach "Name:" im unteren Durchführungsbereich. Lies sorgfältig! Bekannte Namen: Frank Werner, Uwe Gräwe, Tarik Alkan, Timo Bartelt, Matthias Kubista, Christoph Epe, Christoph Reitz, Sigrid Büter, Stefan Giesmann. Wenn du einen dieser Namen erkennst, schreibe ihn exakt so.
leistungsdatum: Handschriftliches Datum in der Tabelle - umwandeln zu YYYY-MM-DD. Bei mehreren das früheste nehmen.
stunden_gesamt: Zahl in Spalte "Std./Stk." - Komma ist Dezimaltrennzeichen. Bei mehreren Zeilen summieren. Beispiele: 0,5→0.5  1,5→1.5  2,5→2.5
konfidenz: Wie sicher bist du? 0.0 bis 1.0

Antworte exakt so (nur JSON):
{"a_nummer":"A26-01284","werkstatt":"Hochbau","mitarbeiter_name":"Stefan Giesmann","leistungsdatum":"2026-01-06","stunden_gesamt":1.0,"konfidenz":0.95}` }
            ]
          }]
        }),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        return res.status(200).json({ 
          success: false, 
          error: `Claude API ${response.status}: ${errText.slice(0, 200)}`,
          fileName, pageNumber
        });
      }

      const data = await response.json();
      const rawText = data.content[0]?.text ?? '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.status(200).json({ success: false, error: 'Kein JSON in Antwort', raw: rawText, fileName, pageNumber });

      const parsed = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ success: true, result: parsed });

    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(200).json({ success: false, error: 'Timeout nach 25 Sekunden', fileName, pageNumber });
      }
      throw fetchErr;
    }

  } catch (err) {
    return res.status(500).json({ error: err.message, fileName, pageNumber });
  }
}
