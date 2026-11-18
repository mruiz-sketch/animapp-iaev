// Función programada (cada hora, ver netlify.toml). Revisa el Google Calendar público de alumnos de IAEV:
//  1) Si aparece un evento o fecha nueva, manda un aviso push y actualiza la sección Calendario
//     (Firestore publico/calendario, el mismo documento que se sube desde admin.html).
//  2) Recordatorios: un día antes (desde las 8 am) y el mero día (desde las 7 am) de cada evento.
// El estado (eventos ya vistos y recordatorios enviados) vive en Firestore sistema/avisos.
const { fb, enviar } = require("../lib/avisos");

const GCAL_ID = "c_4f02422c3b0bc1d1a582fbe59729aa5cc2f19c4cfd603b33e5c77c6c82221eb8@group.calendar.google.com";
const ICS_URL = "https://calendar.google.com/calendar/ical/" + encodeURIComponent(GCAL_ID) + "/public/basic.ics";
const TZ = "America/Mexico_City";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Igual que parseICS de admin.html: [{s:"AAAAMMDD", e:"AAAAMMDD", t:"Título"}]
function parseICS(txt) {
  const raw = txt.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""), out = [];
  raw.split("BEGIN:VEVENT").slice(1).forEach(b => {
    b = b.split("END:VEVENT")[0];
    const g = k => { const m = b.match(new RegExp("^" + k + "[^:\\n]*:(.*)$", "m")); return m ? m[1].trim() : ""; };
    if (/^CANCELLED$/i.test(g("STATUS"))) return;
    const st = g("DTSTART"); if (!st) return;
    const en = g("DTEND") || st; const s = st.slice(0, 8); let e = en.slice(0, 8);
    if (e <= s) e = addDays(s, 1);
    const t = g("SUMMARY").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").replace(/\s+/g, " ").trim();
    if (!/^\d{8}$/.test(s) || !t) return;
    out.push({ s, e, t });
    if (/FREQ=YEARLY/.test(g("RRULE"))) {
      const y0 = +s.slice(0, 4), last = new Date().getFullYear() + 3;
      for (let y = y0 + 1; y <= last; y++) out.push({ s: y + s.slice(4), e: (y + (+e.slice(0, 4) - y0)) + e.slice(4), t });
    }
  });
  return out.sort((a, b) => a.s < b.s ? -1 : a.s > b.s ? 1 : a.t.localeCompare(b.t));
}

function addDays(ymd, n) {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + n));
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function hoyMX() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { ymd: p.year + p.month + p.day, hora: +p.hour };
}
const fecha = ymd => `${+ymd.slice(6, 8)} ${MESES[+ymd.slice(4, 6) - 1]}`;
const esOcupado = t => /^(busy|ocupado|ocupada)$/i.test(String(t || "").trim());
// Respaldo: las fechas que trae la propia app (CAL_EVENTS en index.html)
async function eventosDelSitio() {
  try {
    const base = process.env.URL || "https://animapp-iaev.netlify.app";
    const html = await (await fetch(base + "/index.html", { headers: { "cache-control": "no-cache" } })).text();
    const m = html.match(/const CAL_EVENTS=(\[\[.*?\]\]);/s);
    return m ? JSON.parse(m[1]).map(x => ({ s: x[0], e: x[1], t: x[2] })) : [];
  } catch { return []; }
}
const clave = ev => ev.s + "|" + ev.t;
const lista = (evs, max = 2) => evs.slice(0, max).map(e => e.t).join(" · ") + (evs.length > max ? ` · y ${evs.length - max} más` : "");

