#!/usr/bin/env python3
"""Arma los datos de la Academia y los mete dentro de index.html.

Uso:  python3 tools/construir.py            (valida y escribe index.html)
      python3 tools/construir.py --revisar  (solo valida e informa)

Lee:
  datos/manual.json   extracción del Manual de Campo (tools/extraer_manual.py)
  datos/lineas.json   líneas, en orden, con su código interno
  datos/linea-*.json  ruta de cada línea: niveles → módulos → lecciones → preguntas, y objeciones

Valida (y se detiene si algo falla):
  - cada referencia de contenido existe en el manual (bloque o clave del QA);
  - cada lección tiene entre 3 y 5 preguntas y no pasa de 400 palabras;
  - cada pregunta tiene id único, tipo válido, una sola respuesta correcta y fuente;
  - la «cita» de cada pregunta está, letra por letra, en el texto de su fuente.

Escribe dentro de index.html:
  - el JSON de datos entre <script type="application/json" id="datos-academia"> y </script>;
  - el código de IA con Gemini del manual, tal cual, entre los marcadores IA-DEL-MANUAL.
"""
import json, math, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "datos")
INDEX = os.path.join(RAIZ, "index.html")
TIPOS = {"opcion", "vf", "emparejar"}
MAX_PALABRAS = 400
GEM_ORDEN = ["COPY", "GEM_URL", "GEM_DEFAULT", "gemCool", "gemModels", "dropGemModel", "pickGemModels",
             "gemError", "GEM_DAILY", "gemErrorText", "plainAI", "streamGem", "maskKey", "keptNote", "saveGemKey"]

errores = []


def err(msg):
    errores.append(msg)


def norm(t):
    t = (t or "").replace("**", "")
    t = re.sub(r"[“”«»\"]", '"', t)
    return re.sub(r"\s+", " ", t).strip().lower()


def palabras(t):
    return len(re.findall(r"\w+(?:[-'’]\w+)*", (t or "").replace("**", "")))


def cargar():
    man = json.load(open(os.path.join(DATOS, "manual.json"), encoding="utf-8"))
    bloques, orden, vistas = {}, [], {}
    for v in man["vistas"]:
        vistas[v["id"]] = v
        for b in v["bloques"]:
            bloques[b["id"]] = b
            orden.append(b["id"])
    qa = {q["k"]: q for q in man["qa"]}
    return man, bloques, orden, vistas, qa


def titulo_sub(vistas, vista, sub):
    v = vistas[vista]
    for s in v["secciones"]:
        if s["sub"] == sub:
            return s.get("pestana") or s["h2"]
    return v["titulo"]


def fuente_de(ref, bloques, vistas, qa):
    """Fuente legible de un bloque o de una respuesta del QA."""
    if isinstance(ref, dict) and "qa" in ref:
        q = qa[ref["qa"]]
        return {"qa": ref["qa"], "texto": "Banco de respuestas del manual"}
    b = bloques[ref]
    v = vistas[b["vista"]]
    sub_t = titulo_sub(vistas, b["vista"], b["sub"])
    t = v["menu"] + " › " + sub_t
    if b.get("h3"):
        t += " › " + b["h3"]
    return {"vista": b["vista"], "sub": b["sub"], "texto": t}


def expandir(refs, orden, bloques, qa, donde):
    out = []
    for r in refs:
        if isinstance(r, dict):
            if r.get("qa") not in qa:
                err("%s: no existe la clave del QA «%s»" % (donde, r.get("qa")))
                continue
            out.append({"qa": r["qa"]})
            continue
        if ".." in r:
            a, b = r.split("..")
            if a not in bloques or b not in bloques:
                err("%s: rango inválido %s" % (donde, r))
                continue
            i, j = orden.index(a), orden.index(b)
            if j < i or bloques[a]["vista"] != bloques[b]["vista"]:
                err("%s: rango inválido %s" % (donde, r))
                continue
            out.extend(orden[i:j + 1])
        elif r in bloques:
            out.append(r)
        else:
            err("%s: no existe el bloque %s" % (donde, r))
    return out


def bloque_salida(ref, bloques, qa, vistas):
    if isinstance(ref, dict):
        return {"t": "qa", "f": qa[ref["qa"]]["a"], "qa": ref["qa"]}
    b = bloques[ref]
    o = {"id": b["id"], "t": b["tipo"], "f": b["fmt"]}
    for k_in, k_out in (("etiqueta", "lbl"), ("nota", "k"), ("cols", "cols"), ("celdas", "cells"),
                        ("h3", "h3"), ("h4", "h4"), ("clase", "cls"), ("marcas", "marcas"),
                        ("propias", "own"), ("grupo", "grp")):
        if b.get(k_in):
            o[k_out] = b[k_in]
    return o


def texto_fuente(f, bloques, qa):
    if "qa" in f:
        return qa[f["qa"]]["a"] if f["qa"] in qa else None
    if "bloques" in f:
        if not f["bloques"] or any(x not in bloques for x in f["bloques"]):
            return None
        return " · ".join(bloques[x]["texto"] for x in f["bloques"])
    b = bloques.get(f.get("bloque"))
    return b["texto"] if b else None


