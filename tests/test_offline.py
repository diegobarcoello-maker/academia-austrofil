"""Sin internet después de la primera carga (http.server en localhost) y aviso de versión nueva con «Actualizar»."""
import os, re, time

from ayudas import datos, empezar, hacer_quiz, indice


def esperar_sw(page):
    page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=20000)


def test_sin_internet_despues_de_la_primera_carga(nueva):
    page = nueva(sw="allow")
    empezar(page)
    esperar_sw(page)
    v = page.evaluate("() => document.getElementById('dver').textContent.match(/Versión (\\d+)/)[1]")
    claves = sorted(page.evaluate("caches.keys()"))
    assert claves == ["academia-v%s" % v, "academia-v%s-fuentes" % v]
    app = page.evaluate("v => caches.open('academia-v' + v).then(c => c.keys()).then(ks => ks.map(r => new URL(r.url).pathname))", v)
    assert sorted(app) == ["/", "/icons/gota-192.png", "/icons/gota-512.png", "/manifest.webmanifest"]
    fuentes = page.evaluate("v => caches.open('academia-v' + v + '-fuentes').then(c => c.keys()).then(ks => ks.map(r => r.url))", v)
    assert any(u.startswith("https://fonts.googleapis.com/css2") for u in fuentes)
    assert sum(u.startswith("https://fonts.gstatic.com/") for u in fuentes) == 3

    # sin señal: recarga y todo sale del service worker
    page.context.set_offline(True)
    page.reload()
    page.wait_for_selector(".nivel")
    assert page.title() == "Academia Austrofil — Lubricantes"
    page.wait_for_function("document.fonts.check('16px \"IBM Plex Sans\"') && document.fonts.status === 'loaded'")
    assert page.evaluate("[...document.fonts].some(f => f.family.indexOf('IBM Plex Sans') > -1 && f.status === 'loaded')")
    lec, pre = indice(datos(page))
    page.click('[data-lec="11-L01"]')
    page.wait_for_selector(".cuerpo")
    page.click("#hacer-quiz")
    hacer_quiz(page, pre, fallar=0)
    assert page.inner_text("#resultado h1") == "¡Lección aprobada!"
    # la ruta de la app abierta directo (como un ícono del celular) también carga sin señal
    page.goto(page.base + "#/repaso")
    page.wait_for_selector("#racha-n")
    page.context.set_offline(False)
    assert page.errores == [], page.errores


def test_aviso_de_version_nueva_y_borra_solo_sus_caches(nueva, copia_repo):
    page = nueva(sw="allow", url=copia_repo.url)
    empezar(page)
    esperar_sw(page)
    v = int(page.evaluate("() => document.getElementById('dver').textContent.match(/Versión (\\d+)/)[1]"))
    page.evaluate("caches.open('otra-app-v9').then(c => c.put('/otra', new Response('x')))")
    assert page.query_selector("#banner-act[hidden]")

    # se publica la versión siguiente
    ruta = os.path.join(copia_repo.carpeta, "index.html")
    html = open(ruta, encoding="utf-8").read()
    nuevo = re.sub(r"var VERSION = \{ n: \d+, fecha: \"[0-9-]+\" \};", 'var VERSION = { n: %d, fecha: "02-10-2026" };' % (v + 1), html)
    assert nuevo != html
    open(ruta, "w", encoding="utf-8").write(nuevo)
    futuro = time.time() + 30
    os.utime(ruta, (futuro, futuro))

    # al volver a abrir la app aparece el aviso con el botón «Actualizar»
    page.reload()
    page.wait_for_selector("#banner-act:not([hidden])", timeout=15000)
    assert "versión nueva" in page.inner_text("#banner-act")
    assert "Versión %d" % v in page.inner_text("#dver")
    page.click("#banner-btn")
    page.wait_for_function("v => document.getElementById('dver') && document.getElementById('dver').textContent.indexOf('Versión ' + v) === 0",
                           arg=v + 1, timeout=20000)
    claves = sorted(page.evaluate("caches.keys()"))
    assert claves == sorted(["academia-v%d" % (v + 1), "academia-v%d-fuentes" % (v + 1), "otra-app-v9"])
    assert page.query_selector("#banner-act[hidden]")
    # el avance sigue ahí
    page.goto(page.base + "#/ruta")
    page.wait_for_selector(".nivel")
    assert page.errores == [], page.errores
