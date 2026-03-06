// Diese Datei wird nicht mehr genutzt - E-Mail Versand läuft über EmailJS direkt im Browser
export default async function handler(req, res) {
  res.status(410).json({ error: 'Nicht mehr genutzt - EmailJS wird verwendet' });
}
