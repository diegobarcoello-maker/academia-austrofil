"""IA simulada: se intercepta generativelanguage.googleapis.com con page.route.
Casos: clave válida (explica, califica, crea preguntas), clave inválida, error 429, sin señal y JSON mal formado.
Nunca se manda el nombre del asesor a la IA y no se toca ninguna otra clave austrofil.*."""
import json, re

from ayudas import NOMBRE, datos, empezar, hacer_quiz, indice, leer, responder

CLAVE = "PRUEBA-clave-gemini-0123456789abcdefXYZ"      # forma válida para el manual, sin forma de clave real
OTRA_CLAVE_AUSTROFIL = "clave-de-claude-de-prueba"
MODELOS = {"models": [
    {"name": "models/gemini-3.5-flash", "supportedGenerationMethods": ["generateContent", "countTokens"]},
    {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
    {"name": "models/gemini-3.5-flash-lite", "supportedGenerationMethods": ["generateContent"]},
    {"name": "models/gemini-2.5-flash-lite", "supportedGenerationMethods": ["generateContent"]},
    {"name": "models/gemini-flash-latest", "supportedGenerationMethods": ["generateContent"]},
    {"name": "models/gemini-2.5-pro", "supportedGenerationMethods": ["generateContent"]},
    {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]}]}
CLAVE_INVALIDA = {"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT",
                            "details": [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "API_KEY_INVALID",
                                         "domain": "googleapis.com"}]}}
