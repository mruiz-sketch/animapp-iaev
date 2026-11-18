// Tareas programadas de ANIMAPP (GitHub Actions, cada hora: .github/workflows/tareas.yml).
// Antes eran funciones programadas de Netlify; el código es el mismo (netlify/functions/*.js).
//  1) calendario-avisos: fechas nuevas de Google Calendar y recordatorios (un día antes y el mero día).
//  2) noticias-drive: noticias que deja la tarea diaria en Google Drive → Firestore + aviso push.
//     Además copia esas noticias a noticias.json para que el sitio estático también las tenga.
// Después, el workflow corre _build/drive_sync.py (mapa y juego del render) y sube los cambios.
const fs = require("fs");
process.env.URL = process.env.URL || "https://animapp-iaev.pages.dev";

(async () => {
  for (const f of ["calendario-avisos", "noticias-drive"]) {
    try { const r = await require("../netlify/functions/" + f).handler({}); console.log(f + ":", r.body); }
    catch (e) { console.error(f + ": error", e.message || e); }
  }
  try {
    const { fb } = require("../netlify/lib/avisos");
    const d = (await fb().firestore().collection("publico").doc("noticias").get()).data();
    if (d && d.json) {
      const nuevo = JSON.parse(d.json);
      let viejo = {}; try { viejo = JSON.parse(fs.readFileSync("noticias.json", "utf8")); } catch {}
      if (String(nuevo.actualizado || "") > String(viejo.actualizado || "")) {
        fs.writeFileSync("noticias.json", JSON.stringify(nuevo, null, 1) + "\n");
        console.log("noticias.json actualizado al", nuevo.actualizado);
      }
    }
  } catch (e) { console.error("noticias.json: error", e.message || e); }
  process.exit(0);
})();