exports._h = { parseICS, hoyMX, addDays, esOcupado, eventosDelSitio, ICS_URL };
exports.handler = async () => {
  const log = [];
  try {
    const db = fb().firestore();
    const ref = db.collection("sistema").doc("avisos");
    const estado = (await ref.get()).data() || {};
    const { ymd: hoy, hora } = hoyMX();
    const manana = addDays(hoy, 1);

    // 1) Leer el Google Calendar (si falla, se usan las fechas guardadas en Firestore)
    let eventos = null;
    try {
      const r = await fetch(ICS_URL, { headers: { "cache-control": "no-cache" } });
      if (r.ok) {
        const ev = parseICS(await r.text());
        // Si el calendario solo se comparte como «libre/ocupado», todos los títulos dicen «Busy»: no sirve
        if (ev.length && ev.every(e => esOcupado(e.t))) log.push("Google Calendar solo comparte libre/ocupado (Busy)");
        else if (ev.length) eventos = ev;
      }
      else log.push("ics " + r.status);
    } catch (e) { log.push("ics " + e.message); }
    const pubRef = db.collection("publico").doc("calendario");
    if (!eventos) {
      const pub = (await pubRef.get()).data();
      eventos = pub && Array.isArray(pub.eventos) ? pub.eventos : [];
      if (eventos.length && eventos.every(e => esOcupado(e.t))) { // limpieza: nunca dejar «Busy» en la app
        await pubRef.delete(); eventos = []; log.push("borrado calendario «Busy» de Firestore");
      }
      if (!eventos.length) eventos = await eventosDelSitio();
      log.push("usando fechas guardadas (" + eventos.length + ")");
    } else {
      // Mantener la sección Calendario de ANIMAPP al día con Google Calendar
      const pub = (await pubRef.get()).data();
      const antes = pub && Array.isArray(pub.eventos) ? JSON.stringify(pub.eventos) : "";
      if (antes !== JSON.stringify(eventos)) {
        const d = new Date(); const act = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(d);
        await pubRef.set({ eventos, actualizado: act, fuente: "Google Calendar" });
        log.push("calendario actualizado (" + eventos.length + ")");
      }
    }
    const futuros = eventos.filter(e => e.s >= hoy);

    // 2) Eventos nuevos (solo si el calendario se leyó de Google)
    let vistos = Array.isArray(estado.calendario_vistos) ? estado.calendario_vistos : null;
    // Si lo guardado era del calendario en modo «Busy», se toma como primera vez (sin avisar todo el calendario)
    if (vistos && vistos.length && vistos.every(k => esOcupado(String(k).split("|").slice(1).join("|")))) vistos = null;
    const nuevosEstado = {};
    if (!log.some(x => x.startsWith("usando"))) {
      if (vistos) {
        const set = new Set(vistos);
        const nuevos = futuros.filter(e => !set.has(clave(e)));
        if (nuevos.length) {
          await enviar({
            title: nuevos.length === 1 ? "📅 Nueva fecha en el calendario" : `📅 ${nuevos.length} fechas nuevas en el calendario`,
            body: nuevos.slice(0, 2).map(e => `${e.t} (${fecha(e.s)})`).join(" · ") + (nuevos.length > 2 ? ` · y ${nuevos.length - 2} más` : ""),
            url: "/#calendario", tag: "cal-nuevo",
          });
          log.push("avisados " + nuevos.length + " nuevos");
        }
      } else log.push("estado inicial del calendario guardado");
      nuevosEstado.calendario_vistos = futuros.map(clave).slice(0, 1500);
    }

    // 3) Recordatorios: el mero día (desde las 7 am) y un día antes (desde las 8 am)
    const env = estado.calendario_recordatorios || {};
    const hoyEv = eventos.filter(e => e.s === hoy), mananaEv = eventos.filter(e => e.s === manana);
    if (hora >= 7 && hoyEv.length && env.hoy !== hoy) {
      await enviar({ title: hoyEv.length === 1 ? "📅 Hoy en IAEV" : `📅 Hoy en IAEV (${hoyEv.length})`, body: lista(hoyEv), url: "/#calendario", tag: "cal-hoy" });
      env.hoy = hoy; log.push("recordatorio de hoy");
    }
    if (hora >= 8 && mananaEv.length && env.manana !== manana) {
      await enviar({ title: mananaEv.length === 1 ? "📅 Mañana en IAEV" : `📅 Mañana en IAEV (${mananaEv.length})`, body: lista(mananaEv), url: "/#calendario", tag: "cal-manana" });
      env.manana = manana; log.push("recordatorio de mañana");
    }
    nuevosEstado.calendario_recordatorios = env;
    nuevosEstado.calendario_ultimo = { at: new Date().toISOString(), hoy, hora, log: log.join(" | ") || "sin cambios" };
    await ref.set(nuevosEstado, { merge: true });

    console.log(log.join(" | ") || "sin cambios");
    return { statusCode: 200, body: log.join(" | ") || "sin cambios" };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: "error: " + (e.message || e) };
  }
};
