"""Ruta: lección y quiz aprobando y reprobando, bloqueo de nivel, examen y certificado. En modo claro y oscuro."""
import io, json, os

import pytest
from PIL import Image

from ayudas import NOMBRE, datos, empezar, hacer_quiz, indice, leer, lecciones_de_nivel, sembrar, todas_las_lecciones
from conftest import RAIZ

SALIDA = os.path.join(RAIZ, "tests", "salida")
os.makedirs(SALIDA, exist_ok=True)


@pytest.mark.parametrize("tema", ["light", "dark"])
def test_leccion_reprobar_y_aprobar_con_bloqueo_de_nivel(nueva, tema):
    page = nueva(tema=tema)
    empezar(page)
    fondo = page.evaluate("getComputedStyle(document.body).backgroundColor")
    assert fondo == ("rgb(241, 243, 239)" if tema == "light" else "rgb(18, 21, 19)")
    d = datos(page)
    lec, pre = indice(d)
    page.screenshot(path=os.path.join(SALIDA, "ruta-%s.png" % tema))

    # el nivel 2 está bloqueado: su lección no se abre
    assert page.is_disabled('[data-lec="11-L07"]')
    page.goto(page.base + "#/leccion/11-L07")
    assert "Esta lección se abre cuando apruebes todo el nivel 1" in page.inner_text("main")

    # lección 1: se lee con su fuente y se hace el quiz
    page.goto(page.base + "#/ruta")
    page.click('[data-lec="11-L01"]')
    page.wait_for_selector(".cuerpo")
    assert "Fuente: Lubricantes › Qué es lubricar" in page.inner_text(".fuentes")
    page.screenshot(path=os.path.join(SALIDA, "leccion-%s.png" % tema), full_page=True)
    page.click("#hacer-quiz")
    primero = [page.get_attribute("#enunciado", "data-pid")]

    # reprobar: 2 malas de 5 (necesita 4 de 5)
    fallados = hacer_quiz(page, pre, fallar=2)
    assert page.inner_text("#resultado h1") == "Te faltó poco"
    assert "Necesitas 4 de 5" in page.inner_text("#resultado")
    # ve por qué falló, con el texto del manual
    bloques = page.query_selector_all(".fallo")
    assert len(bloques) == 2
    for pid, b in zip(fallados, bloques):
        assert pre[pid]["cita"].replace('"', "")[:25] in b.inner_text().replace('"', "").replace("«", "").replace("»", "")
    page.screenshot(path=os.path.join(SALIDA, "reprobado-%s.png" % tema), full_page=True)
    # las falladas pasan al repaso (caja 1)
    rep = leer(page, "academia.repaso")
    for pid in fallados:
        assert rep["items"][pid]["c"] == 1
    assert not leer(page, "academia.progreso")["lecciones"]["11-L01"]["ok"]

    # repetir: mismas preguntas en otro orden
    orden1 = page.evaluate("() => null")
    page.click("#repetir")
    page.wait_for_selector("#enunciado")
    segundo = page.get_attribute("#enunciado", "data-pid")
    hacer_quiz(page, pre, fallar=0)
    assert page.inner_text("#resultado h1") == "¡Lección aprobada!"
    assert leer(page, "academia.progreso")["lecciones"]["11-L01"]["ok"] is True

    # el nivel 2 sigue bloqueado hasta aprobar TODAS las lecciones del nivel 1
    page.goto(page.base + "#/ruta")
    assert page.is_disabled('[data-lec="11-L07"]')
    for x in lecciones_de_nivel(d, 11, 0)[1:]:
        page.goto(page.base + "#/leccion/" + x)
        page.click("#hacer-quiz")
        hacer_quiz(page, pre, fallar=0)
        assert page.inner_text("#resultado h1") == "¡Lección aprobada!"
    assert "Se abrió el nivel 2" in page.inner_text("#resultado")
    page.goto(page.base + "#/ruta")
    assert not page.is_disabled('[data-lec="11-L07"]')
    assert "Aprobado ✓" in page.inner_text(".nivel >> nth=0")

    # el avance sobrevive a recargar
    page.reload()
    page.wait_for_selector(".nivel")
    assert "6/23" in page.inner_text(".kpis")
    assert page.errores == [], page.errores


def test_orden_distinto_al_repetir(nueva):
    page = nueva()
    empezar(page)
    d = datos(page)
    lec, pre = indice(d)
    page.goto(page.base + "#/leccion/11-L02")
    page.click("#hacer-quiz")
    orden1 = []
    for _ in range(5):
        orden1.append(page.get_attribute("#enunciado", "data-pid"))
        # todas mal para reprobar
        from ayudas import responder
        responder(page, pre, bien=False)
        page.click("#siguiente")
    page.click("#repetir")
    orden2 = []
    for _ in range(5):
        orden2.append(page.get_attribute("#enunciado", "data-pid"))
        from ayudas import responder
        responder(page, pre, bien=True)
        page.click("#siguiente")
    assert sorted(orden1) == sorted(orden2) and orden1 != orden2
    assert page.errores == [], page.errores


