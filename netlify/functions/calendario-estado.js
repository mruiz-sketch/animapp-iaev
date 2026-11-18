// Diagnóstico de solo lectura: abre /.netlify/functions/calendario-estado en el navegador.
// Muestra si Google Calendar se puede leer, qué hay hoy y mañana, y la última corrida de calendario-avisos.
const { fb, suscritos } = require("../lib/avisos");
const { _h } = require("./calendario-avisos");

exports.handler = async () => {
  const out = { ahora_mx: null, google_calendar: {}, firestore: {}, ultima_corrida: null };
  try {
    const { ymd: hoy, hora } = _h.hoyMX(); const manana = _h.addDays(hoy, 1);
    out.ahora_mx = { hoy, hora, manana };
    try {
      const r = await fetch(_h.ICS_URL, { headers: { "cache-control": "no-cache" } });
      out.google_calendar.http = r.status;
      if (r.ok) {
        const ev = _h.parseICS(await r.text());
        out.google_calendar.eventos = ev.length;
        out.google_calendar.solo_busy = ev.length > 0 && ev.every(e => _h.esOcupado(e.t));
        out.google_calendar.hoy = ev.filter(e => e.s === hoy).map(e => e.t);
        out.google_calendar.manana = ev.filter(e => e.s === manana).map(e => e.t);
        out.google_calendar.proximos = ev.filter(e => e.s >= hoy).slice(0, 5).map(e => e.s + " " + e.t);
      }
    } catch (e) { out.google_calendar.error = e.message; }
    const db = fb().firestore();
    const pub = (await db.collection("publico").doc("calendario").get()).data();
    out.firestore.publico_calendario = pub ? { eventos: (pub.eventos || []).length, fuente: pub.fuente || "admin", actualizado: pub.actualizado || "" } : "no existe";
    const est = (await db.collection("sistema").doc("avisos").get()).data() || {};
    out.firestore.recordatorios_enviados = est.calendario_recordatorios || {};
    out.firestore.eventos_vistos = Array.isArray(est.calendario_vistos) ? est.calendario_vistos.length : "ninguno";
    out.ultima_corrida = est.calendario_ultimo || "todavía no hay registro (la función programada no ha corrido con esta versión)";
    try { out.dispositivos_suscritos = await suscritos(); } catch (e) { out.dispositivos_suscritos = "?"; }
  } catch (e) { out.error = e.message || String(e); }
  return { statusCode: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(out, null, 2) };
};
