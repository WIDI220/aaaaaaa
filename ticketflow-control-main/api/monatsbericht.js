import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month fehlt' });

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );

  const [year, mon] = month.split('-');
  const from = `${year}-${mon}-01`;
  const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
  const to = `${year}-${mon}-${String(lastDay).padStart(2, '0')}`;
  const prev = getPrevMonth(month);

  const [{ data: tickets }, { data: worklogs }, { data: employees }, { data: prevWorklogs }] = await Promise.all([
    supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to),
    supabase.from('ticket_worklogs').select('*, employees(id,name,kuerzel,gewerk)').gte('leistungsdatum', from).lte('leistungsdatum', to),
    supabase.from('employees').select('*').eq('aktiv', true).order('name'),
    supabase.from('ticket_worklogs').select('stunden, employees(gewerk)').gte('leistungsdatum', prev.from).lte('leistungsdatum', prev.to),
  ]);

  const t = tickets ?? [];
  const w = worklogs ?? [];
  const e = employees ?? [];
  const pw = prevWorklogs ?? [];

  const totalH = w.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const prevTotalH = pw.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const erledigtCount = t.filter(x => ['erledigt','abrechenbar','abgerechnet'].includes(x.status)).length;
  const offenCount = t.filter(x => x.status === 'in_bearbeitung').length;
  const hochbauH = w.filter(x => x.employees?.gewerk === 'Hochbau').reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const elektroH = w.filter(x => x.employees?.gewerk === 'Elektro').reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const erledigungsQuote = t.length > 0 ? Math.round(erledigtCount / t.length * 100) : 0;
  const avgHperTicket = erledigtCount > 0 ? (totalH / erledigtCount).toFixed(2) : '–';

  const empStats = e.map(emp => {
    const logs = w.filter(x => x.employee_id === emp.id);
    const stunden = logs.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
    const ticketIds = new Set(logs.map(x => x.ticket_id));
    const avg = ticketIds.size > 0 ? (stunden / ticketIds.size).toFixed(2) : '–';
    return { ...emp, stunden: Math.round(stunden * 100) / 100, tickets: ticketIds.size, avg };
  }).filter(x => x.stunden > 0).sort((a, b) => b.stunden - a.stunden);

  const monthName = new Date(parseInt(year), parseInt(mon) - 1, 1)
    .toLocaleString('de-DE', { month: 'long', year: 'numeric' });

  const veraenderung = prevTotalH > 0 ? ((totalH - prevTotalH) / prevTotalH * 100).toFixed(1) : null;

  const html = generateHTML({ monthName, month, t, w, e: empStats, totalH, prevTotalH,
    veraenderung, erledigtCount, offenCount, hochbauH, elektroH, erledigungsQuote, avgHperTicket });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
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

function bar(value, max, color, height = 8) {
  const w = max > 0 ? Math.round(value / max * 100) : 0;
  return `<div style="background:#f1f5f9;border-radius:99px;height:${height}px;overflow:hidden;">
    <div style="background:${color};height:${height}px;border-radius:99px;width:${w}%;transition:width 0.3s;"></div>
  </div>`;
}

function statusBadge(status) {
  const map = {
    'in_bearbeitung': ['In Bearbeitung','#dbeafe','#1d4ed8'],
    'erledigt': ['Erledigt','#dcfce7','#16a34a'],
    'zur_unterschrift': ['Zur Unterschrift','#fef9c3','#ca8a04'],
    'abrechenbar': ['Abrechenbar','#ffedd5','#ea580c'],
    'abgerechnet': ['Abgerechnet','#f1f5f9','#475569'],
  };
  const [label, bg, color] = map[status] ?? [status,'#f1f5f9','#475569'];
  return `<span style="background:${bg};color:${color};padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;">${label}</span>`;
}

