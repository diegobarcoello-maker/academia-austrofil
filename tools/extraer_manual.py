#!/usr/bin/env python3
"""Extrae del Manual de Campo Austrofil (index.html) el contenido que usa la Academia.

Uso:  python3 tools/extraer_manual.py RUTA/manual/index.html datos/manual.json [--vistas v-lubricantes,v-motos,...]
      (para una línea nueva, agrega su vista: --vistas v-lubricantes,v-motos,v-marcas,v-vender,v-mercado,v-glosario,v-filtros)

Saca, sin tocar el texto:
  - las vistas #v-lubricantes, #v-motos, #v-marcas, #v-vender, #v-mercado y #v-glosario,
    en bloques con id estable (sub + número), su subtítulo (h2/h3/h4) y su tipo;
  - el banco QA (campos k, a, go, sub), DEFS y CONTEXTO;
  - el código de IA con Gemini que la Academia copia tal cual y la guía del panel de IA.
"""
import hashlib, json, re, subprocess, sys
from bs4 import BeautifulSoup, NavigableString, Tag

VISTAS = ["v-lubricantes", "v-motos", "v-marcas", "v-vender", "v-mercado", "v-glosario"]
GEM_FUNCS = ["gemModels", "dropGemModel", "pickGemModels", "gemError", "gemErrorText",
             "plainAI", "streamGem", "maskKey", "keptNote", "saveGemKey"]
GEM_VARS = ["GEM_URL", "GEM_DEFAULT", "gemCool", "GEM_DAILY"]


def clip(t):
    return re.sub(r"\s+", " ", t or "").strip()


def fmt(el):
    """Texto con **negritas** del manual; el resto, plano."""
    out = []
    def walk(n):
        if isinstance(n, NavigableString):
            out.append(str(n)); return
        if not isinstance(n, Tag): return
        if n.name in ("img", "svg", "script", "style"): return
        if n.name == "br": out.append(" "); return
        bold = n.name in ("b", "strong")
        if bold: out.append("**")
        for c in n.children: walk(c)
        if bold: out.append("**")
    walk(el)
    t = clip("".join(out))
    t = re.sub(r"\*\*\s*\*\*", "", t)                 # negritas vacías
    t = re.sub(r"\*\*\s+", "** ", t)
    t = re.sub(r"(\S)\*\*(?=\S)", r"\1**", t)
    # normaliza espacios dentro de los marcadores: "** texto**" -> "**texto**"
    parts = t.split("**")
    if len(parts) % 2 == 1:
        for i in range(1, len(parts), 2):
            lead = parts[i - 1]
            inner = parts[i]
            if inner.startswith(" ") and lead and not lead.endswith(" "):
                parts[i - 1] = lead + " "
            if inner.endswith(" ") and i + 1 < len(parts) and not parts[i + 1].startswith(" "):
                parts[i + 1] = " " + parts[i + 1]
            parts[i] = inner.strip()
        t = "**".join(parts)
    else:
        t = t.replace("**", "")
    return clip(t)


def plain(t):
    return t.replace("**", "")


BLOCK_TAGS = {"p", "li", "h3", "h4", "dt", "dd", "tr"}