def validar_pregunta(p, donde, ids, bloques, qa, vistas, practica=False):
    pid = p.get("id")
    if not pid:
        err("%s: pregunta sin id" % donde); return None
    if pid in ids:
        err("%s: id repetido %s" % (donde, pid))
    ids.add(pid)
    tipo = p.get("tipo")
    if tipo not in TIPOS:
        err("%s: tipo inválido «%s»" % (pid, tipo)); return None
    if not (p.get("enunciado") or "").strip():
        err("%s: sin enunciado" % pid)
    if tipo == "opcion":
        op = p.get("opciones") or []
        if not 3 <= len(op) <= 4:
            err("%s: necesita 3 o 4 opciones" % pid)
        if len({norm(o) for o in op}) != len(op):
            err("%s: opciones repetidas" % pid)
        c = p.get("correcta")
        if not isinstance(c, int) or isinstance(c, bool) or not 0 <= c < len(op):
            err("%s: «correcta» debe ser el índice de UNA opción" % pid)
    elif tipo == "vf":
        if not isinstance(p.get("correcta"), bool):
            err("%s: en verdadero/falso «correcta» es true o false" % pid)
    else:
        pares = p.get("pares") or []
        if not 3 <= len(pares) <= 4 or any(len(x) != 2 for x in pares):
            err("%s: emparejar necesita 3 o 4 pares" % pid)
        izq = [norm(x[0]) for x in pares]; der = [norm(x[1]) for x in pares]
        if len(set(izq)) != len(izq) or len(set(der)) != len(der):
            err("%s: en emparejar no se repiten lados" % pid)
    f = p.get("fuente") or {}
    if not ("qa" in f or "bloque" in f or "bloques" in f):
        err("%s: sin fuente" % pid); return None
    src = texto_fuente(f, bloques, qa)
    if src is None:
        err("%s: la fuente %s no existe en el manual" % (pid, f)); return None
    cita = p.get("cita") or ""
    if not cita and "bloques" in f:
        cita = src   # emparejar sobre filas de una tabla: la cita son esas filas, tal cual
    if len(cita) < 12:
        err("%s: falta la cita del manual" % pid)
    elif norm(cita) not in norm(src):
        err("%s: la cita no está en su fuente (%s)" % (pid, f.get("bloque") or f.get("qa") or f.get("bloques")))
    if "qa" in f:
        fl = {"qa": f["qa"], "texto": "Banco de respuestas del manual"}
    elif "bloques" in f:
        textos = []
        for x in f["bloques"]:
            t = fuente_de(x, bloques, vistas, qa)["texto"]
            if t not in textos:
                textos.append(t)
        fl = {"vista": bloques[f["bloques"][0]]["vista"], "sub": bloques[f["bloques"][0]]["sub"],
              "texto": " · ".join(textos), "bloques": f["bloques"]}
    else:
        fl = fuente_de(f["bloque"], bloques, vistas, qa)
        fl["bloque"] = f["bloque"]
    out = {k: p[k] for k in ("id", "tipo", "enunciado", "opciones", "correcta", "pares") if k in p}
    out["cita"] = cita
    out["fuente"] = fl
    return out


