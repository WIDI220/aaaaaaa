import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month fehlt' });

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const [year, mon] = month.split('-');
  const from = `${year}-${mon}-01`;
  const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
  const to = `${year}-${mon}-${String(lastDay).padStart(2,'0')}`;
  const prev = getPrevMonth(month);

  const [{ data: tickets }, { data: worklogs }, { data: employees }, { data: prevWorklogs }] = await Promise.all([
    supabase.from('tickets').select('*').gte('eingangsdatum', from).lte('eingangsdatum', to).order('eingangsdatum'),
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
  const unterschriftCount = t.filter(x => x.status === 'zur_unterschrift').length;
  const abrechenbarCount = t.filter(x => x.status === 'abrechenbar').length;
  const abgerechnetCount = t.filter(x => x.status === 'abgerechnet').length;
  const hochbauTickets = t.filter(x => x.gewerk === 'Hochbau');
  const elektroTickets = t.filter(x => x.gewerk === 'Elektro');
  const hochbauH = w.filter(x => x.employees?.gewerk === 'Hochbau').reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const elektroH = w.filter(x => x.employees?.gewerk === 'Elektro').reduce((s, x) => s + Number(x.stunden ?? 0), 0);
  const erledigungsQuote = t.length > 0 ? Math.round(erledigtCount / t.length * 100) : 0;
  const avgHperTicket = erledigtCount > 0 ? (totalH / erledigtCount).toFixed(2) : '–';
  const veraenderung = prevTotalH > 0 ? ((totalH - prevTotalH) / prevTotalH * 100).toFixed(1) : null;

  const empStats = e.map(emp => {
    const logs = w.filter(x => x.employee_id === emp.id);
    const stunden = logs.reduce((s, x) => s + Number(x.stunden ?? 0), 0);
    const ticketIds = new Set(logs.map(x => x.ticket_id));
    const avg = ticketIds.size > 0 ? (stunden / ticketIds.size).toFixed(2) : '0';
    return { ...emp, stunden: Math.round(stunden * 100) / 100, tickets: ticketIds.size, avg };
  }).filter(x => x.stunden > 0).sort((a, b) => b.stunden - a.stunden);

  const monthName = new Date(parseInt(year), parseInt(mon)-1, 1).toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  const html = generateHTML({ monthName, month, t, w, e: empStats, totalH, prevTotalH,
    veraenderung, erledigtCount, offenCount, unterschriftCount, abrechenbarCount, abgerechnetCount,
    hochbauTickets, elektroTickets, hochbauH, elektroH, erledigungsQuote, avgHperTicket });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}

function getPrevMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m-2, 1);
  const py = d.getFullYear(), pm = String(d.getMonth()+1).padStart(2,'0');
  return { from: `${py}-${pm}-01`, to: `${py}-${pm}-${new Date(py, d.getMonth()+1, 0).getDate()}` };
}

function pct(val, total) { return total > 0 ? Math.round(val/total*100) : 0; }