class Extractor:
    def __init__(self, view):
        self.view = view
        self.vid = view["id"]
        self.blocks = []

    def add(self, sub, ctx, tipo, el=None, texto=None, **extra):
        f = texto if texto is not None else fmt(el)
        if not plain(f).strip():
            return
        n = sum(1 for b in self.blocks if b["sub"] == sub) + 1
        b = {"id": "%s.%d" % (sub, n), "vista": self.vid, "sub": sub, "h2": ctx.get("h2", ""),
             "h3": ctx.get("h3", ""), "h4": ctx.get("h4", ""), "tipo": tipo,
             "fmt": f, "texto": plain(f)}
        if el is not None and el.get("class"):
            b["clase"] = " ".join(el.get("class"))
        b.update({k: v for k, v in extra.items() if v})
        self.blocks.append(b)

    def walk(self, node, sub, ctx):
        for ch in node.children:
            if not isinstance(ch, Tag):
                continue
            cls = ch.get("class") or []
            if ch.name in ("img", "svg", "script", "style", "button"):
                continue
            if "submenu" in cls:
                continue
            if ch.name == "h2":
                continue  # título de la subsección, va en ctx
            if ch.name == "h3":
                ctx["h3"] = clip(ch.get_text()); ctx["h4"] = ""
                self.add(sub, ctx, "h3", ch)
                continue
            if ch.name == "h4":
                ctx["h4"] = clip(ch.get_text())
                self.add(sub, ctx, "h4", ch)
                continue
            if "call" in cls:  # recuadro con etiqueta
                lbl = ch.find(class_="lbl")
                etiqueta = clip(lbl.get_text()) if lbl else ""
                kind = [c for c in cls if c != "call"]
                for p in ch.find_all(["p", "li"]):
                    self.add(sub, ctx, "nota", p, etiqueta=etiqueta, nota=(kind[0] if kind else ""))
                continue
            if ch.name == "table" or "tw" in cls:
                tbl = ch if ch.name == "table" else ch.find("table")
                if tbl is None:
                    continue
                cols = [clip(th.get_text(" ")) for th in tbl.select("thead th")]
                for tr in tbl.select("tbody tr"):
                    cells = [fmt(td) for td in tr.find_all(["td", "th"])]
                    if not any(cells):
                        continue
                    texto = " — ".join(c for c in cells if c)
                    self.add(sub, ctx, "fila", texto=texto, cols=cols, celdas=cells)
                continue
            if "beat" in cls:  # tiempos del motor: "TIEMPO 1 · Admisión — texto. Pistón…"
                n, b = ch.find(class_="n"), ch.find("b")
                rest = [fmt(x) for x in ch.find_all("span", recursive=False) if "n" not in (x.get("class") or [])]
                self.add(sub, dict(ctx, h4=clip(b.get_text()) if b else ""), "dato",
                         texto="%s · **%s** — %s" % (clip(n.get_text()) if n else "", clip(b.get_text()) if b else "",
                                                      " ".join(r for r in rest if r)))
                continue
            if ch.name in ("article",) or any(c in cls for c in ("pitch", "prod", "gama", "b5", "line")):
                antes = len(self.blocks)
                sub_ctx = dict(ctx)
                # título de tarjeta: h4, h3 o el <b> de la cabecera
                head = ch.find(["h4", "h3"])
                top = ch.find(class_=re.compile(r"(^|-)top$|gtop|b5-top|line-top"))
                titulo = ""
                if head is not None:
                    titulo = clip(head.get_text())
                elif top is not None and top.find("b"):
                    titulo = clip(top.find("b").get_text())
                sub_ctx["h4"] = titulo
                if top is not None:
                    self.add(sub, sub_ctx, "cabecera", texto=" · ".join(
                        clip(x.get_text()) for x in top.find_all(["b", "span", "h3"]) if clip(x.get_text())))
                for el in ch.find_all(["p", "li", "div"]):
                    ecls = el.get("class") or []
                    if el.name == "div" and not any(c in ecls for c in ("pcode", "psize", "brands", "vgrid")):
                        continue
                    if el.name == "div" and "brands" in ecls:
                        marcas = [clip(x.get_text()) for x in el.find_all("span")]
                        self.add(sub, sub_ctx, "marcas", texto=", ".join(marcas), marcas=marcas,
                                 propias=[clip(x.get_text()) for x in el.select("span.own")],
                                 grupo=[clip(x.get_text()) for x in el.select("span.grp")])
                        continue
                    if el.name == "div" and "vgrid" in ecls:
                        self.add(sub, sub_ctx, "dato", texto="Viscosidades: " + ", ".join(
                            clip(x.get_text()) for x in el.find_all("span")))
                        continue
                    tp = el.find_parent(class_=re.compile(r"(^|-)top$|gtop|b5-top|line-top"))
                    if tp is not None and tp is not ch:
                        continue
                    self.add(sub, sub_ctx, "p" if el.name == "p" else ("li" if el.name == "li" else "dato"), el)
                if len(self.blocks) == antes:   # tarjeta sin párrafos: su texto completo
                    self.add(sub, sub_ctx, "dato", ch)
                continue
            if ch.name in ("ol", "ul"):
                for li in ch.find_all("li", recursive=False):
                    # rankings (rlist): "1 Motul"
                    rn, rb = li.find(class_="rn"), li.find(class_="rb")
                    if rn and rb:
                        self.add(sub, ctx, "li", texto="%s. %s" % (clip(rn.get_text()), clip(rb.get_text())),
                                 lista=ctx.get("lista", ""))
                    else:
                        self.add(sub, ctx, "li", li)
                continue
            if ch.name == "dl":
                for div in ch.find_all("div", recursive=False):
                    dt, dd = div.find("dt"), div.find("dd")
                    if dt and dd:
                        self.add(sub, ctx, "def", texto="**%s:** %s" % (clip(dt.get_text()), fmt(dd)),
                                 termino=clip(dt.get_text()), definicion=plain(fmt(dd)))
                continue
            if "rhead" in cls:
                ctx["lista"] = clip(ch.get_text())
                self.add(sub, ctx, "h4", ch)
                continue
            if ch.name == "p":
                self.add(sub, ctx, "p", ch)
                continue
            if any(c in cls for c in ("leg",)):
                st, sp = ch.find("strong"), ch.find("span")
                self.add(sub, ctx, "dato", texto="**%s** %s" % (clip(st.get_text()) if st else "",
                                                               clip(sp.get_text()) if sp else ""))
                continue
            if any(c in cls for c in ("base", "adit")):
                st, sp = ch.find("b"), ch.find("span")
                self.add(sub, ctx, "dato", texto="**%s** %s" % (clip(st.get_text()) if st else "",
                                                               clip(sp.get_text()) if sp else ""))
                continue
            if "kicker" in cls and ch.find_parent(class_="panel") is not None:
                self.add(sub, ctx, "h4", ch)
                continue
            if "grade" in cls:
                self.add(sub, ctx, "dato", ch)
                continue
            # contenedor: baja un nivel
            self.walk(ch, sub, ctx)


