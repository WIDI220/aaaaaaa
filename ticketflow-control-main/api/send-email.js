export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY fehlt' });

  const { to, subject, note, tickets, senderName } = req.body;
  if (!to || !subject || !tickets?.length) return res.status(400).json({ error: 'to, subject und tickets erforderlich' });

  const statusLabels = {
    'in_bearbeitung': 'In Bearbeitung',
    'erledigt': 'Erledigt',
    'zur_unterschrift': 'Zur Unterschrift',
    'abrechenbar': 'Abrechenbar',
    'abgerechnet': 'Abgerechnet',
  };
  const statusColors = {
    'in_bearbeitung': '#dbeafe;color:#1d4ed8',
    'erledigt': '#dcfce7;color:#16a34a',
    'zur_unterschrift': '#fef9c3;color:#ca8a04',
    'abrechenbar': '#ffedd5;color:#ea580c',
    'abgerechnet': '#f1f5f9;color:#475569',
  };

  const ticketRows = tickets.map(t => {
    const sc = statusColors[t.status] ?? '#f1f5f9;color:#475569';
    const [bg, color] = sc.split(';color:');
    return `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-weight:700;color:#1e3a5f;">${t.a_nummer}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#64748b;">${t.gewerk ?? '–'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
        <span style="background:${bg};color:#${color};padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;">${statusLabels[t.status] ?? t.status}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#64748b;">${t.eingangsdatum ? new Date(t.eingangsdatum).toLocaleDateString('de-DE') : '–'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-family:monospace;color:#374151;">${t.mitarbeiter ?? '–'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;margin:0;padding:0;">
<div style="max-width:700px;margin:0 auto;padding:32px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a3356,#0ea5e9);border-radius:16px;padding:32px 36px;color:white;margin-bottom:24px;">
    <p style="font-size:11px;opacity:0.6;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">WIDI Gebäudeservice GmbH · Ticket-Rückmeldung</p>
    <h1 style="font-size:28px;font-weight:900;margin-bottom:4px;">${subject}</h1>
    <p style="opacity:0.75;font-size:14px;">Gesendet von: ${senderName ?? 'WIDI Controlling'}</p>
  </div>

  <!-- Anliegen -->
  ${note ? `<div style="background:white;border-radius:12px;padding:24px 28px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,0.07);">
    <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Anliegen / Begründung</p>
    <p style="color:#374151;line-height:1.7;font-size:14px;">${note.replace(/\n/g, '<br>')}</p>
  </div>` : ''}

  <!-- Tickets -->
  <div style="background:white;border-radius:12px;padding:24px 28px;box-shadow:0 1px 3px rgba(0,0,0,0.07);">
    <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Betroffene Tickets (${tickets.length})</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0;">
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">A-Nummer</th>
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Gewerk</th>
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Status</th>
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Eingang</th>
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Mitarbeiter</th>
        </tr>
      </thead>
      <tbody>${ticketRows}</tbody>
    </table>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:24px;color:#94a3b8;font-size:12px;">
    <p>WIDI Gebäudeservice GmbH · WIDI Controlling System · ${new Date().toLocaleDateString('de-DE')}</p>
  </div>
</div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'WIDI Controlling <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: data.message ?? 'Resend Fehler' });
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