function svgBar(data, W=820, H=180) {
  if (!data.length) return '';
  const pad = {t:20,r:10,b:40,l:40};
  const cW = W-pad.l-pad.r, cH = H-pad.t-pad.b;
  const maxV = Math.max(...data.map(d=>d.value), 1);
  const bW = Math.floor(cW/data.length*0.55);
  const gap = cW/data.length;
  const COLORS = ['#1e3a5f','#0ea5e9','#f97316','#8b5cf6','#22c55e','#ec4899','#14b8a6','#f59e0b','#6366f1'];
  const bars = data.map((d,i) => {
    const x = pad.l + i*gap + (gap-bW)/2;
    const bH = Math.max(Math.round(d.value/maxV*cH), 2);
    const y = pad.t+cH-bH;
    return `<rect x="${x}" y="${y}" width="${bW}" height="${bH}" rx="5" fill="${COLORS[i%COLORS.length]}"/>
    <text x="${x+bW/2}" y="${y-5}" text-anchor="middle" font-size="11" font-weight="600" fill="#374151">${d.value}</text>
    <text x="${x+bW/2}" y="${pad.t+cH+20}" text-anchor="middle" font-size="11" fill="#6b7280">${d.label}</text>`;
  }).join('');
  // Y-Achse Linien
  const yLines = [0,0.25,0.5,0.75,1].map(f => {
    const y = pad.t + cH - f*cH;
    const val = Math.round(f*maxV*10)/10;
    return `<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>
    <text x="${pad.l-6}" y="${y+4}" text-anchor="end" font-size="10" fill="#9ca3af">${val}</text>`;
  }).join('');
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${yLines}${bars}</svg>`;
}

function svgGroupBar(data, keys, colors, W=820, H=200) {
  const pad = {t:20,r:10,b:40,l:40};
  const cW = W-pad.l-pad.r, cH = H-pad.t-pad.b;
  const maxV = Math.max(...data.flatMap(d => keys.map(k => d[k]||0)), 1);
  const groupW = cW/data.length;
  const bW = Math.floor(groupW*0.25);
  const bars = data.map((d,gi) => {
    return keys.map((k,ki) => {
      const x = pad.l + gi*groupW + ki*(bW+3) + (groupW - keys.length*(bW+3))/2;
      const val = d[k]||0;
      const bH = Math.max(Math.round(val/maxV*cH), 2);
      const y = pad.t+cH-bH;
      return `<rect x="${x}" y="${y}" width="${bW}" height="${bH}" rx="4" fill="${colors[ki]}"/>
      <text x="${x+bW/2}" y="${y-4}" text-anchor="middle" font-size="10" font-weight="600" fill="#374151">${val}</text>`;
    }).join('') + `<text x="${pad.l+gi*groupW+groupW/2}" y="${pad.t+cH+20}" text-anchor="middle" font-size="12" font-weight="600" fill="#374151">${d.name}</text>`;
  }).join('');
  const legend = keys.map((k,i) => `<rect x="${10+i*100}" y="${H-10}" width="12" height="12" rx="3" fill="${colors[i]}"/>
  <text x="${26+i*100}" y="${H-1}" font-size="11" fill="#6b7280">${k}</text>`).join('');
  const yLines = [0,0.5,1].map(f => {
    const y = pad.t+cH-f*cH;
    return `<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>`;
  }).join('');
  return `<svg width="100%" viewBox="0 0 ${W} ${H+20}" xmlns="http://www.w3.org/2000/svg">${yLines}${bars}${legend}</svg>`;
}

function statusBadge(status) {
  const m = {'in_bearbeitung':['In Bearbeitung','#dbeafe','#1d4ed8'],'erledigt':['Erledigt','#dcfce7','#16a34a'],'zur_unterschrift':['Zur Unterschrift','#fef9c3','#ca8a04'],'abrechenbar':['Abrechenbar','#ffedd5','#ea580c'],'abgerechnet':['Abgerechnet','#f1f5f9','#475569']};
  const [l,bg,c] = m[status]??[status,'#f1f5f9','#475569'];
  return `<span style="background:${bg};color:${c};padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap;">${l}</span>`;
}

function bar(v, max, color, h=8) {
  const w = max>0 ? Math.round(v/max*100) : 0;
  return `<div style="background:#f1f5f9;border-radius:99px;height:${h}px;overflow:hidden;"><div style="background:${color};height:${h}px;border-radius:99px;width:${w}%;"></div></div>`;
}

function generateHTML({ monthName, t, w, e, totalH, prevTotalH, veraenderung,
  erledigtCount, offenCount, unterschriftCount, abrechenbarCount, abgerechnetCount,
  hochbauTickets, elektroTickets, hochbauH, elektroH, erledigungsQuote, avgHperTicket }) {

  const COLORS = ['#1e3a5f','#0ea5e9','#f97316','#8b5cf6','#22c55e','#ec4899','#14b8a6','#f59e0b'];
  const maxH = Math.max(...e.map(x=>x.stunden),1);
  const maxGewerk = Math.max(hochbauH, elektroH, 1);
  const trendVal = veraenderung ? parseFloat(veraenderung) : 0;
  const trend = veraenderung ? (trendVal>=0?`▲ +${veraenderung}%`:`▼ ${veraenderung}%`) : '–';
  const trendBg = veraenderung ? (trendVal>=0?'#dcfce7':'#fee2e2') : '#f1f5f9';
  const trendColor = veraenderung ? (trendVal>=0?'#16a34a':'#dc2626') : '#64748b';

  // Qualitätstext
  const quoteText = erledigungsQuote >= 80 ? 'sehr gut – der Großteil der Aufträge wurde erfolgreich abgeschlossen'
    : erledigungsQuote >= 60 ? 'gut – die Mehrzahl der Aufträge wurde bearbeitet'
    : erledigungsQuote >= 40 ? 'ausbaufähig – ein erheblicher Teil der Aufträge ist noch offen'
    : 'kritisch – viele Aufträge sind noch nicht abgeschlossen';

  const stundenChart = svgBar(e.map(emp=>({label:emp.kuerzel, value:emp.stunden})));
  const ticketChart = svgBar(e.map(emp=>({label:emp.kuerzel, value:emp.tickets})));
  const gewerkChart = svgGroupBar(
    [{name:'Hochbau',Tickets:hochbauTickets.length,Stunden:Math.round(hochbauH)},{name:'Elektro',Tickets:elektroTickets.length,Stunden:Math.round(elektroH)}],
    ['Tickets','Stunden'], ['#1e3a5f','#0ea5e9']
  );

  // Alle Ticket-Zeilen ohne Limit
  const ticketRows = t.map((ticket, idx) => {
    const tW = w.filter(x=>x.ticket_id===ticket.id);
    const tH = tW.reduce((s,x)=>s+Number(x.stunden??0),0);
    const ma = [...new Set(tW.map(x=>x.employees?.kuerzel).filter(Boolean))].join(', ');
    const bg = idx%2===0 ? 'white' : '#fafafa';
    return `<tr style="background:${bg};">
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-weight:700;font-size:12px;color:#1e3a5f;">${ticket.a_nummer}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;">${ticket.gewerk??'–'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${statusBadge(ticket.status)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#94a3b8;">${ticket.eingangsdatum?new Date(ticket.eingangsdatum).toLocaleDateString('de-DE'):'–'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;text-align:center;font-family:monospace;color:#374151;">${ma||'–'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;font-size:12px;color:#1e3a5f;">${tH>0?tH+'h':'–'}</td>
    </tr>`;
  }).join('');

  const empRows = e.map((emp,i) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${COLORS[i%COLORS.length]};"></div>
          <span style="font-weight:700;font-family:monospace;color:#1e3a5f;">${emp.kuerzel}</span>
          <span style="color:#64748b;font-size:13px;">${emp.name}</span>
          <span style="background:#f1f5f9;padding:2px 8px;border-radius:6px;font-size:11px;color:#475569;">${emp.gewerk}</span>
        </div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:800;font-size:18px;color:#1e3a5f;">${emp.stunden}h</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#374151;">${emp.tickets}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;color:#64748b;font-size:13px;">${emp.avg}h</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;min-width:180px;">
        ${bar(emp.stunden, maxH, COLORS[i%COLORS.length], 10)}
        <span style="font-size:11px;color:#94a3b8;">${totalH>0?Math.round(emp.stunden/totalH*100):0}% des Teams</span>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monatsbericht ${monthName} – WIDI</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f2f5;color:#1e293b;font-size:14px;line-height:1.5;}
  .wrap{max-width:1100px;margin:0 auto;padding:40px 24px;}
  .card{background:white;border-radius:16px;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:24px;}
  .card-title{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;}
  .card-desc{font-size:13px;color:#64748b;margin-bottom:20px;line-height:1.6;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
  .grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;}
  th{text-align:left;padding:10px 12px;font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e2e8f0;}
  @media print{
    body{background:white;}
    .no-print{display:none!important;}
    .page-break{page-break-before:always;}
    .card{box-shadow:none!important;border:1px solid #e2e8f0!important;}
  }
</style>
</head>
<body>
<div class="no-print" style="position:fixed;top:20px;right:20px;z-index:999;">
  <button onclick="window.print()" style="background:#1e3a5f;color:white;border:none;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px rgba(30,58,95,0.3);">⬇ Als PDF speichern</button>
</div>

<div class="wrap">

<!-- HEADER -->
<div style="background:linear-gradient(135deg,#1a3356 0%,#0f2440 60%,#0ea5e9 100%);border-radius:20px;padding:48px 44px;color:white;margin-bottom:28px;position:relative;overflow:hidden;">
  <div style="position:absolute;right:-40px;top:-40px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
  <div style="position:absolute;right:80px;bottom:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;position:relative;">
    <div>
      <p style="font-size:12px;opacity:0.55;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;">WIDI Gebäudeservice GmbH · Internes Controlling</p>
      <h1 style="font-size:48px;font-weight:900;letter-spacing:-2px;margin-bottom:6px;">Monatsbericht</h1>
      <h2 style="font-size:26px;font-weight:300;opacity:0.85;">${monthName}</h2>
      <p style="margin-top:16px;font-size:13px;opacity:0.6;max-width:500px;">
        Dieser Bericht gibt einen vollständigen Überblick über alle Tickets, Stunden und Mitarbeiterleistungen des Monats ${monthName}. Er dient der internen Qualitätssicherung und Abrechnung.
      </p>
    </div>
    <div style="text-align:right;opacity:0.7;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;">Erstellt am</p>
      <p style="font-size:20px;font-weight:700;margin-top:4px;">${new Date().toLocaleDateString('de-DE')}</p>
      <p style="font-size:12px;margin-top:8px;">${t.length} Tickets · ${e.length} Mitarbeiter</p>
    </div>
  </div>
</div>

<!-- EXECUTIVE SUMMARY -->
<div class="card">
  <p class="card-title">Executive Summary</p>
  <p class="card-desc">
    Im Monat <strong>${monthName}</strong> wurden insgesamt <strong>${t.length} Tickets</strong> bearbeitet, wovon <strong>${erledigtCount} (${erledigungsQuote}%) erfolgreich abgeschlossen</strong> wurden. Die Gesamtleistung des Teams beträgt <strong>${totalH.toFixed(1)} Stunden</strong>
    ${veraenderung ? `, was einem ${trendVal>=0?'Anstieg':'Rückgang'} von <strong style="color:${trendColor};">${Math.abs(trendVal)}%</strong> gegenüber dem Vormonat entspricht` : ''}.
    Die Erledigungsquote ist <strong>${quoteText}</strong>.
    ${offenCount > 0 ? `<strong>${offenCount} Tickets</strong> befinden sich noch in Bearbeitung und werden in den Folgemonat übertragen.` : 'Alle bearbeiteten Tickets wurden vollständig abgeschlossen.'}
  </p>
  <div class="grid4">
    ${[
      {label:'Tickets gesamt',value:t.length,icon:'🎫',bg:'#eff6ff',ac:'#1e3a5f'},
      {label:'Stunden gesamt',value:totalH.toFixed(1)+'h',icon:'⏱',bg:'#f0fdf4',ac:'#16a34a'},
      {label:'Erledigungsquote',value:erledigungsQuote+'%',icon:'✅',bg:'#f0fdf4',ac:'#16a34a'},
      {label:'Ø Std / Ticket',value:avgHperTicket+'h',icon:'📊',bg:'#faf5ff',ac:'#7c3aed'},
    ].map(k=>`<div style="background:${k.bg};border-radius:12px;padding:20px;border:1.5px solid rgba(0,0,0,0.05);">
      <div style="font-size:24px;margin-bottom:8px;">${k.icon}</div>
      <div style="font-size:28px;font-weight:900;color:${k.ac};">${k.value}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;font-weight:500;">${k.label}</div>
    </div>`).join('')}
  </div>
</div>

<!-- STATUS + VERGLEICH -->
<div class="grid2">
  <div class="card">
    <p class="card-title">Statusverteilung</p>
    <p class="card-desc">Aufschlüsselung aller Tickets nach aktuellem Bearbeitungsstand.</p>
    ${[
      ['In Bearbeitung', offenCount, '#dbeafe','#1d4ed8'],
      ['Erledigt', t.filter(x=>x.status==='erledigt').length, '#dcfce7','#16a34a'],
      ['Zur Unterschrift', unterschriftCount, '#fef9c3','#ca8a04'],
      ['Abrechenbar', abrechenbarCount, '#ffedd5','#ea580c'],
      ['Abgerechnet', abgerechnetCount, '#f1f5f9','#475569'],
    ].map(([label,count,bg,color])=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f8fafc;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;background:${bg};border-radius:8px;display:flex;align-items:center;justify-content:center;">
          <div style="width:10px;height:10px;border-radius:50%;background:${color};"></div>
        </div>
        <span style="font-size:13px;font-weight:500;">${label}</span>
      </div>
      <div style="text-align:right;">
        <span style="font-weight:800;font-size:20px;color:${color};">${count}</span>
        <span style="font-size:11px;color:#94a3b8;margin-left:6px;">${pct(count,t.length)}%</span>
      </div>
    </div>`).join('')}
  </div>

  <div class="card">
    <p class="card-title">Vormonatsvergleich & Gewerk</p>
    <p class="card-desc">Vergleich der Gesamtstunden mit dem Vormonat sowie Aufteilung nach Gewerk.</p>
    <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px;padding:18px;background:#f8fafc;border-radius:12px;">
      <div style="text-align:center;">
        <p style="font-size:11px;color:#94a3b8;margin-bottom:2px;">Vormonat</p>
        <p style="font-size:26px;font-weight:700;color:#94a3b8;">${prevTotalH.toFixed(1)}h</p>
      </div>
      <div style="font-size:22px;color:#cbd5e1;">→</div>
      <div style="text-align:center;">
        <p style="font-size:11px;color:#1e3a5f;margin-bottom:2px;">Aktuell</p>
        <p style="font-size:34px;font-weight:900;color:#1e3a5f;">${totalH.toFixed(1)}h</p>
      </div>
      <div style="margin-left:auto;background:${trendBg};padding:10px 16px;border-radius:10px;">
        <span style="font-weight:800;color:${trendColor};font-size:17px;">${trend}</span>
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:600;">🏗 Hochbau</span>
        <span style="font-weight:700;color:#1e3a5f;">${hochbauTickets.length} Tickets · ${hochbauH.toFixed(1)}h</span>
      </div>
      ${bar(hochbauH, maxGewerk, '#1e3a5f', 12)}
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:600;">⚡ Elektro</span>
        <span style="font-weight:700;color:#0ea5e9;">${elektroTickets.length} Tickets · ${elektroH.toFixed(1)}h</span>
      </div>
      ${bar(elektroH, maxGewerk, '#0ea5e9', 12)}
    </div>
  </div>