def extract_views(soup):
    vistas = []
    for vid in VISTAS:
        v = soup.find(id=vid)
        assert v is not None, vid
        head = v.find(class_="vhead")
        view = {"id": vid, "menu": v.get("data-menu", ""), "titulo": clip(head.find("h1").get_text()),
                "intro": clip(head.find("p").get_text()) if head.find("p") else "",
                "kicker": clip(head.find(class_="kicker").get_text()) if head.find(class_="kicker") else "",
                "pestanas": {b["data-sub"]: clip(b.get_text()) for b in v.select(".submenu .si")},
                "secciones": []}
        ex = Extractor(view)
        # lo que está fuera de las subsecciones (ficha de motos, glosario)
        extra = []
        for ch in v.children:
            if isinstance(ch, Tag) and ch.name != "section" and "vhead" not in (ch.get("class") or []) \
                    and "submenu" not in (ch.get("class") or []):
                extra.append(ch)
        if extra:
            wrapper = soup.new_tag("div")
            for e in extra:
                wrapper.append(e.__copy__())
            # id propio para lo que va fuera de las subsecciones: "mo0" (ficha de Motos), "gl" (Glosario)
            pref = re.match(r"[a-z]+", next(iter(view["pestanas"]), "")) if view["pestanas"] else None
            intro = (pref.group(0) + "0") if pref else vid[2:4]
            ex.walk(wrapper, intro, {"h2": view["titulo"]})
            view["secciones"].insert(0, {"sub": intro, "h2": view["titulo"], "pestana": ""})
        for sec in v.find_all("section", class_="sub"):
            sub = sec["id"][2:]
            h2 = clip(sec.find("h2").get_text()) if sec.find("h2") else ""
            ex.walk(sec, sub, {"h2": h2})
            view["secciones"].append({"sub": sub, "h2": h2, "pestana": view["pestanas"].get(sub, "")})
        view["bloques"] = ex.blocks
        vistas.append(view)
    return vistas


