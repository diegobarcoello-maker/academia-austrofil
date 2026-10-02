"""Pruebas de la Academia en Chromium con perfil de celular Android (Pixel 7).

Uso:  python3 -m pytest tests -q
Necesita Playwright para Python con Chromium. No usa internet: Google Fonts y Gemini se simulan.
"""
import functools, json, os, re, shutil, socket, sys, tempfile, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import pytest
from playwright.sync_api import sync_playwright

# para que Google Fonts simulado llegue también a las peticiones del service worker (Chromium)
os.environ.setdefault("PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS", "1")

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

FUENTE_TTF = next((p for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                               "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf") if os.path.exists(p)), None)
CSS_FUENTES = """/* latin */
@font-face { font-family: 'Archivo'; font-style: normal; font-weight: 600 800; font-display: swap;
  src: url(https://fonts.gstatic.com/s/archivo/prueba-archivo.ttf) format('truetype'); unicode-range: U+0000-00FF; }
/* latin */
@font-face { font-family: 'IBM Plex Mono'; font-style: normal; font-weight: 500 600; font-display: swap;
  src: url(https://fonts.gstatic.com/s/ibmplexmono/prueba-mono.ttf) format('truetype'); unicode-range: U+0000-00FF; }
/* latin */
@font-face { font-family: 'IBM Plex Sans'; font-style: normal; font-weight: 400 600; font-display: swap;
  src: url(https://fonts.gstatic.com/s/ibmplexsans/prueba-sans.ttf) format('truetype'); unicode-range: U+0000-00FF; }
"""


class _Silencioso(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        # como GitHub Pages: el navegador puede guardar 10 minutos y revalidar con Last-Modified
        self.send_header("Cache-Control", "max-age=600")
        super().end_headers()


class Servidor:
    """http.server en localhost sobre una carpeta (por defecto, el repo)."""
    def __init__(self, carpeta):
        self.carpeta = carpeta
        s = socket.socket(); s.bind(("127.0.0.1", 0)); self.puerto = s.getsockname()[1]; s.close()
        h = functools.partial(_Silencioso, directory=carpeta)
        self.httpd = ThreadingHTTPServer(("127.0.0.1", self.puerto), h)
        self.hilo = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.hilo.start()
        self.url = "http://127.0.0.1:%d/" % self.puerto

    def cerrar(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture(scope="session")
def servidor():
    s = Servidor(RAIZ)
    yield s
    s.cerrar()


@pytest.fixture
def copia_repo():
    """Copia del repo en una carpeta temporal (para simular una versión nueva publicada)."""
    tmp = tempfile.mkdtemp(prefix="academia-")
    for nombre in ("index.html", "sw.js", "manifest.webmanifest", ".nojekyll"):
        shutil.copy(os.path.join(RAIZ, nombre), tmp)
    shutil.copytree(os.path.join(RAIZ, "icons"), os.path.join(tmp, "icons"))
    s = Servidor(tmp)
    yield s
    s.cerrar()
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(scope="session")
def pw():
    with sync_playwright() as p:
        yield p


@pytest.fixture(scope="session")
def navegador(pw):
    b = pw.chromium.launch()
    yield b
    b.close()


def rutas_fuentes(ctx, registro=None):
    """Google Fonts simulado (la nube no llega a fonts.googleapis.com): hoja «latin» y un TTF local."""
    def css(route):
        if registro is not None:
            registro.append(route.request.url)
        route.fulfill(status=200, body=CSS_FUENTES, headers={"content-type": "text/css; charset=utf-8",
                                                             "access-control-allow-origin": "*"})

    def ttf(route):
        if registro is not None:
            registro.append(route.request.url)
        body = open(FUENTE_TTF, "rb").read() if FUENTE_TTF else b""
        route.fulfill(status=200, body=body, headers={"content-type": "font/ttf", "access-control-allow-origin": "*"})
    ctx.route("https://fonts.googleapis.com/**", css)
    ctx.route("https://fonts.gstatic.com/**", ttf)


class Errores(list):
    """pageerror y console.error de la app. Ignora solo los avisos de red de respuestas fallidas
    que la prueba simula a propósito (por ejemplo, el 429 de Gemini)."""
    def __init__(self):
        super().__init__()
        self.permitidos = []

    def vigilar(self, page):
        page.on("pageerror", lambda e: self.append("pageerror: %s" % e))
        def consola(m):
            if m.type != "error":
                return
            t = m.text
            if any(re.search(p, t) for p in self.permitidos):
                return
            self.append("console.error: %s" % t)
        page.on("console", consola)
        return page


@pytest.fixture
def nueva(navegador, pw, servidor):
    """Crea un contexto Android limpio: nueva(tema='light'|'dark', reloj=None, sw=False)."""
    abiertos = []

    def crear(tema="light", sw="block", reloj=None, url=None):
        dev = dict(pw.devices["Pixel 7"])
        ctx = navegador.new_context(**dev, color_scheme=tema, service_workers=sw, locale="es-EC",
                                    timezone_id="America/Guayaquil", accept_downloads=True)
        rutas_fuentes(ctx)
        page = ctx.new_page()
        errores = Errores()
        errores.vigilar(page)
        if reloj is not None:
            page.clock.install(time=reloj)
        page.errores = errores
        page.base = url or servidor.url
        abiertos.append(ctx)
        return page

    yield crear
    for c in abiertos:
        c.close()