def construir_linea(meta, man, bloques, orden, vistas, qa, ids):
    codigo = meta["codigo"]
    linea = {"codigo": codigo, "nombre": meta["nombre"], "niveles": [], "objeciones": []}
    arch = meta.get("archivo")
    if not arch:
        return linea
    src = json.load(open(os.path.join(DATOS, arch), encoding="utf-8"))
    if src.get("codigo") != codigo:
        err("%s: el código %s no coincide con lineas.json (%s)" % (arch, src.get("codigo"), codigo))
    linea["intro"] = src.get("intro", "")
    total_lecciones = 0
    for niv in src.get("niveles", []):
        n_out = {"id": niv["id"], "titulo": niv["titulo"], "modulos": []}
        for mod in niv.get("modulos", []):
            m_out = {"id": mod["id"], "titulo": mod["titulo"], "lecciones": []}
            for lec in mod.get("lecciones", []):
                donde = lec["id"]
                if lec["id"] in ids:
                    err("id repetido %s" % lec["id"])
                ids.add(lec["id"])
                refs = expandir(lec.get("contenido", []), orden, bloques, qa, donde)
                cuerpo = [bloque_salida(r, bloques, qa, vistas) for r in refs]
                texto = " ".join((c.get("lbl", "") + " " + c["f"]) if c["t"] == "nota" else c["f"] for c in cuerpo)
                pal = palabras(texto)
                if pal > MAX_PALABRAS:
                    err("%s: %d palabras (máximo %d)" % (donde, pal, MAX_PALABRAS))
                fuentes, vistos = [], set()
                for r in refs:
                    f = fuente_de(r, bloques, vistas, qa)
                    key = f.get("qa") or (f["vista"] + "/" + f["sub"])
                    if key in vistos:
                        continue
                    vistos.add(key)
                    if "qa" not in f:
                        f = {"vista": f["vista"], "sub": f["sub"],
                             "texto": vistas[f["vista"]]["menu"] + " › " + titulo_sub(vistas, f["vista"], f["sub"])}
                    fuentes.append(f)
                pregs = []
                for p in lec.get("preguntas", []):
                    q = validar_pregunta(p, donde, ids, bloques, qa, vistas)
                    if q:
                        pregs.append(q)
                if not 3 <= len(pregs) <= 5:
                    err("%s: tiene %d preguntas (van de 3 a 5)" % (donde, len(pregs)))
                m_out["lecciones"].append({
                    "id": lec["id"], "titulo": lec["titulo"], "palabras": pal,
                    "minutos": min(3, max(2, int(round(pal / 100.0)))),
                    "fuentes": fuentes, "cuerpo": cuerpo, "preguntas": pregs})
                total_lecciones += 1
            n_out["modulos"].append(m_out)
        linea["niveles"].append(n_out)
    for ob in src.get("objeciones", []):
        o_out = {k: ob[k] for k in ("id", "titulo", "cliente", "situacion") if k in ob}
        if ob["id"] in ids:
            err("id repetido %s" % ob["id"])
        ids.add(ob["id"])
        o_out["pasos"] = []
        for paso in ob.get("pasos", []):
            q = validar_pregunta(dict(paso, tipo="opcion"), ob["id"], ids, bloques, qa, vistas)
            if q:
                q["paso"] = paso.get("paso", "")
                q["explicaciones"] = paso.get("explicaciones", [])
                if len(q["explicaciones"]) not in (0, len(q.get("opciones", []))):
                    err("%s: una explicación por opción" % q["id"])
                o_out["pasos"].append(q)
        manual = []
        for r in ob.get("manual", []):
            refs = expandir([r], orden, bloques, qa, ob["id"])
            for x in refs:
                f = fuente_de(x, bloques, vistas, qa)
                manual.append({"f": qa[x["qa"]]["a"] if isinstance(x, dict) else bloques[x]["fmt"],
                               "fuente": f})
        if not manual:
            err("%s: la objeción no tiene texto del manual" % ob["id"])
        o_out["manual"] = manual
        linea["objeciones"].append(o_out)
    return linea


def main():
    revisar = "--revisar" in sys.argv
    man, bloques, orden, vistas, qa = cargar()
    cat = json.load(open(os.path.join(DATOS, "lineas.json"), encoding="utf-8"))
    ids = set()
    lineas = [construir_linea(m, man, bloques, orden, vistas, qa, ids) for m in cat["lineas"]]
    codigos = [l["codigo"] for l in lineas]
    if len(set(codigos)) != len(codigos):
        err("códigos de línea repetidos")
    datos = {"manual": man["manual"], "lineas": lineas,
             "contextoIA": [l for l in man["contexto"] if re.match(
                 r"^(PORTAFOLIO|Castrol|FUNDAMENTOS|20W-50|COMPOSICIÓN|MOTOR 4T|SIN CAMBIO|TURBO|VENTA)", l)]}
    if errores:
        print("NO SE CONSTRUYÓ. Revisa:")
        for e in errores:
            print("  -", e)
        sys.exit(1)
    for l in lineas:
        n_lec = sum(len(m["lecciones"]) for n in l["niveles"] for m in n["modulos"])
        n_pre = sum(len(x["preguntas"]) for n in l["niveles"] for m in n["modulos"] for x in m["lecciones"])
        print("Línea %s %s: %d niveles, %d lecciones, %d preguntas, %d objeciones%s" % (
            l["codigo"], l["nombre"], len(l["niveles"]), n_lec, n_pre, len(l["objeciones"]),
            "" if l["niveles"] else " (Próximamente)"))
    if revisar:
        return
    html = open(INDEX, encoding="utf-8").read()
    js = json.dumps(datos, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    a = '<script type="application/json" id="datos-academia">'
    i = html.index(a) + len(a)
    j = html.index("</script>", i)
    html = html[:i] + js + html[j:]
    ini, fin = "/* <IA-DEL-MANUAL> */", "/* </IA-DEL-MANUAL> */"
    i = html.index(ini) + len(ini)
    j = html.index(fin, i)
    gem = "\n" + "\n".join(man["gemini"][k] for k in GEM_ORDEN) + "\n  "
    html = html[:i] + gem + html[j:]
    ini, fin = "<!-- <GUIA-IA> -->", "<!-- </GUIA-IA> -->"
    i = html.index(ini) + len(ini)
    j = html.index(fin, i)
    html = html[:i] + man["guia_ia"] + html[j:]
    open(INDEX, "w", encoding="utf-8").write(html)
    print("index.html: %d KB" % (len(html.encode("utf-8")) // 1024))


if __name__ == "__main__":
    main()
