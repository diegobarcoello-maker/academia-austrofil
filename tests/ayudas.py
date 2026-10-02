"""Ayudas para manejar la app desde las pruebas, tal como lo haría un asesor con el dedo."""
import json

NOMBRE = "María José Pérez"


def datos(page):
    return page.evaluate("JSON.parse(document.getElementById('datos-academia').textContent)")


def indice(d):
    lec, pre = {}, {}
    for l in d["lineas"]:
        for n in l["niveles"]:
            for m in n["modulos"]:
                for x in m["lecciones"]:
                    lec[x["id"]] = x
                    for p in x["preguntas"]:
                        pre[p["id"]] = p
    return lec, pre


def lecciones_de_nivel(d, codigo, n):
    l = next(x for x in d["lineas"] if x["codigo"] == codigo)
    return [x["id"] for m in l["niveles"][n]["modulos"] for x in m["lecciones"]]


def todas_las_lecciones(d, codigo=11):
    l = next(x for x in d["lineas"] if x["codigo"] == codigo)
    return [x["id"] for n in l["niveles"] for m in n["modulos"] for x in m["lecciones"]]


def empezar(page, nombre=NOMBRE):
    page.goto(page.base)
    page.fill("#nombre", nombre)
    page.click("#empezar")
    page.wait_for_selector(".nivel")


def responder(page, pre, bien=True):
    """Responde la pregunta en pantalla, bien o mal, y toca Comprobar (o Siguiente en el examen)."""
    pid = page.get_attribute("#enunciado", "data-pid")
    p = pre[pid]
    if p["tipo"] == "opcion":
        i = p["correcta"] if bien else next(k for k in range(len(p["opciones"])) if k != p["correcta"])
        page.click('.opt[data-op="%d"]' % i)
    elif p["tipo"] == "vf":
        v = p["correcta"] if bien else not p["correcta"]
        page.click('.opt[data-vf="%s"]' % ("true" if v else "false"))
    else:
        n = len(p["pares"])
        orden = list(range(n)) if bien else [1, 0] + list(range(2, n))
        for i in range(n):
            page.click('.mi[data-izq="%d"]' % i)
            page.click('.mi[data-der="%d"]' % orden[i])
    page.click("#comprobar")
    return pid


def hacer_quiz(page, pre, fallar=0, examen=False):
    """Contesta todas las preguntas de la sesión; falla las primeras «fallar». Devuelve los ids fallados."""
    fallados = []
    k = 0
    while True:
        page.wait_for_selector("#enunciado, #resultado")
        if page.query_selector("#resultado"):
            break
        bien = k >= fallar
        pid = responder(page, pre, bien)
        if not bien:
            fallados.append(pid)
        if not examen:
            page.wait_for_selector("#feedback")
            page.click("#siguiente")
        k += 1
    return fallados


def sembrar(page, lecciones, nombre=NOMBRE, extra=None):
    """Deja el avance guardado como si el asesor ya hubiera aprobado esas lecciones."""
    prog = {"v": 1, "lecciones": {x: {"ok": True, "mejor": 5, "total": 5, "intentos": 1, "fecha": "2026-09-30"} for x in lecciones},
            "examenes": {}, "stats": {}}
    if extra:
        prog.update(extra)
    page.evaluate("""([n, p]) => { localStorage.setItem('academia.nombre', n); localStorage.setItem('academia.progreso', p); }""",
                  [nombre, json.dumps(prog)])


def leer(page, clave):
    v = page.evaluate("k => localStorage.getItem(k)", clave)
    try:
        return json.loads(v) if v and v[:1] in "{[" else v
    except ValueError:
        return v
