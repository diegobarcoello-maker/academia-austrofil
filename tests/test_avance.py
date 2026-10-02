"""Avance: sobrevive a recargar, texto de formato fijo, enlace de WhatsApp (se revisa, no se abre) y código de respaldo."""
import datetime, re, urllib.parse

from ayudas import NOMBRE, datos, empezar, hacer_quiz, indice, leer, sembrar, todas_las_lecciones


def test_texto_exportado_enlace_y_respaldo(nueva):
    reloj = datetime.datetime(2026, 10, 1, 9, 30)
    page = nueva(reloj=reloj)
    empezar(page)
    d = datos(page)
    lec, pre = indice(d)
    # dos lecciones: la primera con una falla (pasa con 4 de 5), la segunda perfecta
    page.goto(page.base + "#/leccion/11-L01")
    page.click("#hacer-quiz")
    hacer_quiz(page, pre, fallar=1)
    page.goto(page.base + "#/leccion/11-L02")
    page.click("#hacer-quiz")
    hacer_quiz(page, pre, fallar=0)

    # sobrevive a recargar
    page.reload()
    page.wait_for_selector(".nivel")
    assert "2/23" in page.inner_text(".kpis")

    page.goto(page.base + "#/avance")
    t = page.inner_text("#export-texto")
    lineas = t.split("\n")
    assert lineas[0] == "ACADEMIA AUSTROFIL · AVANCE"
    assert lineas[1] == "Asesor: " + NOMBRE
    assert lineas[2] == "Fecha: 01-10-2026"
    assert lineas[3] == "Línea: 11 Lubricantes"
    assert lineas[4] == "Niveles aprobados: 0/4 (N1 2/6 N2 0/6 N3 0/5 N4 0/6) · lecciones 2/23"
    assert lineas[5] == "Examen: no rendido"
    assert lineas[6].startswith("Temas flojos: ")
    assert lineas[7] == "Racha: 0 días"
    assert re.match(r"App: versión \d+$", lineas[8])
    assert len(lineas) == 9
    href = page.get_attribute("#enviar-avance", "href")
    assert href == "https://wa.me/?text=" + urllib.parse.quote(t, safe="-_.!~*'()")
    assert urllib.parse.unquote(href.split("text=", 1)[1]) == t

    # código de respaldo
    page.click("#crear-codigo")
    page.wait_for_selector("#codigo:not([hidden])")
    codigo = page.inner_text("#codigo").strip()
    assert re.match(r"^AA[01]\.[A-Za-z0-9_-]+\.[0-9a-z]{6}$", codigo)
    assert "AIza" not in codigo
    enviar = page.get_attribute("#enviar-codigo", "href")
    assert enviar.startswith("https://wa.me/?text=") and urllib.parse.quote(codigo) in enviar
    prog_original = leer(page, "academia.progreso")
    rep_original = leer(page, "academia.repaso")
    assert page.errores == [], page.errores

    # celular nuevo: se restaura desde la bienvenida
    otro = nueva(reloj=reloj)
    otro.goto(otro.base)
    otro.click("#tengo-codigo")
    otro.wait_for_selector("#restaurar-texto")
    # un código dañado se rechaza con un mensaje claro
    malo = codigo[:-8] + ("A" if codigo[-8] != "A" else "B") + codigo[-7:]
    otro.fill("#restaurar-texto", malo)
    otro.click("#restaurar")
    otro.wait_for_function("document.getElementById('restaurar-estado').textContent.length > 10")
    assert "incompleto" in otro.inner_text("#restaurar-estado") or "no es" in otro.inner_text("#restaurar-estado")
    otro.fill("#restaurar-texto", codigo)
    otro.click("#restaurar")
    otro.click(".sheet .btn >> text=Restaurar")
    otro.wait_for_selector(".toast:not([hidden])")
    assert leer(otro, "academia.nombre") == NOMBRE
    assert leer(otro, "academia.progreso") == prog_original
    assert leer(otro, "academia.repaso") == rep_original
    otro.goto(otro.base + "#/ruta")
    otro.wait_for_selector(".nivel")
    assert "2/23" in otro.inner_text(".kpis")
    assert otro.errores == [], otro.errores


def test_examen_y_temas_flojos_en_el_reporte(nueva):
    page = nueva(reloj=datetime.datetime(2026, 10, 3, 10, 0))
    page.goto(page.base)
    d = datos(page)
    todas = todas_las_lecciones(d)
    lec, pre = indice(d)
    # todo aprobado, examen aprobado con 18/20 y errores repetidos en las normas
    normas = [p["id"] for x in ("11-L09", "11-L10", "11-L11", "11-L12") for p in lec[x]["preguntas"]]
    stats = {pid: [1, 2] for pid in normas}
    sembrar(page, todas, extra={"examenes": {"11": {"intentos": 2, "mejor": 18, "total": 20, "aprobado": True,
                                                   "cert": {"bien": 18, "total": 20, "pct": 90, "fecha": "2026-10-02"}}},
                                "stats": stats})
    page.evaluate("""() => localStorage.setItem('academia.racha', JSON.stringify({v:1, dias:4, ultimo:'2026-10-02', mejor:4}))""")
    page.goto(page.base + "#/avance")
    page.reload()
    t = page.inner_text("#export-texto").split("\n")
    assert t[4] == "Niveles aprobados: 4/4 (N1 ✓ N2 ✓ N3 ✓ N4 ✓) · lecciones 23/23"
    assert t[5] == "Examen: 18/20 (90 %) aprobado 02-10-2026"
    assert t[6] == "Temas flojos: Normas API, ILSAC y JASO"
    assert t[7] == "Racha: 4 días"
    assert page.errores == [], page.errores