CUPO_DIARIO = {"error": {"code": 429, "message": "You exceeded your current quota, please check your plan and billing details.",
                         "status": "RESOURCE_EXHAUSTED",
                         "details": [{"@type": "type.googleapis.com/google.rpc.QuotaFailure",
                                      "violations": [{"quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                                                      "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
                                     {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "41s"}]}}

PREGUNTAS_IA = [
    {"tipo": "opcion", "enunciado": "¿Cuántas cosas hace el aceite dentro del motor?", "opciones": ["Seis", "Una", "Dos"], "correcta": 0,
     "explicacion": "Reducir fricción es solo una de las seis cosas que hace el aceite."},
    {"tipo": "vf", "enunciado": "Amortiguar es una de las funciones del aceite.", "correcta": True, "explicacion": "Absorbe los golpes."},
    {"tipo": "emparejar", "enunciado": "Empareja función y efecto.",
     "pares": [["Lubricar", "Separa las piezas"], ["Refrigerar", "Se lleva el calor"], ["Sellar", "Cierra la holgura"]],
     "explicacion": "Así lo dice la tabla de funciones."},
    {"tipo": "opcion", "enunciado": "Pregunta con dos correctas que se descarta", "opciones": ["A", "B", "C"], "correcta": [0, 1]},
    {"tipo": "opcion", "enunciado": "Pregunta con índice fuera de rango", "opciones": ["A", "B", "C"], "correcta": 7},
    {"tipo": "abierta", "enunciado": "Tipo que no existe y se descarta"},
]
NOTA = {"nota": 8, "criterios": {"pregunta": True, "argumento": True, "cierre": False},
        "bien": "Preguntaste por el vehículo y el manual antes de opinar.", "falto": "Cerrar con una propuesta concreta.",
        "manual": "No se vende litro, se vende kilómetro protegido."}


def sse(texto, trozos=3):
    n = max(1, len(texto) // trozos)
    partes = [texto[i:i + n] for i in range(0, len(texto), n)]
    out = ""
    for k, p in enumerate(partes):
        ev = {"candidates": [{"content": {"role": "model", "parts": [{"text": p}]}, "index": 0}]}
        if k == len(partes) - 1:
            ev["candidates"][0]["finishReason"] = "STOP"
        out += "data: " + json.dumps(ev, ensure_ascii=False) + "\r\n\r\n"
    return out


class Gemini:
    """Simula la API de Gemini y guarda lo que la app le manda."""
    def __init__(self, page, modo="ok", generar=None, calificar=None):
        self.modo, self.pedidos, self.cuerpos = modo, [], []
        self.generar = generar if generar is not None else json.dumps(PREGUNTAS_IA, ensure_ascii=False)
        self.calificar = calificar if calificar is not None else json.dumps(NOTA, ensure_ascii=False)
        page.route("https://generativelanguage.googleapis.com/**", self.atender)

    def atender(self, route):
        req = route.request
        self.pedidos.append((req.method, req.url, req.headers.get("x-goog-api-key")))
        if req.post_data:
            self.cuerpos.append(req.post_data)
        if self.modo == "sin-senal":
            return route.abort("internetdisconnected")
        clave = req.headers.get("x-goog-api-key")
        if clave != CLAVE or self.modo == "invalida":
            return route.fulfill(status=400, json=CLAVE_INVALIDA)
        if req.method == "GET":
            return route.fulfill(status=200, json=MODELOS)
        if self.modo == "429":
            return route.fulfill(status=429, json=CUPO_DIARIO)
        assert ":streamGenerateContent?alt=sse" in req.url
        cuerpo = json.loads(req.post_data)
        sistema = cuerpo["systemInstruction"]["parts"][0]["text"]
        if "TAREA: el asesor falló" in sistema:
            texto = "Porque lubricar es meter una película de aceite entre las piezas. En el mostrador: «el aceite separa el metal del metal»."
        elif "TAREA: califica" in sistema:
            texto = self.calificar
        else:
            texto = self.generar
        route.fulfill(status=200, body=sse(texto), headers={"content-type": "text/event-stream"})


def guardar_clave(page, clave=CLAVE):
    page.goto(page.base + "#/ajustes/ia")
    page.wait_for_selector("#ckeyin")
    page.fill("#ckeyin", clave)
    page.click("#ckeysave")
    page.wait_for_function("document.getElementById('ckeyst').textContent.indexOf('Verificando') < 0 && document.getElementById('ckeyst').textContent.length > 5")
    return page.inner_text("#ckeyst")


def preparar(nueva):
    page = nueva()
    page.goto(page.base)
    page.evaluate("v => localStorage.setItem('austrofil.claudeKey', v)", OTRA_CLAVE_AUSTROFIL)
    page.errores.permitidos.append(r"Failed to load resource")
    empezar(page)
    return page


def fallar_primera(page, pre):
    """Abre la lección 1, falla la primera pregunta y deja la retroalimentación en pantalla."""
    page.goto(page.base + "#/leccion/11-L01")
    page.click("#hacer-quiz")
    pid = responder(page, pre, bien=False)
    page.wait_for_selector("#feedback")
    return pid


def test_clave_valida_explica_califica_y_crea_preguntas(nueva):
    page = preparar(nueva)
    g = Gemini(page)
    lec, pre = indice(datos(page))
    assert page.inner_text("#iachiptx") == "Sin IA"
    msg = guardar_clave(page)
    assert "clave verificada" in msg
    assert leer(page, "austrofil.geminiKey") == CLAVE
    assert leer(page, "austrofil.geminiModelos") == ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-latest",
                                                    "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"]
    assert leer(page, "austrofil.claudeKey") == OTRA_CLAVE_AUSTROFIL
    assert page.inner_text("#iachiptx") == "IA"
    assert g.pedidos[0][0] == "GET" and "/v1beta/models?pageSize=1000" in g.pedidos[0][1] and g.pedidos[0][2] == CLAVE

    # 1) explica por qué fallé, con el extracto de la lección y la respuesta correcta
    pid = fallar_primera(page, pre)
    page.click("#ia-porque")
    page.wait_for_function("document.getElementById('ia-explicacion') && !document.getElementById('ia-explicacion').classList.contains('dots')")
    assert "película de aceite" in page.inner_text("#ia-explicacion")
    cuerpo = json.loads(g.cuerpos[-1])
    pedido = cuerpo["contents"][0]["parts"][0]["text"]
    assert "RESPUESTA CORRECTA:" in pedido and pre[pid]["cita"].replace('"', "")[:30] in pedido.replace('"', "")
    assert "TEXTO DE LA LECCIÓN" in pedido
    assert ":streamGenerateContent?alt=sse" in g.pedidos[-1][1] and g.pedidos[-1][2] == CLAVE

    # 2) crea preguntas nuevas solo con el texto de la lección; las inválidas se descartan
    page.goto(page.base + "#/leccion/11-L01")
    antes = (leer(page, "academia.progreso"), leer(page, "academia.repaso"))
    page.click("#practicar-ia")
    page.wait_for_selector("#enunciado")
    assert page.inner_text(".qn") == "1/3"
    assert "PREGUNTA IA" in page.inner_text(".qtipo").upper()
    sistema = json.loads(g.cuerpos[-1])["systemInstruction"]["parts"][0]["text"]
    assert "SOLO el texto de la lección" in sistema and "APOYO" not in sistema
    # se contestan sin mirar: no cuentan para nada
    for _ in range(3):
        page.click(".opt >> nth=0") if page.query_selector(".opt") else None
        if page.query_selector(".mi"):
            for i in range(3):
                page.click('.mi[data-izq="%d"]' % i)
                page.click('.mi[data-der="%d"]' % i)
        page.click("#comprobar")
        page.click("#siguiente")
    assert page.inner_text("#resultado h1") == "Práctica con IA"
    assert "no cuentan" in page.inner_text("#resultado")
    assert (leer(page, "academia.progreso"), leer(page, "academia.repaso")) == antes

    # 3) califica la respuesta libre del simulador en tres criterios
    page.goto(page.base + "#/objecion/11-O1")
    o = datos(page)["lineas"][0]["objeciones"][0]
    for k, paso in enumerate(o["pasos"]):
        page.click('.paso >> nth=%d >> .opt[data-op="%d"]' % (k, paso["correcta"]))
        page.click("#obj-comprobar")
        if k < 2:
            page.click("#obj-siguiente")
    page.fill("#libre-texto", "Soy " + NOMBRE + ". Primero le pregunto qué vehículo tiene, cuántos kilómetros y qué dice el manual. "
                              "Le explico que no se vende litro sino kilómetro protegido.")
    page.click("#calificar")
    page.wait_for_selector("#nota-ia")
    nota = page.inner_text("#nota-ia")
    assert "8/10" in nota and "Qué faltó" in nota and "Cómo lo dice el manual" in nota
    assert len(page.query_selector_all("#nota-ia .crit .s.ok")) == 2

    # nunca se manda el nombre del asesor a la IA
    for c in g.cuerpos:
        for parte in [NOMBRE] + NOMBRE.split():
            assert parte not in c, "el nombre llegó a la IA"
    assert "[nombre]" in g.cuerpos[-1]

    # quitar la clave: borra solo las claves de Gemini
    page.goto(page.base + "#/ajustes/ia")
    page.click("#ckeydel")
    assert leer(page, "austrofil.geminiKey") is None and leer(page, "austrofil.geminiModelos") is None
    assert leer(page, "austrofil.claudeKey") == OTRA_CLAVE_AUSTROFIL
    assert page.inner_text("#iachiptx") == "Sin IA"
    assert page.errores == [], page.errores


def test_clave_invalida(nueva):
    page = preparar(nueva)
    Gemini(page, modo="invalida")
    msg = guardar_clave(page, "PRUEBA-otra-clave-que-google-rechaza-0001")
    assert "Google rechazó la clave" in msg
    assert leer(page, "austrofil.geminiKey") is None
    assert page.inner_text("#iachiptx") == "Sin IA"
    # una clave guardada que después Google rechaza: lo dice en una frase y sigue con el manual
    page.evaluate("k => localStorage.setItem('austrofil.geminiKey', k)", CLAVE)
    page.reload()
    lec, pre = indice(datos(page))
    fallar_primera(page, pre)
    page.click("#ia-porque")
    page.wait_for_selector("#ia-error")
    assert "Google rechazó la clave de Gemini" in page.inner_text("#ia-error")
    assert "Así lo dice el manual" in page.inner_text("#feedback")
    page.click("#siguiente")
    hacer_quiz(page, pre, fallar=0)
    assert page.query_selector("#resultado")
    assert leer(page, "austrofil.claudeKey") == OTRA_CLAVE_AUSTROFIL
    assert page.errores == [], page.errores


def test_error_429_y_sin_senal(nueva):
    page = preparar(nueva)
    g = Gemini(page)
    guardar_clave(page)
    lec, pre = indice(datos(page))
    g.modo = "429"
    fallar_primera(page, pre)
    page.click("#ia-porque")
    page.wait_for_selector("#ia-error")
    assert "Se acabó el cupo gratis de Gemini por hoy" in page.inner_text("#ia-error")
    # probó los modelos de respaldo antes de rendirse
    modelos = {re.search(r"models/([^:]+):", u).group(1) for m, u, k in g.pedidos if m == "POST"}
    assert len(modelos) >= 2
    page.click("#siguiente")
    hacer_quiz(page, pre, fallar=0)
    assert page.query_selector("#resultado")

    # sin señal: lo dice en una frase y la práctica de la lección sigue con el banco fijo
    g.modo = "sin-senal"
    page.goto(page.base + "#/leccion/11-L02")
    page.click("#practicar-ia")
    page.wait_for_function("document.getElementById('ia-estado').textContent.length > 10")
    assert "conexión" in page.inner_text("#ia-estado") or "cupo" in page.inner_text("#ia-estado")
    page.click("#hacer-quiz")
    hacer_quiz(page, pre, fallar=0)
    assert page.inner_text("#resultado h1") == "¡Lección aprobada!"
    assert page.errores == [], page.errores


def test_json_mal_formado(nueva):
    page = preparar(nueva)
    Gemini(page, generar="Claro, aquí tienes las preguntas: [{tipo: 'opcion', enunciado: 'sin comillas'",
           calificar="La nota es 8 de 10 porque preguntó bien.")
    guardar_clave(page)
    # preguntas de IA con JSON roto: se descartan y sigue con las del manual
    page.goto(page.base + "#/leccion/11-L01")
    page.click("#practicar-ia")
    page.wait_for_function("document.getElementById('ia-estado').textContent.length > 10")
    assert "La IA no creó preguntas válidas" in page.inner_text("#ia-estado")
    assert page.query_selector("#hacer-quiz")
    # calificación con JSON roto: lo dice y la práctica con opciones sigue valiendo
    page.goto(page.base + "#/objecion/11-O2")
    o = datos(page)["lineas"][0]["objeciones"][1]
    for k, paso in enumerate(o["pasos"]):
        page.click('.paso >> nth=%d >> .opt[data-op="%d"]' % (k, paso["correcta"]))
        page.click("#obj-comprobar")
        if k < 2:
            page.click("#obj-siguiente")
    page.fill("#libre-texto", "Le pregunto qué vehículo tiene y qué dice el manual, y le cambio la métrica a costo por kilómetro.")
    page.click("#calificar")
    page.wait_for_selector("#ia-error")
    assert "formato que no pude leer" in page.inner_text("#ia-error")
    assert leer(page, "academia.progreso")["objeciones"]["11-O2"]["bien"] == 3
    assert page.errores == [], page.errores