</div>

<!-- GEWERK CHART -->
<div class="card">
  <p class="card-title">Gewerk-Vergleich</p>
  <p class="card-desc">Gegenüberstellung von Hochbau und Elektro nach Ticket-Anzahl und geleisteten Stunden.</p>
  ${gewerkChart}
</div>

<!-- STUNDEN CHART -->
${e.length > 0 ? `
<div class="grid2">
  <div class="card">
    <p class="card-title">Stunden pro Mitarbeiter</p>
    <p class="card-desc">Gesamte gebuchte Arbeitsstunden je Mitarbeiter im Monat ${monthName}.</p>
    ${stundenChart}
  </div>
  <div class="card">
    <p class="card-title">Tickets pro Mitarbeiter</p>
    <p class="card-desc">Anzahl der bearbeiteten Tickets je Mitarbeiter im Monat ${monthName}.</p>
    ${ticketChart}
  </div>
</div>` : ''}

<!-- MITARBEITER TABELLE -->
<div class="card page-break">
  <p class="card-title">Mitarbeiter Auswertung</p>
  <p class="card-desc">Detaillierte Übersicht über die Leistung jedes Mitarbeiters: Stunden, Ticket-Anzahl, Durchschnitt pro Ticket und prozentualer Anteil am Teamvolumen.</p>
  ${e.length===0 ? '<p style="color:#94a3b8;text-align:center;padding:30px;">Keine Buchungen in diesem Monat</p>' : `
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      <th>Mitarbeiter</th>
      <th style="text-align:right;">Stunden</th>
      <th style="text-align:right;">Tickets</th>
      <th style="text-align:right;">Ø Std/Ticket</th>
      <th>Anteil am Team</th>
    </tr></thead>
    <tbody>${empRows}</tbody>
  </table>`}
</div>

<!-- TICKET LISTE KOMPLETT -->
<div class="card page-break">
  <p class="card-title">Vollständige Ticket-Liste</p>
  <p class="card-desc">Alle ${t.length} Tickets des Monats ${monthName} mit Status, Eingansdatum, zuständigen Mitarbeitern und gebuchten Stunden.</p>
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      <th>A-Nummer</th><th>Gewerk</th><th>Status</th><th>Eingang</th><th style="text-align:center;">Mitarbeiter</th><th style="text-align:right;">Stunden</th>
    </tr></thead>
    <tbody>${ticketRows}</tbody>
  </table>
</div>

<!-- FOOTER -->
<div style="text-align:center;padding:30px;color:#94a3b8;font-size:12px;">
  <div style="width:48px;height:3px;background:linear-gradient(90deg,#1e3a5f,#0ea5e9);margin:0 auto 16px;border-radius:2px;"></div>
  <p style="font-weight:700;font-size:14px;color:#475569;">WIDI Gebäudeservice GmbH</p>
  <p style="margin-top:6px;">Monatsbericht ${monthName} · Erstellt am ${new Date().toLocaleDateString('de-DE')} · WIDI Controlling System · Vertraulich</p>
</div>

</div>
</body>
</html>`;
}