@pytest.mark.parametrize("tema", ["light", "dark"])
def test_examen_reprobar_aprobar_y_certificado(nueva, tema):
    page = nueva(tema=tema)
    page.goto(page.base)
    page.wait_for_selector("#nombre")
    d = datos(page)
    lec, pre = indice(d)
    todas = todas_las_lecciones(d)

    # sin aprobar todos los niveles el examen no se habilita
    sembrar(page, todas[:-1])
    page.goto(page.base + "#/examen/11")
    page.reload()
    page.wait_for_selector(".vhead")
    assert page.query_selector("#empezar-examen") is None
    assert "Se habilita cuando apruebes" in page.inner_text("main")

    sembrar(page, todas)
    page.reload()
    page.goto(page.base + "#/ruta")
    assert "Rendir el examen" in page.inner_text("#examcard")
    page.goto(page.base + "#/examen/11")
    page.click("#empezar-examen")
    page.wait_for_selector("#enunciado")
    # 20 preguntas al azar del banco fijo, sin retroalimentación hasta el final
    assert page.inner_text(".qn") == "1/20"
    fallados = hacer_quiz(page, pre, fallar=5, examen=True)
    assert len(fallados) == 5
    assert page.inner_text("#resultado .big") == "15/20"
    assert "75 %" in page.inner_text("#resultado")
    assert page.inner_text("#resultado h1") == "Todavía no"
    assert len(page.query_selector_all(".fallo")) == 5
    ex = leer(page, "academia.progreso")["examenes"]["11"]
    assert ex["intentos"] == 1 and not ex.get("aprobado")

    # se puede repetir: otras 20 al azar; 16 de 20 = 80 % aprueba
    page.click("#repetir-examen")
    page.wait_for_selector("#enunciado")
    ids = []
    fallados2 = hacer_quiz(page, pre, fallar=4, examen=True)
    assert page.inner_text("#resultado .big") == "16/20"
    assert page.inner_text("#resultado h1") == "¡Aprobaste el examen!"
    ex = leer(page, "academia.progreso")["examenes"]["11"]
    assert ex["aprobado"] and ex["cert"]["pct"] == 80 and ex["intentos"] == 2

    # certificado en PNG dibujado en canvas, con nombre, fecha, nota y línea
    page.click("#ver-cert")
    page.wait_for_selector("canvas#cert")
    page.wait_for_function("document.getElementById('cert').toDataURL().length > 20000")
    etiqueta = page.get_attribute("#cert", "aria-label")
    assert NOMBRE in etiqueta and "11 · Lubricantes" in etiqueta and "80 %" in etiqueta
    page.screenshot(path=os.path.join(SALIDA, "certificado-%s.png" % tema), full_page=True)
    with page.expect_download() as dl:
        page.click("#cert-descargar")
    ruta = dl.value.path()
    assert dl.value.suggested_filename == "certificado-academia-austrofil-lubricantes.png"
    img = Image.open(ruta)
    assert img.size == (1600, 1131) and img.format == "PNG"
    img.save(os.path.join(SALIDA, "certificado.png"))
    # el fondo del certificado no es un lienzo vacío
    colores = img.convert("RGB").getcolors(1600 * 1131)
    assert len(colores) > 50

    # Compartir: con el menú de compartir de Android (navigator.share con el archivo)
    page.evaluate("""() => {
      window.__compartido = null;
      navigator.canShare = (d) => !!(d && d.files && d.files.length);
      navigator.share = (d) => { window.__compartido = { n: d.files[0].name, t: d.files[0].type, s: d.files[0].size, txt: d.text }; return Promise.resolve(); };
    }""")
    page.click("#cert-compartir")
    page.wait_for_function("window.__compartido !== null")
    c = page.evaluate("window.__compartido")
    assert c["t"] == "image/png" and c["s"] > 20000 and "Academia Austrofil" in c["txt"]
    # sin menú de compartir: descarga y abre WhatsApp (se revisa el enlace, no se abre)
    page.evaluate("""() => { window.__abiertos = []; navigator.canShare = undefined; window.open = (u) => { window.__abiertos.push(u); return null; }; }""")
    with page.expect_download():
        page.click("#cert-compartir")
    page.wait_for_function("window.__abiertos.length === 1")
    assert page.evaluate("window.__abiertos[0]").startswith("https://wa.me/?text=")
    assert page.errores == [], page.errores


def test_nombre_se_pide_una_vez_y_se_corrige(nueva):
    page = nueva()
    empezar(page, "Pedro")
    page.goto(page.base + "#/ajustes")
    page.fill("#ajuste-nombre", "Pedro Andrés Quito")
    page.click("#guardar-nombre")
    assert leer(page, "academia.nombre") == "Pedro Andrés Quito"
    page.reload()
    page.wait_for_selector("#ajuste-nombre")
    assert page.input_value("#ajuste-nombre") == "Pedro Andrés Quito"
    page.goto(page.base + "#/ruta")
    assert "hola, pedro" in page.inner_text(".vhead").lower()
    assert page.errores == [], page.errores
