import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { month } = req.query; // Format: "2026-01"
  if (!month) return res.status(400).json({ error: 'month fehlt' });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  const [year, mon] = month.split('-');
  const from = `${year}-${mon}-01`;
  const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
  const to = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;

  // Daten laden
  const [{ data: tickets }, { data: worklogs }, { data: employees }, { data: prevWorklogs }] = await Promise.all([
    supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to),
    supabase.from('ticket_worklogs').select('*, employees(name, kuerzel, gewerk)').gte('leistungsdatum', from).lte('leistungsdatum', to),
    supabase.from('employees').select('*').eq('aktiv', true),
    // Vormonat für Vergleich
    supabase.from('ticket_worklogs').select('stunden, employees(gewerk)')
      .gte('leistungsdatum', getPrevMonth(month).from)
      .lte('leistungsdatum', getPrevMonth(month).to),
  ]);

  const t = tickets ?? [];
  const w = worklogs ?? [];
  const e = employees ?? [];
  const pw = prevWorklogs ?? [];

  // Berechnungen
  const totalH = w.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const prevTotalH = pw.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const erledigtCount = t.filter(x => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const offenCount = t.filter(x => x.status === 'in_bearbeitung').length;
  const hochbauH = w.filter(x => x.employees?.gewerk === 'Hochbau').reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const elektroH = w.filter(x => x.employees?.gewerk === 'Elektro').reduce((s, x) => s + Number(x.stunden ?? 0), 0);

  // Mitarbeiter Stats
  const empStats = e.map(emp => {
    const logs = w.filter(x => x.employee_id === emp.id);
    const stunden = logs.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
    const ticketIds = new Set(logs.map(x => x.ticket_id));
    return { ...emp, stunden: Math.round(stunden * 100) / 100, tickets: ticketIds.size };
  }).filter(x => x.stunden > 0).sort((a, b) => b.stunden - a.stunden);

  // Top Mitarbeiter
  const topMitarbeiter = empStats[0];

  const monthName = new Date(parseInt(year), parseInt(mon) - 1, 1)
    .toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const veraenderung = prevTotalH > 0 ? ((totalH - prevTotalH) / prevTotalH * 100).toFixed(1) : null;

  // HTML für PDF generieren - modernes Design
  const html = generateHTML({
    monthName, month, t, w, empStats, totalH, prevTotalH, veraenderung,
    erledigtCount, offenCount, hochbauH, elektroH, topMitarbeiter,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Month', month);
  res.status(200).send(html);
}

function getPrevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  const py = d.getFullYear();
  const pm = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(py, d.getMonth() + 1, 0).getDate();
  return { from: `${py}-${pm}-01`, to: `${py}-${pm}-${lastDay}` };
}

function generateHTML({ monthName, t, w, empStats, totalH, prevTotalH, veraenderung,
  erledigtCount, offenCount, hochbauH, elektroH, topMitarbeiter }) {

  const COLORS = ['#1e3a5f','#0ea5e9','#f97316','#8b5cf6','#22c55e','#ec4899','#14b8a6','#f59e0b'];

  const trend = veraenderung !== null
    ? (parseFloat(veraenderung) >= 0 ? `▲ ${veraenderung}%` : `▼ ${Math.abs(parseFloat(veraenderung))}%`)
    : '–';
  const trendColor = veraenderung !== null
    ? (parseFloat(veraenderung) >= 0 ? '#22c55e' : '#ef4444')
    : '#6b7280';

  // Stunden-Balken für Mitarbeiter (max normalisieren)
  const maxH = Math.max(...empStats.map(e => e.stunden), 1);

  const empRows = empStats.map((e, i) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLORS[i % COLORS.length]};margin-right:8px;"></span>
        <strong>${e.kuerzel}</strong> <span style="color:#64748b;font-size:12px;">${e.name}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:center;">
        <span style="background:#f1f5f9;border-radius:4px;padding:2px 8px;font-size:12px;">${e.gewerk}</span>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#1e3a5f;">${e.stunden}h</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;">${e.tickets}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;width:140px;">
        <div style="background:#f1f5f9;border-radius:99px;height:8px;overflow:hidden;">
          <div style="background:${COLORS[i % COLORS.length]};height:8px;border-radius:99px;width:${Math.round(e.stunden/maxH*100)}%;"></div>
        </div>
        <span style="font-size:11px;color:#94a3b8;">${totalH > 0 ? Math.round(e.stunden/totalH*100) : 0}%</span>
      </td>
    </tr>`).join('');

  // Ticket Tabelle (max 50)
  const ticketRows = t.slice(0, 50).map(ticket => {
    const tWorklogs = w.filter(x => x.ticket_id === ticket.id);
    const tH = tWorklogs.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
    const mitarbeiter = [...new Set(tWorklogs.map(x => x.employees?.kuerzel).filter(Boolean))].join(', ');
    const statusLabels = { 'in_bearbeitung':'In Bearbeitung','erledigt':'Erledigt','zur_unterschrift':'Zur Unterschrift','abrechenbar':'Abrechenbar','abgerechnet':'Abgerechnet' };
    const statusColors = { 'in_bearbeitung':'#dbeafe;color:#1d4ed8','erledigt':'#dcfce7;color:#16a34a','zur_unterschrift':'#fef9c3;color:#ca8a04','abrechenbar':'#ffedd5;color:#ea580c','abgerechnet':'#f1f5f9;color:#475569' };
    const sc = statusColors[ticket.status] ?? '#f1f5f9;color:#475569';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f8fafc;font-family:monospace;font-size:12px;font-weight:600;">${ticket.a_nummer}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f8fafc;font-size:12px;">${ticket.gewerk ?? '–'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f8fafc;">
        <span style="background:${sc.split(';')[0].replace('background:','')};color:${sc.split('color:')[1]};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;">${statusLabels[ticket.status] ?? ticket.status}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f8fafc;font-size:12px;color:#64748b;">${ticket.eingangsdatum ? new Date(ticket.eingangsdatum).toLocaleDateString('de-DE') : '–'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f8fafc;font-size:12px;text-align:center;">${mitarbeiter || '–'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f8fafc;font-size:12px;text-align:right;font-weight:600;">${tH > 0 ? tH + 'h' : '–'}</td>
    </tr>`;
  }).join('');

  // Gewerk Balken
  const maxGewerk = Math.max(hochbauH, elektroH, 1);

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#f8fafc; color:#1e293b; }
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>

