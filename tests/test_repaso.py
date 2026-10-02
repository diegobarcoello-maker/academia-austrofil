"""Repaso por cajas y racha, simulando días con page.clock (fecha local del celular)."""
import datetime, json

from ayudas import datos, empezar, hacer_quiz, indice, leer, responder, sembrar

DIA = lambda d: datetime.datetime(2026, 10, d, 9, 0)


def ir_a_repaso(page):
    page.goto(page.base + "#/repaso")
    page.reload()
    page.wait_for_selector("#racha-n")


def test_cajas_y_racha_por_dias(nueva):
    page = nueva(reloj=DIA(1))
    empezar(page)
    d = datos(page)
    lec, pre = indice(d)

    # día 1: lección aprobada con 1 falla → esa a la caja 1 (mañana); las demás a la caja 2 (en 2 días)
    page.goto(page.base + "#/leccion/11-L01")
    page.click("#hacer-quiz")
    fallada = hacer_quiz(page, pre, fallar=1)[0]
    items = leer(page, "academia.repaso")["items"]
    assert items[fallada] == {"c": 1, "d": "2026-10-02"}
    otras = [p for p in items if p != fallada]
    assert len(otras) == 4 and all(items[p] == {"c": 2, "d": "2026-10-03"} for p in otras)
    ir_a_repaso(page)
    assert page.inner_text("#racha-n") == "0"
    # hoy no vence nada: práctica corta para no perder la racha
    assert "práctica corta" in page.inner_text("#empezar-repaso")

    # día 2: vence la fallada; se acierta → sube a la caja 2 (vuelve en 2 días); racha 1
    page.clock.set_system_time(DIA(2))
    ir_a_repaso(page)
    assert "Repasar 1 pregunta" in page.inner_text("#empezar-repaso")
    assert page.inner_text("#badge-repaso") == "1"
    page.click("#empezar-repaso")
    hacer_quiz(page, pre, fallar=0)
    assert "Repaso hecho" in page.inner_text("#resultado h1")
    assert leer(page, "academia.repaso")["items"][fallada] == {"c": 2, "d": "2026-10-04"}
    assert leer(page, "academia.racha")["dias"] == 1

    # día 3: vencen las 4 de la caja 2; se falla una → vuelve a la caja 1; las otras a la 3 (4 días)
    page.clock.set_system_time(DIA(3))
    ir_a_repaso(page)
    assert "Repasar 4 preguntas" in page.inner_text("#empezar-repaso")
    page.click("#empezar-repaso")
    falladas = hacer_quiz(page, pre, fallar=1)
    it = leer(page, "academia.repaso")["items"]
    assert it[falladas[0]] == {"c": 1, "d": "2026-10-04"}
    assert sorted(v["c"] for k, v in it.items() if k in otras and k != falladas[0]) == [3, 3, 3]
    assert all(v["d"] == "2026-10-07" for k, v in it.items() if v["c"] == 3)
    assert leer(page, "academia.racha")["dias"] == 2

    # mismo día: la racha no sube dos veces
    ir_a_repaso(page)
    assert page.inner_text("#racha-n") == "2"

    # se salta el día 4 y el 5: la racha se corta
    page.clock.set_system_time(DIA(6))
    ir_a_repaso(page)
    assert page.inner_text("#racha-n") == "0"
    page.click("#empezar-repaso")
    hacer_quiz(page, pre, fallar=0)
    assert leer(page, "academia.racha")["dias"] == 1
    assert leer(page, "academia.racha")["mejor"] == 2
    assert page.errores == [], page.errores


def test_caja_5_queda_fija_y_maximo_10_al_dia(nueva):
    page = nueva(reloj=DIA(10))
    page.goto(page.base)
    d = datos(page)
    lec, pre = indice(d)
    # 15 preguntas vencidas: 14 en la caja 1 y una en la caja 5
    ids = [p for x in ("11-L01", "11-L02", "11-L03") for p in [q["id"] for q in lec[x]["preguntas"]]]
    items = {pid: {"c": 1, "d": "2026-10-09"} for pid in ids[:14]}
    items[ids[14]] = {"c": 5, "d": "2026-10-01"}
    sembrar(page, ["11-L01", "11-L02", "11-L03"])
    page.evaluate("r => localStorage.setItem('academia.repaso', r)",
                  json.dumps({"v": 1, "items": items, "fijas": {}, "dia": "", "hechas": 0, "hecho": ""}))
    ir_a_repaso(page)
    assert "Repasar 10 preguntas" in page.inner_text("#empezar-repaso")
    page.click("#empezar-repaso")
    assert page.inner_text(".qn") == "1/10"
    # la primera es de la caja 1 (van de la caja más baja a la más alta)
    hacer_quiz(page, pre, fallar=0)
    r = leer(page, "academia.repaso")
    assert r["hechas"] == 10 and r["dia"] == "2026-10-10"
    ir_a_repaso(page)
    assert page.is_disabled(".actionbar .btn")
    assert "vuelve mañana" in page.inner_text(".actionbar .btn")

    # al día siguiente sigue con las que faltaban, incluida la de la caja 5: si acierta, queda fija
    page.clock.set_system_time(DIA(11))
    ir_a_repaso(page)
    page.click("#empezar-repaso")
    hacer_quiz(page, pre, fallar=0)
    r = leer(page, "academia.repaso")
    assert ids[14] in r["fijas"] and ids[14] not in r["items"]
    assert page.errores == [], page.errores
