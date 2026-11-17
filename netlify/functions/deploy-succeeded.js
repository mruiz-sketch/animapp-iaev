// Se ejecuta solo cada vez que Netlify publica el sitio. Si noticias.json trae noticias
// que no se habían avisado, manda un aviso automático a los dispositivos suscritos.
const { avisarNoticias } = require("../lib/avisos");

exports.handler = async (event) => {
  try {
    let ctx = "production";
    try { ctx = JSON.parse(event.body || "{}").payload?.context || ctx; } catch {}
    if (ctx !== "production") return { statusCode: 200, body: "omitido: " + ctx };
    const base = process.env.URL || "https://animapp-iaev.netlify.app";
    const r = await fetch(base + "/noticias.json?t=" + Date.now(), { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return { statusCode: 200, body: "sin noticias.json" };
    return { statusCode: 200, body: await avisarNoticias((await r.json()).items) };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: "error: " + (e.message || e) }; // nunca bloquea la publicación
  }
};
