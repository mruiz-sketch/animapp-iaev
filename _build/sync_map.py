"""Inserta (o actualiza) el 'Mapa Pixel UPSRJ' dentro de la sección Mapas de ANIMAPP.
Uso: python3 sync_map.py <mapa_fuente.html> <animapp.html> [<animapp2.html> ...]
Todo lo del mapa queda entre marcadores MAPA:START / MAPA:END para poder reemplazarlo en cada sincronización."""
import re, sys

src = open(sys.argv[1], encoding="utf-8").read()
css = re.search(r"<style>\s*/\* Layout: one column.*?</style>", src, re.S).group(0)
css = css[len("<style>"):-len("</style>")]
markup = re.search(r'<div class="wrap">.*?</ol>\s*</div>', src, re.S).group(0)
js = re.search(r"<script>\s*(\(\(\)=>\{.*\}\)\(\);)\s*</script>", src, re.S).group(1)

CLASSES = ["wrap","sub","stage","zoomctl","tip","bubble","status","dot","walking","legend","hl","active","hint","grab","grabbing",
           "dialog","face","body","who","place","say","close","caret"]
IDS = ["map","stage","zoomIn","zoomOut","zoomReset","tip","bubble","status","statusText","legend",
       "dialog","face","dlgPlace","dlgText","dlgClose"]

# ---- CSS: variables al contenedor, sin reglas de html/body, todo con prefijo #mapa-upsrj
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
css = css.replace(":root{", "#mapa-upsrj{", 1)
css = re.sub(r"html,body\{[^}]*\}", "", css)
css = re.sub(r"\nbody\{[^}]*\}", "\n", css)
for c in CLASSES:
    css = re.sub(r"\.%s(?![\w-])" % c, ".mp-" + c, css)
css = re.sub(r"\.n(?![\w-])", ".mp-n", css)
out = []
for rule in re.split(r"(?<=\})", css):
    m = re.match(r"(\s*)([^{@}][^{]*)\{(.*)", rule, re.S)
    if m and not m.group(2).strip().startswith(("#mapa-upsrj", "from", "to", "50%")):
        sels = ",".join("#mapa-upsrj " + s.strip() for s in m.group(2).split(","))
        rule = m.group(1) + sels + "{" + m.group(3)
    out.append(rule)
css = "".join(out)
# reglas dentro de @media/@keyframes
css = re.sub(r"@media \(prefers-reduced-motion:reduce\)\{\.mp-legend button", "@media (prefers-reduced-motion:reduce){#mapa-upsrj .mp-legend button", css)
css = css.replace("}.mp-status.walking", "}#mapa-upsrj .mp-status.mp-walking")
css = css.replace("@media (max-width:480px){.mp-dialog", "@media (max-width:480px){#mapa-upsrj .mp-dialog")
css = css.replace("@keyframes blink", "@keyframes mpblink").replace("animation:blink", "animation:mpblink")
css = css.replace("#mapa-upsrj h1{", "#mapa-upsrj .mp-h1{")
css = re.sub(r"#mapa-upsrj\s+(@media|@keyframes)", r"\1", css)
css = css.replace("#mapa-upsrj 50%{", "50%{")

# ---- Ajustes de ANIMAPP: texto 15 % más grande (redondeado a 0.5 px) y Work Sans como letra de lectura
def _px(m):
    v = round(float(m.group(1)) * 1.15 * 2) / 2
    return ("%g" % v) + "px"
css = re.sub(r"font-size:([^;}]*)", lambda m: "font-size:" + re.sub(r"(\d+(?:\.\d+)?)px", _px, m.group(1)), css)
css = re.sub(r"--f-body:[^;]*;", "--f-body:'Work Sans', system-ui, sans-serif;", css, count=1)

# ---- Marcado: sin título propio (la sección ya lo tiene), clases e ids con prefijo
markup = re.sub(r"\s*<h1>.*?</h1>", "", markup)
for c in CLASSES:
    markup = re.sub(r'(class="[^"]*?)\b%s\b' % c, r"\1mp-" + c, markup)
for i in IDS:
    markup = markup.replace('id="%s"' % i, 'id="mp-%s"' % i)

# ---- JS: selectores, clases y pausa cuando la sección no está visible
for i in IDS:
    js = js.replace("$('#%s')" % i, "$('#mp-%s')" % i)
for c in ["walking","hl","active","grab","grabbing","caret"]:
    js = js.replace("'%s'" % c, "'mp-%s'" % c)
js = js.replace('<span class="n">', '<span class="mp-n">')
js = js.replace("b.id='lugar-'", "b.id='mp-lugar-'")
js = js.replace("function frame(t){", "function frame(t){if(document.getElementById('mapa-upsrj').hidden){last=t;requestAnimationFrame(frame);return;}", 1)
assert "$('#map')" not in js and "mp-map" in js and "$('#dialog')" not in js

block = ("<!--MAPA:START (sincronizado desde 'Mapa Pixel UPSRJ'; no editar a mano)-->\n"
         "<style>" + css + "</style>\n"
         '<div id="mapa-upsrj" hidden>\n' + markup + "\n"
         '<p class="mp-full"><a class="pbtn" href="https://claude.ai/artifact/CGLehfqduxFc2P4ef61dyQ" target="_blank" rel="noopener">Ver mapa en pantalla completa ↗</a></p>\n'
         "</div>\n<script>\n" + js + "\n</script>\n<!--MAPA:END-->")

for path in sys.argv[2:]:
    page = open(path, encoding="utf-8").read()
    if "<!--MAPA:START" in page:
        page = re.sub(r"<!--MAPA:START.*?<!--MAPA:END-->", lambda m: block, page, flags=re.S)
    else:
        anchor = '<div class="panel" id="secBody"></div>'
        assert page.count(anchor) == 1
        page = page.replace(anchor, anchor + "\n      " + block)
    open(path, "w", encoding="utf-8").write(page)
    print("ok", path)
