"""Contenido: preguntas bien armadas, fuentes del manual, IA copiada tal cual y nada sensible en el repo."""
import json, os, re, subprocess

from conftest import RAIZ

HTML = open(os.path.join(RAIZ, "index.html"), encoding="utf-8").read()
MANUAL = json.load(open(os.path.join(RAIZ, "datos", "manual.json"), encoding="utf-8"))
DATOS = json.loads(re.search(r'<script type="application/json" id="datos-academia">(.*?)</script>', HTML, re.S)
                   .group(1).replace("<\\/", "</"))
BLOQUES = {b["id"]: b for v in MANUAL["vistas"] for b in v["bloques"]}
QA = {q["k"]: q for q in MANUAL["qa"]}


def norm(t):
    t = (t or "").replace("**", "")
    t = re.sub(r"[“”«»\"]", '"', t)
    return re.sub(r"\s+", " ", t).strip().lower()


def preguntas():
    for l in DATOS["lineas"]:
        for n in l["niveles"]:
            for m in n["modulos"]:
                for x in m["lecciones"]:
                    for p in x["preguntas"]:
                        yield l, x, p


def texto_fuente(f):
    if "qa" in f:
        return QA[f["qa"]]["a"]
    if "bloques" in f:
        return " · ".join(BLOQUES[b]["texto"] for b in f["bloques"])
    return BLOQUES[f["bloque"]]["texto"]


def test_lineas_en_orden_con_codigo_y_proximamente():
    codigos = [l["codigo"] for l in DATOS["lineas"]]
    assert codigos == [11, 10, 15, 20, 19, 13, 17, 18]
    activas = [l["codigo"] for l in DATOS["lineas"] if l["niveles"]]
    cat = json.load(open(os.path.join(RAIZ, "datos", "lineas.json"), encoding="utf-8"))["lineas"]
    assert activas == [l["codigo"] for l in cat if l.get("archivo")]
    assert 11 in activas


def test_cada_pregunta_una_sola_correcta_fuente_e_id_unico():
    ids = set()
    total = 0
    for l, x, p in preguntas():
        total += 1
        assert p["id"] not in ids, p["id"]
        ids.add(p["id"])
        assert p["id"].startswith(x["id"] + "-")
        assert p["tipo"] in ("opcion", "vf", "emparejar")
        if p["tipo"] == "opcion":
            assert 3 <= len(p["opciones"]) <= 4
            assert len({norm(o) for o in p["opciones"]}) == len(p["opciones"])
            assert isinstance(p["correcta"], int) and not isinstance(p["correcta"], bool)
            assert 0 <= p["correcta"] < len(p["opciones"])
        elif p["tipo"] == "vf":
            assert isinstance(p["correcta"], bool)
        else:
            izq = [norm(a) for a, b in p["pares"]]
            der = [norm(b) for a, b in p["pares"]]
            assert 3 <= len(p["pares"]) <= 4 and len(set(izq)) == len(izq) and len(set(der)) == len(der)
        f = p["fuente"]
        assert f.get("qa") or f.get("bloque") or f.get("bloques"), p["id"]
        assert norm(p["cita"]) in norm(texto_fuente(f)), p["id"]
        assert f.get("texto")
    assert total >= 90


def test_lecciones_cortas_con_fuente_y_entre_3_y_5_preguntas():
    for l in DATOS["lineas"]:
        for n in l["niveles"]:
            for m in n["modulos"]:
                for x in m["lecciones"]:
                    assert 3 <= len(x["preguntas"]) <= 5, x["id"]
                    assert x["palabras"] <= 400, x["id"]
                    assert 2 <= x["minutos"] <= 3
                    assert x["fuentes"], x["id"]
                    for f in x["fuentes"]:
                        assert f.get("qa") in QA if "qa" in f else f["vista"] in {v["id"] for v in MANUAL["vistas"]}
                    # el texto de la lección es el del manual, letra por letra
                    for b in x["cuerpo"]:
                        if b["t"] == "qa":
                            assert b["f"] == QA[b["qa"]]["a"]
                        else:
                            assert b["f"] == BLOQUES[b["id"]]["fmt"]