function svgBarChart(data, width = 480, height = 160) {
  if (!data.length) return '';
  const pad = { top: 10, right: 10, bottom: 30, left: 30 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = Math.floor(chartW / data.length * 0.6);
  const gap = chartW / data.length;
  const COLORS = ['#1e3a5f','#0ea5e9','#f97316','#8b5cf6','#22c55e','#ec4899','#14b8a6','#f59e0b'];

  const bars = data.map((d, i) => {
    const x = pad.left + i * gap + (gap - barW) / 2;
    const barH = Math.round(d.value / maxVal * chartH);
    const y = pad.top + chartH - barH;
    const color = COLORS[i % COLORS.length];
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${color}" opacity="0.9"/>
      <text x="${x + barW/2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#64748b">${d.value}</text>
      <text x="${x + barW/2}" y="${pad.top + chartH + 18}" text-anchor="middle" font-size="10" fill="#94a3b8">${d.label}</text>`;
  }).join('');

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + chartH}" stroke="#e2e8f0" stroke-width="1"/>
    <line x1="${pad.left}" y1="${pad.top + chartH}" x2="${width - pad.right}" y2="${pad.top + chartH}" stroke="#e2e8f0" stroke-width="1"/>
    ${bars}
  </svg>`;
}

function generateHTML({ monthName, t, w, e, totalH, prevTotalH, veraenderung,
  erledigtCount, offenCount, hochbauH, elektroH, erledigungsQuote, avgHperTicket }) {

  const COLORS = ['#1e3a5f','#0ea5e9','#f97316','#8b5cf6','#22c55e','#ec4899','#14b8a6','#f59e0b'];
  const maxH = Math.max(...e.map(x => x.stunden), 1);
  const maxGewerk = Math.max(hochbauH, elektroH, 1);
  const trend = veraenderung !== null
    ? (parseFloat(veraenderung) >= 0 ? `▲ +${veraenderung}%` : `▼ ${veraenderung}%`)
    : '–';
  const trendBg = veraenderung !== null
    ? (parseFloat(veraenderung) >= 0 ? '#dcfce7' : '#fee2e2')
    : '#f1f5f9';
  const trendColor = veraenderung !== null
    ? (parseFloat(veraenderung) >= 0 ? '#16a34a' : '#dc2626')
    : '#64748b';

  // SVG Chart für Mitarbeiter-Stunden
  const chartData = e.map(emp => ({ label: emp.kuerzel, value: emp.stunden }));
  const stundenChart = svgBarChart(chartData, 500, 160);

  // SVG Chart Tickets pro MA
  const ticketChartData = e.map(emp => ({ label: emp.kuerzel, value: emp.tickets }));
  const ticketsChart = svgBarChart(ticketChartData, 500, 160);

  const empRows = e.map((emp, i) => `
    <tr>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${COLORS[i%COLORS.length]};flex-shrink:0;"></div>
          <div>
            <span style="font-weight:700;font-family:monospace;color:#1e3a5f;">${emp.kuerzel}</span>
            <span style="color:#64748b;font-size:12px;margin-left:6px;">${emp.name}</span>
          </div>
        </div>
      </td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;text-align:center;">
        <span style="background:#f1f5f9;border-radius:6px;padding:2px 10px;font-size:12px;color:#475569;">${emp.gewerk}</span>
      </td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:800;font-size:16px;color:#1e3a5f;">${emp.stunden}h</td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${emp.tickets}</td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;text-align:right;color:#64748b;font-size:12px;">${emp.avg}h</td>
      <td style="padding:11px 14px;border-bottom:1px solid #f1f5f9;min-width:120px;">
        ${bar(emp.stunden, maxH, COLORS[i%COLORS.length], 8)}
        <span style="font-size:11px;color:#94a3b8;">${totalH > 0 ? Math.round(emp.stunden/totalH*100) : 0}% des Teams</span>
      </td>
    </tr>`).join('');

  const ticketRows = t.slice(0, 60).map(ticket => {
    const tW = w.filter(x => x.ticket_id === ticket.id);
    const tH = tW.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
    const ma = [...new Set(tW.map(x => x.employees?.kuerzel).filter(Boolean))].join(', ');
    return `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #f8fafc;font-family:monospace;font-weight:700;font-size:12px;color:#1e3a5f;">${ticket.a_nummer}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f8fafc;font-size:12px;color:#64748b;">${ticket.gewerk??'–'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f8fafc;">${statusBadge(ticket.status)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f8fafc;font-size:12px;color:#94a3b8;">${ticket.eingangsdatum ? new Date(ticket.eingangsdatum).toLocaleDateString('de-DE') : '–'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f8fafc;font-size:12px;text-align:center;font-family:monospace;">${ma||'–'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f8fafc;text-align:right;font-weight:700;font-size:12px;">${tH>0?tH+'h':'–'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monatsbericht ${monthName} – WIDI</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;color:#1e293b;font-size:14px;}
  @media print{
    body{background:white;}
    .no-print{display:none!important;}
    .page-break{page-break-before:always;}
    .card{box-shadow:none!important;border:1px solid #e2e8f0!important;}
  }
  .card{background:white;border-radius:14px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:20px;}
  .section-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:18px;}
</style>
</head>
<body>

<div class="no-print" style="position:fixed;top:20px;right:20px;z-index:999;display:flex;gap:10px;">
  <button onclick="window.print()" style="background:#1e3a5f;color:white;border:none;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(30,58,95,0.35);">
    ⬇ Als PDF speichern
  </button>
</div>

<div style="max-width:960px;margin:0 auto;padding:40px 20px;">

  <!-- HEADER -->
  <div style="background:linear-gradient(135deg,#1a3356 0%,#0f2440 50%,#0ea5e9 100%);border-radius:18px;padding:44px 40px;color:white;margin-bottom:24px;position:relative;overflow:hidden;">
    <div style="position:absolute;right:-30px;top:-30px;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,0.05);"></div>
    <div style="position:absolute;right:60px;top:30px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.05);"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;position:relative;">
      <div>
        <p style="font-size:12px;opacity:0.6;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px;">WIDI Gebäudeservice GmbH</p>
        <h1 style="font-size:42px;font-weight:900;letter-spacing:-1px;margin-bottom:4px;">Monatsbericht</h1>
        <h2 style="font-size:24px;font-weight:300;opacity:0.85;">${monthName}</h2>
      </div>
      <div style="text-align:right;opacity:0.7;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;">Erstellt am</p>
        <p style="font-size:18px;font-weight:600;margin-top:2px;">${new Date().toLocaleDateString('de-DE')}</p>
      </div>
    </div>
  </div>

  <!-- KPI KARTEN -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">
    ${[
      { label:'Tickets gesamt', value: t.length, icon:'🎫', bg:'#eff6ff', accent:'#1e3a5f' },
      { label:'Stunden gesamt', value: totalH.toFixed(1)+'h', icon:'⏱', bg:'#f0fdf4', accent:'#16a34a' },
      { label:'Erledigungsquote', value: erledigungsQuote+'%', icon:'✅', bg:'#f0fdf4', accent:'#16a34a' },
      { label:'Ø Std / Ticket', value: avgHperTicket+'h', icon:'📊', bg:'#faf5ff', accent:'#7c3aed' },
    ].map(k => `
    <div style="background:${k.bg};border-radius:14px;padding:22px;border:1.5px solid rgba(0,0,0,0.06);">
      <div style="font-size:26px;margin-bottom:10px;">${k.icon}</div>
      <div style="font-size:30px;font-weight:900;color:${k.accent};line-height:1;">${k.value}</div>
      <div style="font-size:12px;color:#64748b;margin-top:5px;font-weight:500;">${k.label}</div>
    </div>`).join('')}
  </div>

  <!-- STATUS + VERGLEICH -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">

    <!-- Status Übersicht -->
    <div class="card">
      <p class="section-title">Status Übersicht</p>
      ${[
        ['In Bearbeitung', offenCount, '#dbeafe', '#1d4ed8'],
        ['Erledigt', t.filter(x=>x.status==='erledigt').length, '#dcfce7', '#16a34a'],
        ['Zur Unterschrift', t.filter(x=>x.status==='zur_unterschrift').length, '#fef9c3', '#ca8a04'],
        ['Abrechenbar', t.filter(x=>x.status==='abrechenbar').length, '#ffedd5', '#ea580c'],
        ['Abgerechnet', erledigtCount, '#f1f5f9', '#475569'],
      ].map(([label, count, bg, color]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f8fafc;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
          <span style="font-size:13px;">${label}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-weight:700;font-size:16px;color:${color};">${count}</span>
          <span style="font-size:11px;color:#94a3b8;">${t.length > 0 ? Math.round(count/t.length*100) : 0}%</span>
        </div>
      </div>`).join('')}
    </div>

    <!-- Vergleich + Gewerk -->
    <div class="card">
      <p class="section-title">Vormonatsvergleich & Gewerk</p>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:10px;">
        <div style="text-align:center;">
          <p style="font-size:11px;color:#94a3b8;margin-bottom:2px;">Vormonat</p>
          <p style="font-size:22px;font-weight:700;color:#94a3b8;">${prevTotalH.toFixed(1)}h</p>
        </div>
        <div style="font-size:20px;color:#cbd5e1;">→</div>
        <div style="text-align:center;">
          <p style="font-size:11px;color:#1e3a5f;margin-bottom:2px;">Aktuell</p>
          <p style="font-size:28px;font-weight:900;color:#1e3a5f;">${totalH.toFixed(1)}h</p>
        </div>
        <div style="margin-left:auto;background:${trendBg};padding:8px 14px;border-radius:8px;">
          <span style="font-weight:800;color:${trendColor};font-size:15px;">${trend}</span>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <span style="font-size:13px;font-weight:600;">Hochbau</span>
          <span style="font-weight:700;color:#1e3a5f;">${hochbauH.toFixed(1)}h</span>
        </div>
        ${bar(hochbauH, maxGewerk, '#1e3a5f', 10)}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <span style="font-size:13px;font-weight:600;">Elektro</span>
          <span style="font-weight:700;color:#0ea5e9;">${elektroH.toFixed(1)}h</span>
        </div>
        ${bar(elektroH, maxGewerk, '#0ea5e9', 10)}
      </div>
    </div>
  </div>

  <!-- CHARTS -->
  ${e.length > 0 ? `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
    <div class="card">
      <p class="section-title">Stunden pro Mitarbeiter</p>
      <div style="overflow-x:auto;">${stundenChart}</div>
    </div>
    <div class="card">
      <p class="section-title">Tickets pro Mitarbeiter</p>
      <div style="overflow-x:auto;">${ticketsChart}</div>
    </div>
  </div>` : ''}

  <!-- MITARBEITER TABELLE -->
  <div class="card" style="margin-bottom:20px;">
    <p class="section-title">Mitarbeiter Auswertung</p>
    ${e.length === 0 ? '<p style="color:#94a3b8;text-align:center;padding:20px;">Keine Buchungen in diesem Monat</p>' : `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0;">
          <th style="text-align:left;padding:9px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Mitarbeiter</th>
          <th style="text-align:center;padding:9px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Gewerk</th>
          <th style="text-align:right;padding:9px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Stunden</th>
          <th style="text-align:right;padding:9px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Tickets</th>
          <th style="text-align:right;padding:9px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Ø Std/Ticket</th>
          <th style="padding:9px 14px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Anteil</th>
        </tr>
      </thead>
      <tbody>${empRows}</tbody>
    </table>`}
  </div>

  <!-- TICKET LISTE -->
  <div class="card page-break">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
      <p class="section-title" style="margin-bottom:0;">Alle Tickets ${t.length > 60 ? `(${t.length} gesamt, erste 60)` : `(${t.length})`}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0;">
          <th style="text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">A-Nummer</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Gewerk</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Status</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Eingang</th>
          <th style="text-align:center;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Mitarbeiter</th>
          <th style="text-align:right;padding:8px 12px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;">Stunden</th>
        </tr>
      </thead>
      <tbody>${ticketRows}</tbody>
    </table>
  </div>

  <!-- FOOTER -->
  <div style="text-align:center;padding:24px;color:#94a3b8;font-size:12px;">
    <div style="width:40px;height:2px;background:#1e3a5f;margin:0 auto 12px;border-radius:2px;"></div>
    <p style="font-weight:600;color:#64748b;">WIDI Gebäudeservice GmbH</p>
    <p style="margin-top:4px;">Monatsbericht ${monthName} · Erstellt am ${new Date().toLocaleDateString('de-DE')} · WIDI Controlling System</p>
  </div>

</div>
</body>
</html>`;
}