# ---------- JavaScript ----------
def js_literal(js, start):
    """Devuelve el texto de un literal [ ... ] desde 'start' (posición del '['), respetando cadenas."""
    i, depth, n = start, 0, len(js)
    while i < n:
        c = js[i]
        if c in "\"'":
            q = c; i += 1
            while js[i] != q:
                i += 2 if js[i] == "\\" else 1
        elif c in "[{(":
            depth += 1
        elif c in "]})":
            depth -= 1
            if depth == 0:
                return js[start:i + 1]
        i += 1
    raise ValueError("literal sin cerrar")


def js_to_json(lit):
    """Evalúa un literal JS de solo datos (cadenas, objetos, null) en un contexto vacío de Node."""
    code = ("const vm=require('vm');let s='';process.stdin.on('data',d=>s+=d);"
            "process.stdin.on('end',()=>{process.stdout.write(JSON.stringify("
            "vm.runInNewContext('('+s+')',Object.create(null),{timeout:2000})));});")
    r = subprocess.run(["node", "-e", code], input=lit, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def js_function(js, name):
    """Texto exacto de 'function name(...)' (o 'async function'), con la sangría del manual."""
    m = re.search(r"^(  (?:async )?function %s\(.*)$" % re.escape(name), js, flags=re.M)
    assert m, name
    start = m.start()
    first = m.group(1)
    if first.rstrip().endswith("}") and first.count("{") == first.count("}"):
        return first
    end = js.index("\n  }\n", start) + len("\n  }")
    return js[start:end]


def main(src, dst, vistas=None):
    global VISTAS
    if vistas:
        VISTAS = vistas
    html = open(src, encoding="utf-8").read()
    soup = BeautifulSoup(html, "lxml")
    ver = re.search(r'<div class="dver">Versión <b>(\d+)</b> · ([0-9-]+)</div>', html)
    js = html[html.index("<script>") + len("<script>"):html.rindex("</script>")]

    qa_lit = js_literal(js, js.index("var QA = [") + len("var QA = "))
    qa = js_to_json(qa_lit)
    defs = js_to_json(js_literal(js, js.index("var DEFS = [") + len("var DEFS = ")))
    ctx_lit = js_literal(js, js.index("var CONTEXTO = [") + len("var CONTEXTO = "))
    # el repo de la Academia es público: fuera las líneas del chat del manual que le hablan a una persona por su nombre
    contexto = [l for l in js_to_json(ctx_lit) if not re.search(r"Le respondes a|Tutea a", l)]

    gem = {}
    for v in GEM_VARS:
        gem[v] = re.search(r"^  var %s = .*$" % v, js, flags=re.M).group(0)
    m = re.search(r"^  var COPY = \{\n.*?^  \};$", js, flags=re.M | re.S)
    gem["COPY"] = m.group(0)
    for f in GEM_FUNCS:
        gem[f] = js_function(js, f)
    guia = re.search(r'<ol class="cset-steps">.*?</ol>', html, flags=re.S).group(0)

    data = {
        "manual": {"version": int(ver.group(1)), "fecha": ver.group(2),
                   "sha256": hashlib.sha256(html.encode("utf-8")).hexdigest(),
                   "repo": "https://github.com/diegobarcoello-maker/manual-austrofil"},
        "vistas": extract_views(soup),
        "qa": qa, "defs": defs, "contexto": contexto,
        "gemini": gem, "guia_ia": guia,
    }
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    nb = sum(len(v["bloques"]) for v in data["vistas"])
    print("manual v%s (%s): %d vistas, %d bloques, %d QA, %d DEFS, %d líneas de CONTEXTO"
          % (ver.group(1), ver.group(2), len(data["vistas"]), nb, len(qa), len(defs), len(contexto)))


if __name__ == "__main__":
    args = sys.argv[1:]
    vistas = None
    if "--vistas" in args:
        i = args.index("--vistas")
        vistas = [v.strip() for v in args[i + 1].split(",") if v.strip()]
        args = args[:i] + args[i + 2:]
    main(args[0], args[1], vistas)
