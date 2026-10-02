"""Simulador de objeciones con opciones y sin clave de IA."""
import os

import pytest

from ayudas import datos, empezar, leer
from conftest import RAIZ


@pytest.mark.parametrize("tema", ["light", "dark"])
def test_objeciones_con_opciones_sin_ia(nueva, tema):
    page = nueva(tema=tema)
    empezar(page)
    d = datos(page)
    objs = d["lineas"][0]["objeciones"]
    page.click('.tab[data-tab="simulador"]')
    page.wait_for_selector(".obj")
    assert len(page.query_selector_all(".obj")) == len(objs) >= 5
    assert "Sin IA" in page.inner_text("main")

    o = objs[0]
    page.click('.obj[data-obj="%s"]' % o["id"])
    page.wait_for_selector(".cliente")
    assert o["cliente"] in page.inner_text(".cliente")
    for k, paso in enumerate(o["pasos"]):
        assert paso["paso"].upper() in page.inner_text(".paso >> nth=%d" % k).upper()
        bien = k != 1          # el paso 2 se responde mal para ver la retroalimentación
        i = paso["correcta"] if bien else (paso["correcta"] + 1) % len(paso["opciones"])
        page.click('.paso >> nth=%d >> .opt[data-op="%d"]' % (k, i))
        page.click("#obj-comprobar")
        fb = page.inner_text(".paso >> nth=%d >> .fb" % k)
        assert paso["explicaciones"][i] in fb
        assert "Así lo dice el manual" in fb
        if not bien:
            assert "Lo que va: " + paso["opciones"][paso["correcta"]] in fb
        if k < len(o["pasos"]) - 1:
            page.click("#obj-siguiente")
    # sin clave: la respuesta libre no aparece y la app lo dice en una frase
    libre = page.inner_text("#libre")
    assert "Sin IA" in libre and page.query_selector("#libre-texto") is None
    page.screenshot(path=os.path.join(RAIZ, "tests", "salida", "objecion-%s.png" % tema), full_page=True)
    r = leer(page, "academia.progreso")["objeciones"][o["id"]]
    assert r["bien"] == 2 and r["total"] == 3
    page.goto(page.base + "#/simulador")
    assert "2/3 ✓" in page.inner_text('.obj[data-obj="%s"]' % o["id"])
    assert page.errores == [], page.errores
