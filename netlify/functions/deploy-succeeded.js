// Se ejecuta solo cada vez que Netlify publica el sitio. Si noticias.json trae noticias
// que no se habían avisado, manda un aviso automático a los dispositivos suscritos.
const { fb, enviar } = require("../lib/avisos");

exports.handler = async (event) => {
  try {
    let ctx = "production";
    try { ctx = JSON.parse(event.body || "{}").payload?.context || ctx; } catch {}
    if (ctx !== "production") return { statusCode: 200, body: "omitido: " + ctx };
    const base = process.env.URL || "https://animapp-iaev.netlify.app";
    const r = await fetch(base + "/noticias.json?t=" + Date.now(), { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return { statusCode: 200, body: "sin noticias.json" };
    const items = ((await r.json()).items || []).filter(n => n && n.url);
    const ref = fb().firestore().collection("sistema").doc("avisos");
    const doc = await ref.get();
    const vistas = doc.exists && Array.isArray(doc.data().noticias) ? doc.data().noticias : null;
    const todas = items.map(n => n.url);
    if (!vistas) { // primera vez: solo recordar lo que ya hay, sin avisar
      await ref.set({ noticias: todas.slice(0, 400) }, { merge: true });
      return { statusCode: 200, body: "estado inicial guardado" };
    }
    const nuevas = items.filter(n => !vistas.includes(n.url));
    await ref.set({ noticias: [...new Set(todas.concat(vistas))].slice(0, 400) }, { merge: true });
    if (!nuevas.length) return { statusCode: 200, body: "sin noticias nuevas" };
    const n = nuevas.length;
    await enviar({
      title: n === 1 ? "📰 Nueva noticia en ANIMAPP" : `📰 ${n} noticias nuevas en ANIMAPP`,
      body: nuevas[0].titulo + (n > 1 ? ` · y ${n - 1} más` : ""),
      url: "/#blog",
      tag: "noticias",
    });
    return { statusCode: 200, body: `avisadas ${n} noticias` };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: "error: " + (e.message || e) }; // nunca bloquea la publicación
  }
};