def test_objeciones_con_fuente_del_manual():
    l = DATOS["lineas"][0]
    clientes = [o["cliente"] for o in l["objeciones"]]
    for frase in ("Está caro.", "El otro es más barato.", "Yo siempre pongo 20W-50.", "No conozco esa marca."):
        assert frase in clientes
    assert any("nivel" in c for c in clientes)          # intervalo estirado
    for o in l["objeciones"]:
        assert [p["paso"] for p in o["pasos"]] == ["Pregunta antes de opinar", "Argumenta con el manual", "Cierra con una propuesta"]
        assert o["manual"]
        for p in o["pasos"]:
            assert norm(p["cita"]) in norm(texto_fuente(p["fuente"]))
            assert len(p["explicaciones"]) == len(p["opciones"])


def test_ia_copiada_tal_cual_del_manual():
    for nombre, codigo in MANUAL["gemini"].items():
        assert codigo in HTML, "no está tal cual: " + nombre
    assert MANUAL["guia_ia"] in HTML
    assert "austrofil.geminiKey" in HTML and "austrofil.geminiModelos" in HTML
    # la Academia no escribe la clave de Claude del manual
    assert "austrofil.claudeKey" not in HTML


def test_version_de_una_sola_constante():
    assert len(re.findall(r"var VERSION = \{ n: (\d+), fecha: \"(\d\d-\d\d-\d{4})\" \};", HTML)) == 1
    assert 'register("sw.js?v=" + VERSION.n)' in HTML
    sw = open(os.path.join(RAIZ, "sw.js"), encoding="utf-8").read()
    assert 'var APP = PREFIJO + "v" + V;' in sw and 'var PREFIJO = "academia-";' in sw


def test_sin_librerias_externas_salvo_google_fonts():
    assert not re.search(r"<script[^>]+src=", HTML)
    for href in re.findall(r'<link[^>]+href="(https?://[^"]+)"', HTML):
        assert href.startswith("https://fonts.googleapis.com") or href.startswith("https://fonts.gstatic.com")


def test_nada_con_forma_de_clave_ni_datos_personales_en_el_repo():
    archivos = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], cwd=RAIZ,
                              capture_output=True, text=True).stdout.split()
    assert archivos, "no se pudo listar el repo"
    patrones = [r"AIza[0-9A-Za-z_\-]{20,}", r"sk-ant-[A-Za-z0-9_\-]{10,}", r"gh[pousr]_[A-Za-z0-9]{20,}",
                r"-----BEGIN [A-Z ]*PRIVATE KEY-----", r"(?<!\d)09\d{8}(?!\d)", r"\+593\s?\d",
                r"\bD[i]ego\b", r"B[a]rros", r"[A-Za-z0-9._%+-]+@[g]mail\.com"]   # nombres y correos personales
    for a in archivos:
        if a.endswith(".png"):
            continue
        t = open(os.path.join(RAIZ, a), encoding="utf-8", errors="ignore").read()
        for p in patrones:
            assert not re.search(p, t), "%s tiene algo con forma de %s" % (a, p)
        assert not os.path.basename(a).startswith("deploy_key"), a
    gi = open(os.path.join(RAIZ, ".gitignore"), encoding="utf-8").read()
    assert "deploy_key*" in gi.split()


def test_archivos_de_la_entrega():
    for a in ("index.html", "sw.js", "manifest.webmanifest", "icons/gota-192.png", "icons/gota-512.png", ".nojekyll", ".gitignore"):
        assert os.path.exists(os.path.join(RAIZ, a)), a
    man = json.load(open(os.path.join(RAIZ, "manifest.webmanifest"), encoding="utf-8"))
    tam = {i["sizes"] for i in man["icons"]}
    assert {"192x192", "512x512"} <= tam
    from PIL import Image
    assert Image.open(os.path.join(RAIZ, "icons", "gota-192.png")).size == (192, 192)
    assert Image.open(os.path.join(RAIZ, "icons", "gota-512.png")).size == (512, 512)