<!-- PRINT BUTTON -->
<div class="no-print" style="position:fixed;top:20px;right:20px;z-index:999;">
  <button onclick="window.print()" style="background:#1e3a5f;color:white;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(30,58,95,0.3);">
    ⬇ PDF speichern
  </button>
</div>

<div style="max-width:900px;margin:0 auto;padding:40px 20px;">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0ea5e9 100%);border-radius:16px;padding:40px;color:white;margin-bottom:32px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <p style="font-size:13px;opacity:0.8;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">WIDI Gebäudeservice GmbH</p>
        <h1 style="font-size:36px;font-weight:800;margin-bottom:4px;">Monatsbericht</h1>
        <h2 style="font-size:22px;font-weight:400;opacity:0.9;">${monthName}</h2>
      </div>
      <div style="text-align:right;">
        <p style="font-size:13px;opacity:0.7;">Erstellt am</p>
        <p style="font-size:16px;font-weight:600;">${new Date().toLocaleDateString('de-DE')}</p>
      </div>
    </div>
  </div>

  <!-- KPI KARTEN -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;">
    ${[
      { label:'Tickets gesamt', value: t.length, icon:'🎫', bg:'#eff6ff', border:'#bfdbfe' },
      { label:'Stunden gesamt', value: totalH.toFixed(1)+'h', icon:'⏱', bg:'#f0fdf4', border:'#bbf7d0' },
      { label:'Erledigt', value: erledigtCount, icon:'✅', bg:'#f0fdf4', border:'#bbf7d0' },
      { label:'Noch offen', value: offenCount, icon:'🔄', bg:'#fff7ed', border:'#fed7aa' },
    ].map(k => `
    <div style="background:${k.bg};border:1.5px solid ${k.border};border-radius:12px;padding:20px;">
      <div style="font-size:28px;margin-bottom:8px;">${k.icon}</div>
      <div style="font-size:28px;font-weight:800;color:#1e293b;">${k.value}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">${k.label}</div>
    </div>`).join('')}
  </div>

  <!-- VERGLEICH + GEWERK -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px;">
    
    <!-- Vormonatsvergleich -->
    <div style="background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <h3 style="font-size:14px;color:#64748b;margin-bottom:16px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Vormonatsvergleich</h3>
      <div style="display:flex;align-items:flex-end;gap:20px;">
        <div>
          <p style="font-size:12px;color:#94a3b8;">Vormonat</p>
          <p style="font-size:24px;font-weight:700;color:#94a3b8;">${prevTotalH.toFixed(1)}h</p>
        </div>
        <div style="font-size:24px;color:#94a3b8;">→</div>
        <div>
          <p style="font-size:12px;color:#1e3a5f;">Aktuell</p>
          <p style="font-size:32px;font-weight:800;color:#1e3a5f;">${totalH.toFixed(1)}h</p>
        </div>
      </div>
      <div style="margin-top:12px;padding:8px 14px;background:${parseFloat(veraenderung??'0')>=0?'#dcfce7':'#fee2e2'};border-radius:8px;display:inline-block;">
        <span style="font-weight:700;color:${trendColor};font-size:16px;">${trend} zum Vormonat</span>
      </div>
    </div>

    <!-- Gewerk -->
    <div style="background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <h3 style="font-size:14px;color:#64748b;margin-bottom:16px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Gewerk-Aufteilung</h3>
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:600;">Hochbau</span>
          <span style="font-size:13px;font-weight:700;color:#1e3a5f;">${hochbauH.toFixed(1)}h</span>
        </div>
        <div style="background:#f1f5f9;border-radius:99px;height:10px;">
          <div style="background:#1e3a5f;height:10px;border-radius:99px;width:${Math.round(hochbauH/maxGewerk*100)}%;"></div>
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:600;">Elektro</span>
          <span style="font-size:13px;font-weight:700;color:#0ea5e9;">${elektroH.toFixed(1)}h</span>
        </div>
        <div style="background:#f1f5f9;border-radius:99px;height:10px;">
          <div style="background:#0ea5e9;height:10px;border-radius:99px;width:${Math.round(elektroH/maxGewerk*100)}%;"></div>
        </div>
      </div>
      ${topMitarbeiter ? `
      <div style="margin-top:16px;padding:10px 14px;background:#fef9c3;border-radius:8px;">
        <span style="font-size:12px;color:#92400e;">⭐ Top Mitarbeiter: <strong>${topMitarbeiter.name}</strong> mit ${topMitarbeiter.stunden}h</span>
      </div>` : ''}
    </div>
  </div>

  <!-- MITARBEITER TABELLE -->
  <div style="background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:32px;">
    <h3 style="font-size:14px;color:#64748b;margin-bottom:20px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Mitarbeiter Auswertung</h3>
    ${empStats.length === 0 ? '<p style="color:#94a3b8;text-align:center;padding:20px;">Keine Buchungen in diesem Monat</p>' : `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0;">
          <th style="text-align:left;padding:8px 14px;font-size:12px;color:#94a3b8;font-weight:600;">MITARBEITER</th>
          <th style="text-align:center;padding:8px 14px;font-size:12px;color:#94a3b8;font-weight:600;">GEWERK</th>
          <th style="text-align:right;padding:8px 14px;font-size:12px;color:#94a3b8;font-weight:600;">STUNDEN</th>
          <th style="text-align:right;padding:8px 14px;font-size:12px;color:#94a3b8;font-weight:600;">TICKETS</th>
          <th style="padding:8px 14px;font-size:12px;color:#94a3b8;font-weight:600;">ANTEIL</th>
        </tr>
      </thead>
      <tbody>${empRows}</tbody>
    </table>`}
  </div>

  <!-- TICKET LISTE -->
  <div class="page-break" style="background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:32px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <h3 style="font-size:14px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Alle Tickets ${t.length > 50 ? `(${t.length} gesamt, erste 50 angezeigt)` : `(${t.length})`}</h3>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0;">
          <th style="text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:600;">A-NUMMER</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:600;">GEWERK</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:600;">STATUS</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:600;">EINGANG</th>
          <th style="text-align:center;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:600;">MITARBEITER</th>
          <th style="text-align:right;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:600;">STUNDEN</th>
        </tr>
      </thead>
      <tbody>${ticketRows}</tbody>
    </table>
  </div>

  <!-- FOOTER -->
  <div style="text-align:center;padding:20px;color:#94a3b8;font-size:12px;">
    <p>WIDI Gebäudeservice GmbH · Monatsbericht ${monthName} · Erstellt mit WIDI Controlling</p>
  </div>

</div>
</body>
</html>`;
}
