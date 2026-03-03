export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, fileName, pageNumber, employees } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 fehlt' });

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY fehlt' });

    // Mitarbeiterliste für den Prompt aufbauen
    const empList = employees && employees.length > 0
      ? employees.map(e => `- ${e.name} (Kürzel: ${e.kuerzel})`).join('\n')
      : `- Frank Werner (Kürzel: FW)
- Uwe Gräwe (Kürzel: UG)
- Tarik Alkan (Kürzel: TA)
- Timo Bartelt (Kürzel: TB)
- Matthias Kubista (Kürzel: MK)
- Christoph Epe (Kürzel: CE)
- Christoph Reitz (Kürzel: CR)
- Sigrid Büter (Kürzel: SB)
- Stefan Giesmann (Kürzel: SG)`;

    const prompt = `Du analysierst einen gescannten Arbeitsauftrag der Märkischen Kliniken GmbH / Märkischen Seniorenzentren GmbH.

MITARBEITERLISTE (nur diese Personen arbeiten hier):
${empList}

Extrahiere folgende Felder und antworte NUR mit JSON:

1. a_nummer: Steht nach "Auftragsnr.:" – Format A26-XXXXX oder A25-XXXXX (immer 5 Ziffern). Beispiel: "A26-01284"

2. werkstatt: Steht nach "Werkstatt:" – z.B. "Hochbau" oder "Elektrotechnik"

3. mitarbeiter_name: Der handschriftliche Name im Feld "Name:" im unteren Durchführungsbereich.
   WICHTIG: Vergleiche was du siehst mit der MITARBEITERLISTE oben und gib den exakten Namen zurück.
   Auch wenn die Handschrift unleserlich ist – wähle den Namen aus der Liste der am besten passt.
   Manchmal steht nur der Nachname oder ein Kürzel – trotzdem den vollen Namen aus der Liste zurückgeben.
   Beispiele: "Werner" → "Frank Werner", "Giesm" → "Stefan Giesmann", "SG" → "Stefan Giesmann"

4. leistungsdatum: Handschriftliches Datum in der Tabelle unter "Datum:".
   Umwandeln zu YYYY-MM-DD. Bei mehreren Zeilen das FRÜHESTE Datum nehmen.
   Beispiele: "06.01.26" → "2026-01-06", "6.1.26" → "2026-01-06"

5. stunden_gesamt: Zahl(en) in der Spalte "Std./Stk." der Tabelle.
   Komma ist Dezimaltrennzeichen: "0,5" → 0.5, "1,5" → 1.5, "2,5" → 2.5
   Bei mehreren ausgefüllten Zeilen: ALLE Stunden SUMMIEREN.
   Ignoriere leere Zeilen.

6. konfidenz: Wie sicher bist du insgesamt? Zahl von 0.0 bis 1.0

Antworte AUSSCHLIESSLICH mit diesem JSON (keine Erklärung, kein Text davor/danach):
{"a_nummer":"A26-01284","werkstatt":"Hochbau","mitarbeiter_name":"Stefan Giesmann","leistungsdatum":"2026-01-06","stunden_gesamt":1.0,"konfidenz":0.9}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

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
              { type: 'text', text: prompt }
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
      if (!jsonMatch) {
        return res.status(200).json({ success: false, error: 'Kein JSON in Antwort', raw: rawText, fileName, pageNumber });
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return res.status(200).json({ success: true, result: parsed });

    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(200).json({ success: false, error: `Timeout nach 25s | Datei: ${fileName} | Seite: ${pageNumber}` });
      }
      throw fetchErr;
    }

  } catch (err) {
    return res.status(500).json({ error: err.message, fileName, pageNumber });
  }
}
