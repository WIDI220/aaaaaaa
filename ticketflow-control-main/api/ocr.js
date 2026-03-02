export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 fehlt' });

    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GOOGLE_VISION_API_KEY fehlt' });

    // Google Vision OCR aufrufen
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }]
          }]
        })
      }
    );

    if (!visionRes.ok) {
      const err = await visionRes.text();
      return res.status(200).json({ success: false, error: `Google Vision Fehler: ${err.slice(0, 200)}` });
    }

    const visionData = await visionRes.json();
    const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text ?? '';

    if (!fullText) {
      return res.status(200).json({ success: false, error: 'Kein Text erkannt' });
    }

    // Daten aus dem erkannten Text extrahieren
    const result = extractFields(fullText);
    return res.status(200).json({ success: true, result, raw: fullText });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function extractFields(text) {
  // A-Nummer extrahieren
  const aNummerMatch = text.match(/A2[0-9]-\d{4,6}/);
  const a_nummer = aNummerMatch ? aNummerMatch[0] : null;

  // Werkstatt extrahieren
  let werkstatt = null;
  if (text.includes('Hochbau')) werkstatt = 'Hochbau';
  else if (text.includes('Elektrotechnik') || text.includes('Elektro')) werkstatt = 'Elektrotechnik';
  else if (text.includes('Nachrichtentechnik')) werkstatt = 'Nachrichtentechnik';

  // Mitarbeiter-Namen aus bekannter Liste erkennen
  const mitarbeiterListe = [
    'Frank Werner', 'Uwe Gräwe', 'Tarik Alkan', 'Timo Bartelt',
    'Matthias Kubista', 'Christoph Epe', 'Christoph Reitz',
    'Sigrid Büter', 'Stefan Giesmann'
  ];
  let mitarbeiter_name = null;
  for (const name of mitarbeiterListe) {
    const lastName = name.split(' ')[1];
    if (text.includes(name) || text.includes(lastName)) {
      mitarbeiter_name = name;
      break;
    }
  }

  // Datum extrahieren - suche nach DD.MM.YY oder DD.MM.YYYY Muster in der Tabelle
  let leistungsdatum = null;
  const datumsMatches = text.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g);
  const daten = [];
  for (const m of datumsMatches) {
    let year = parseInt(m[3]);
    if (year < 100) year += 2000;
    const month = parseInt(m[2]);
    const day = parseInt(m[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020) {
      daten.push({ str: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`, year, month, day });
    }
  }
  // Beauftragt-Datum ausschließen (steht oben), nehme das letzte/unterste Datum
  if (daten.length > 0) {
    // Filtere Auftragsdatum (erstes) heraus, nimm das handschriftliche
    leistungsdatum = daten[daten.length > 1 ? daten.length - 1 : 0].str;
  }

  // Stunden extrahieren - suche nach Zahlen wie 0,5 / 1,5 / 2,5 etc. in Std.-Spalte
  let stunden_gesamt = null;
  const stundenMatches = text.matchAll(/(\d+)[,.](\d+)\s*[hH]?/g);
  const stundenWerte = [];
  for (const m of stundenMatches) {
    const val = parseFloat(`${m[1]}.${m[2]}`);
    if (val > 0 && val <= 24) stundenWerte.push(val);
  }
  // Auch ganze Stunden
  const ganzeStunden = text.matchAll(/\b([1-9])\s*[hH]\b/g);
  for (const m of ganzeStunden) {
    stundenWerte.push(parseInt(m[1]));
  }
  if (stundenWerte.length > 0) {
    stunden_gesamt = Math.round(stundenWerte.reduce((a, b) => a + b, 0) * 100) / 100;
    // Sicherheitscheck - max 20h pro Seite
    if (stunden_gesamt > 20) stunden_gesamt = stundenWerte[0];
  }

  const konfidenz = a_nummer ? (mitarbeiter_name ? 0.9 : 0.6) : 0.2;

  return { a_nummer, werkstatt, mitarbeiter_name, leistungsdatum, stunden_gesamt, konfidenz };
}
