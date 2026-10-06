/* Pruebas de la Academia, en el navegador (reemplazan las de Python/Playwright).
   - Contenido: la revisión pasa sin errores y la línea 11 está completa.
   - Lógica: migración de la v1, repaso espaciado, racha, códigos de respaldo y de avance.
   - Publicación: el service worker guarda todo lo que la página usa.
   - Flujos reales en un iframe del tamaño de un celular: bienvenida, lección, Practicar, caso, prueba de nivel,
     panel del supervisor y varios asesores en un celular.
   Al terminar, el título de la pestaña dice «OK n/n» o «FALLAN k» y se devuelve el avance que había en este navegador. */
import { DATA, PREG, cargarDatos, lineaPorCodigo, leccionesLinea } from "../js/datos.js";
import { validarTodo } from "../js/validar.js";
import { ST, cargarEstado, crearPerfil, guardar, aCaja1, entrarCaja2, moverCaja, vencidas, marcarEstudio, REGLAS } from "../js/estado.js";
import { crearRespaldo, leerRespaldo, crearCodigoAvance, textoAvance, leerReportes } from "../js/codigos.js";
import { empaquetar, hoy, sumarDias } from "../js/util.js";

window.VERSION = window.VERSION || { n: 0, fecha: "" };
var pruebas = [];
function prueba(nombre, fn){ pruebas.push({ nombre: nombre, fn: fn }); }
function ok(c, msg){ if (!c) throw new Error(msg || "no se cumplió"); }
function igual(a, b, msg){
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg ? msg + ": " : "") + "esperaba " + JSON.stringify(b) + " y salió " + JSON.stringify(a));
}
function dormir(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
async function esperar(fn, ms, que){
  var t0 = Date.now();
  for (;;){
    var v = fn();
    if (v) return v;
    if (Date.now() - t0 > (ms || 5000)) throw new Error("tiempo agotado esperando " + (que || ""));
    await dormir(40);
  }
}

/* ---------- el avance de este navegador se guarda y se devuelve al final ---------- */
function claves(){
  var o = [];
  for (var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if (k.indexOf("academia.") === 0 || k.indexOf("austrofil.gemini") === 0) o.push(k); }
  return o;
}
var copia = {};
claves().forEach(function(k){ copia[k] = localStorage.getItem(k); });
var copiaSesion = sessionStorage.getItem("academia.elegido");
function limpiar(){ claves().forEach(function(k){ localStorage.removeItem(k); }); sessionStorage.removeItem("academia.elegido"); cargarEstado(); }
function devolver(){
  claves().forEach(function(k){ localStorage.removeItem(k); });
  Object.keys(copia).forEach(function(k){ localStorage.setItem(k, copia[k]); });
  if (copiaSesion) sessionStorage.setItem("academia.elegido", copiaSesion); else sessionStorage.removeItem("academia.elegido");
}

/* ============ CONTENIDO ============ */
prueba("El contenido pasa la revisión (referencias, citas letra por letra, una sola correcta)", function(){
  var r = validarTodo();
  ok(r.errores.length === 0, r.errores.join("\n"));
});
prueba("La línea 11 trae 4 niveles, 23 lecciones, 11 casos y 6 objeciones", function(){
  var l = lineaPorCodigo(11), lec = leccionesLinea(l);
  igual(l.niveles.length, 4, "niveles"); igual(lec.length, 23, "lecciones");
  ok(lec.reduce(function(a, x){ return a + x.preguntas.length; }, 0) >= 100, "menos de 100 preguntas");
  igual(l.casos.length, 11, "casos"); igual(l.objeciones.length, 6, "objeciones");
  lec.forEach(function(x){ ok(x.cuerpo.length > 0, x.id + " sin texto"); ok(x.minutos >= 2 && x.minutos <= 3, x.id + " minutos"); });
  l.casos.forEach(function(s){ igual(s.pasos.length, 3, s.id + " pasos"); ok(s.manual.length > 0, s.id + " sin texto del manual"); });
});
prueba("Las líneas sin archivo salen como «Próximamente»", function(){
  ok(DATA.lineas.some(function(l){ return l.activa; }), "no hay líneas activas");
  DATA.lineas.filter(function(l){ return !l.archivo; }).forEach(function(l){ ok(!l.activa, "la línea " + l.codigo + " no debería estar activa"); });
});
prueba("La revisión detecta citas inventadas, bloques que no existen e ids repetidos", function(){
  var l = lineaPorCodigo(11), orig = l.fuente, copiaF = JSON.parse(JSON.stringify(orig));
  try {
    l.fuente = copiaF;
    copiaF.casos[0].pasos[0].cita = "Para taxi siempre va 0W-20 sintético.";
    copiaF.niveles[0].modulos[0].lecciones[0].contenido = ["lu1.1..lu1.9", "zz9.9"];
    copiaF.objeciones[0].pasos[0].id = "11-L01-P1";
    copiaF.casos[1].pasos[1].correcta = 9;
    var e = validarTodo().errores.join("\n");
    ok(/11-C01-P1: la cita no está/.test(e), "no vio la cita inventada");
    ok(/no existe el bloque zz9\.9/.test(e), "no vio el bloque inexistente");
    ok(/id repetido 11-L01-P1/.test(e), "no vio el id repetido");
    ok(/11-C02-P2: «correcta»/.test(e), "no vio la correcta fuera de rango");
  } finally { l.fuente = orig; }
});

/* ============ LÓGICA ============ */
prueba("El avance de la v1 se migra solo y queda la copia de la v1", function(){
  limpiar();
  localStorage.setItem("academia.nombre", "Pedro Uno");
  localStorage.setItem("academia.progreso", JSON.stringify({ v: 1, lecciones: { "11-L01": { ok: true, mejor: 5, total: 5, intentos: 1, ultimo: "2026-10-03" } },
    examenes: {}, stats: {}, objeciones: { "11-O1": { bien: 3, total: 3, fecha: "2026-10-04" } } }));
  localStorage.setItem("academia.repaso", JSON.stringify({ v: 1, items: { "11-L01-P1": { c: 2, d: "2026-10-05" } }, fijas: {}, dia: "", hechas: 0, hecho: "" }));
  localStorage.setItem("academia.racha", JSON.stringify({ v: 1, dias: 2, ultimo: "2026-10-04", mejor: 2 }));
  localStorage.setItem("academia.ajustes", JSON.stringify({ v: 1, tema: "oscuro", linea: 11 }));
  cargarEstado();
  igual(ST.perfil.nombre, "Pedro Uno", "nombre");
  ok(ST.d.progreso.lecciones["11-L01"].ok, "lección perdida");
  igual(ST.d.progreso.sims["11-O1"].bien, 3, "objeción");
  igual(ST.d.repaso.items["11-L01-P1"].c, 2, "repaso");
  igual(ST.d.racha.mejor, 2, "racha");
  igual(ST.ajustes.tema, "oscuro", "tema");
  ok(localStorage.getItem("academia.nombre") === "Pedro Uno", "se borró la copia de la v1");
});
prueba("Al migrar de la v1, las lecciones de ayer y hoy cuentan para la racha", function(){
  limpiar();
  localStorage.setItem("academia.nombre", "Rosa Uno");
  localStorage.setItem("academia.progreso", JSON.stringify({ v: 1, examenes: {}, stats: {}, objeciones: {}, lecciones: {
    "11-L01": { ok: true, mejor: 5, total: 5, intentos: 1, ultimo: sumarDias(hoy(), -1) },
    "11-L02": { ok: true, mejor: 4, total: 5, intentos: 1, ultimo: hoy() } } }));
  cargarEstado();
  igual([ST.d.racha.dias, ST.d.racha.ultimo], [2, hoy()], "racha");
});
prueba("Repaso espaciado: 1, 2, 4, 8 y 16 días y después queda dominada", function(){
  limpiar(); crearPerfil("Prueba Repaso");
  var id = "11-L01-P1", t = hoy();
  aCaja1(id);
  igual(ST.d.repaso.items[id], { c: 1, d: sumarDias(t, 1) }, "al fallar");
  [2, 3, 4, 5].forEach(function(c){ moverCaja(id, true); igual(ST.d.repaso.items[id], { c: c, d: sumarDias(t, REGLAS.CAJAS_DIAS[c - 1]) }, "caja " + c); });
  moverCaja(id, true);
  ok(!ST.d.repaso.items[id] && ST.d.repaso.fijas[id], "no quedó dominada");
  entrarCaja2("11-L01-P2");
  igual(vencidas().length, 0, "nada vence hoy");
  ST.d.repaso.items["11-L01-P2"].d = t;
  igual(vencidas(), ["11-L01-P2"], "vence hoy");
});
prueba("La racha cuenta cualquier día de estudio y se corta si saltas días", function(){
  limpiar(); crearPerfil("Prueba Racha");
  ST.d.racha = { dias: 3, ultimo: sumarDias(hoy(), -1), mejor: 3 };
  marcarEstudio(); igual([ST.d.racha.dias, ST.d.racha.mejor], [4, 4], "día seguido");
  marcarEstudio(); igual(ST.d.racha.dias, 4, "mismo día");
  ST.d.racha = { dias: 5, ultimo: sumarDias(hoy(), -3), mejor: 5 };
  marcarEstudio(); igual([ST.d.racha.dias, ST.d.racha.mejor], [1, 5], "después de saltar días");
  ok(ST.d.actividad[hoy()] >= 1, "no anotó el día");
});
prueba("Código de respaldo: ida y vuelta, y rechaza códigos cortados", async function(){
  limpiar(); crearPerfil("Ana Respaldo");
  ST.d.progreso.lecciones["11-L03"] = { ok: true, mejor: 4, total: 5, intentos: 2 };
  guardar();
  var cod = await crearRespaldo();
  ok(/^AA[01]\./.test(cod), "prefijo");
  var r = await leerRespaldo("Mi código (guárdalo):\n" + cod + "\nGracias");
  igual(r.perfil.id, ST.perfil.id, "mismo asesor");
  igual(r.datos.progreso.lecciones["11-L03"].mejor, 4, "avance");
  var malo = false;
  try { await leerRespaldo(cod.slice(0, 30) + "x" + cod.slice(31)); } catch (e){ malo = true; }
  ok(malo, "aceptó un código alterado");
});
prueba("Los códigos de respaldo de la v1 se pueden restaurar", async function(){
  var o = { a: "academia", v: 1, f: "2026-10-02", d: { "academia.nombre": "Lucía Vega",
    "academia.progreso": JSON.stringify({ v: 1, lecciones: { "11-L01": { ok: true, mejor: 4, total: 5 } }, examenes: {}, stats: {}, objeciones: {} }) } };
  var p = await empaquetar(o);
  var r = await leerRespaldo((p.comprimido ? "AA1." : "AA0.") + p.cuerpo + "." + p.suma);
  igual(r.perfil.nombre, "Lucía Vega");
  ok(r.datos.progreso.lecciones["11-L01"].ok, "lección");
});
prueba("Avance para el supervisor: se lee desde el mensaje de WhatsApp y detecta los cortados", async function(){
  limpiar(); crearPerfil("Carla Avance");
  ST.d.progreso.lecciones["11-L01"] = { ok: true, mejor: 5, total: 5, intentos: 1 };
  guardar();
  var cod = await crearCodigoAvance();
  var msg = textoAvance() + "\n\nCódigo para el panel del supervisor:\n" + cod;
  var otro = cod.replace(/^(AV[01]\.)(.)/, function(m, a, c){ return a + (c === "A" ? "B" : "A"); });
  var r = await leerReportes("Buenas jefe\n" + msg + "\n---\n" + otro);
  igual(r.reportes.length, 1, "reportes");
  igual(r.malos, 1, "cortados");
  var x = r.reportes[0];
  igual([x.n, x.l[0].c, x.l[0].la, x.l[0].lt], ["Carla Avance", 11, 1, 23]);
});

/* ============ PUBLICACIÓN ============ */
prueba("El service worker guarda todo lo que usa la página (sin internet desde la primera visita)", async function(){
  var html = await (await fetch("../index.html", { cache: "no-store" })).text();
  var css = await (await fetch("../css/app.css", { cache: "no-store" })).text();
  var sw = await (await fetch("../sw.js", { cache: "no-store" })).text();
  var lista = JSON.parse(sw.match(/var ARCHIVOS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
  var usados = [];
  html.replace(/<link rel="(?:modulepreload|stylesheet|manifest|icon|apple-touch-icon)"[^>]*href="([^"]+)"/g, function(m, u){ usados.push(u); });
  css.replace(/url\(\.\.\/([^)]+)\)/g, function(m, u){ usados.push(u); });
  var faltan = usados.filter(function(u){ return lista.indexOf(u) < 0; });
  ok(!faltan.length, "sw.js no guarda: " + faltan.join(", "));
  var malos = [];
  await Promise.all(lista.map(function(u){ return fetch("../" + u, { method: "HEAD", cache: "no-store" }).then(function(r){ if (!r.ok) malos.push(u + " " + r.status); }); }));
  ok(!malos.length, "no existen: " + malos.join(", "));
  ok(/var VERSION = \{ n: \d+,/.test(html), "index.html no trae «var VERSION = { n: N,» (lo leen los service workers v1 y v2)");
});

/* ============ FLUJOS EN UN CELULAR (iframe 390 × 760) ============ */
var F = null;
function doc(){ return F.contentDocument; }
async function abrir(hash){
  var marco = document.getElementById("marco");
  marco.textContent = "";
  F = document.createElement("iframe");
  F.title = "Academia en tamaño celular";
  F.src = "../index.html?sinsw" + (hash || "");
  marco.appendChild(F);
  await new Promise(function(r){ F.addEventListener("load", r, { once: true }); });
  await esperar(function(){ return doc().querySelector("main .vhead, main .welcome, main .perfil-cab, main .lhead"); }, 8000, "que cargue la app");
}
async function ir(hash, sel){
  F.contentWindow.location.hash = hash;
  if (sel) await esperar(function(){ return doc().querySelector(sel); }, 4000, sel);
  else await dormir(150);
}
function clic(sel){ var el = doc().querySelector(sel); ok(el, "no encontré " + sel); el.click(); }
async function responder(bien){
  var pid = doc().querySelector("#enunciado").dataset.pid, p = PREG[pid];
  ok(p, "pregunta desconocida " + pid);
  if (p.tipo === "opcion") clic('[data-op="' + (bien ? p.correcta : (p.correcta + 1) % p.opciones.length) + '"]');
  else if (p.tipo === "vf") clic('[data-vf="' + (bien ? p.correcta : !p.correcta) + '"]');
  else for (var i = 0; i < p.pares.length; i++){
    clic('[data-izq="' + i + '"]'); await dormir(15);
    clic('[data-der="' + (bien ? i : (i + 1) % p.pares.length) + '"]'); await dormir(15);
  }
  await dormir(30);
  clic("#comprobar");
  await dormir(60);
}
async function siguiente(){ var s = doc().querySelector("#siguiente"); if (s){ s.click(); await dormir(80); } }

prueba("Bienvenida: escribe su nombre y entra a la ruta en 0 %", async function(){
  limpiar();
  await abrir("#/ruta");
  ok(doc().querySelector("#nombre"), "no pidió el nombre");
  ok(doc().body.classList.contains("sesion"), "la bienvenida no debería mostrar pestañas");
  doc().querySelector("#nombre").value = "Prueba Celular";
  clic("#empezar");
  await esperar(function(){ return doc().querySelector(".hero"); }, 4000, "la ruta");
  ok(/Hola, Prueba/.test(doc().querySelector(".kicker").textContent), "saludo");
  ok(/^0 %/.test(doc().querySelector(".hero-num").innerText), "avance inicial");
  ok(/Empezar: Qué es lubricar/.test(doc().querySelector(".actionbar").innerText), "botón para empezar");
});
prueba("Lección 1: quiz completo, aprobada y se abre la siguiente", async function(){
  await ir("#/leccion/11-L01", "#hacer-quiz");
  clic("#hacer-quiz");
  await esperar(function(){ return doc().querySelector("#enunciado"); }, 3000, "la primera pregunta");
  ok(doc().body.classList.contains("sesion"), "en el quiz no deberían verse las pestañas");
  await responder(true);
  ok(doc().querySelector("#feedback.ok"), "no mostró «¡Bien!»");
  for (var i = 1; i < 5; i++){ await siguiente(); await responder(true); }
  await siguiente();
  await esperar(function(){ return doc().querySelector("#resultado"); }, 3000, "el resultado");
  ok(/5\/5/.test(doc().querySelector("#resultado").innerText) && /aprobada/i.test(doc().querySelector("#resultado").innerText), "resultado");
  await ir("#/ruta", ".hero");
  ok(doc().querySelector('[data-lec="11-L01"]').classList.contains("ok"), "la lección 1 no quedó aprobada");
  ok(doc().querySelector('[data-lec="11-L02"]').classList.contains("sig"), "la lección 2 no quedó como siguiente");
  ok(/^4 %/.test(doc().querySelector(".hero-num").innerText), "avance 4 %");
  ok(/1/.test(doc().querySelector(".hero-racha").innerText), "racha del día");
});
prueba("Practicar: aparece el quiz rápido con lo aprobado", async function(){
  await ir("#/practicar", ".racha-card");
  ok(doc().querySelector("#empezar-rapido"), "sin quiz rápido");
  clic("#empezar-rapido");
  await esperar(function(){ return doc().querySelector("#enunciado"); }, 3000, "pregunta del quiz rápido");
  ok(/Quiz rápido/.test(doc().querySelector(".qtipo").textContent), "no dice Quiz rápido");
  await ir("#/practicar", ".racha-card");
});
prueba("Mostrador: un caso completo en tres pasos queda guardado", async function(){
  await ir("#/sim/11-C04", "#sim-comprobar");
  var s = DATA.lineas[0].casos.filter(function(x){ return x.id === "11-C04"; })[0];
  for (var k = 0; k < 3; k++){
    var pasos = doc().querySelectorAll(".paso");
    pasos[k].querySelector('[data-op="' + s.pasos[k].correcta + '"]').click();
    await dormir(40); clic("#sim-comprobar"); await dormir(80);
    if (k < 2){ clic("#sim-paso"); await dormir(80); }
  }
  ok(/3 de 3/.test(doc().querySelector("#sim-resultado").innerText), "resultado del caso");
  await ir("#/mostrador", ".simcard");
  ok(doc().querySelector('[data-sim="11-C04"]').classList.contains("ok"), "el caso no quedó hecho");
});
prueba("Prueba de nivel: con 80 % aprueba el nivel 1 y abre el 2", async function(){
  await ir("#/prueba/11-N1", "#empezar-prueba");
  clic("#empezar-prueba");
  await esperar(function(){ return doc().querySelector("#enunciado"); }, 3000, "pregunta de la prueba");
  for (var i = 0; i < 10; i++){ await responder(i !== 4); }
  await esperar(function(){ return doc().querySelector("#resultado"); }, 3000, "resultado de la prueba");
  ok(/Nivel 1 aprobado/.test(doc().querySelector("#resultado").innerText), "no aprobó el nivel");
  await ir("#/ruta", ".hero");
  ok(!doc().querySelector('[data-nivel="11-N2"]').classList.contains("lock"), "el nivel 2 sigue bloqueado");
});
prueba("Yo → enviar avance → Panel del supervisor lo muestra", async function(){
  await ir("#/yo", "#enviar-avance");
  var a = await esperar(function(){ var x = doc().querySelector("#enviar-avance"); return x && !x.getAttribute("aria-disabled") && x; }, 3000, "el código de avance");
  var texto = decodeURIComponent(a.href.split("?text=")[1] || "");
  ok(/AV[01]\./.test(texto), "el mensaje no trae el código");
  await ir("#/supervisor", "#reportes-texto");
  doc().querySelector("#reportes-texto").value = texto;
  clic("#agregar-reportes");
  await esperar(function(){ return doc().querySelector(".asesor"); }, 3000, "la tarjeta del asesor");
  ok(/Prueba Celular/.test(doc().querySelector(".asesor").innerText), "nombre en el panel");
});
prueba("Varios asesores en un celular: pregunta «¿Quién estudia?» al abrir", async function(){
  await ir("#/perfiles/todos", "#agregar-asesor");
  clic("#agregar-asesor");
  await esperar(function(){ return doc().querySelector("#nuevo-nombre"); }, 2000, "la hoja");
  doc().querySelector("#nuevo-nombre").value = "Segundo Asesor";
  clic("#crear-asesor");
  await esperar(function(){ return doc().querySelector(".hero"); }, 3000, "la ruta del segundo asesor");
  ok(/^0 %/.test(doc().querySelector(".hero-num").innerText), "el segundo asesor no empieza de cero");
  sessionStorage.removeItem("academia.elegido");
  await abrir("#/ruta");
  ok(/Quién estudia/.test(doc().querySelector("main h1").textContent), "no preguntó quién estudia");
  igual(doc().querySelectorAll(".perfil-fila").length, 2, "asesores en la lista");
});

prueba("Descargar app: el botón está a la vista y explica cómo instalar", async function(){
  /* viene de la prueba anterior con «¿Quién estudia?» en pantalla: entra el primer asesor */
  var fila = doc().querySelector(".perfil-fila");
  if (fila){ fila.click(); await esperar(function(){ return doc().querySelector(".hero"); }, 3000, "la ruta"); }
  else await ir("#/ruta", ".hero");
  ok(!doc().body.classList.contains("sesion"), "la ruta no debería ocultar la cabecera");
  var b = doc().querySelector("#btn-instalar");
  ok(b && !b.hidden, "no se ve el botón «Descargar app»");
  b.click();
  await esperar(function(){ return doc().querySelector(".sheet"); }, 2000, "la hoja con los pasos");
  ok(/Descargar la app/.test(doc().querySelector(".sheet").textContent), "título de la hoja");
  ok(doc().querySelectorAll(".sheet .pasos-lista li").length >= 2, "faltan los pasos");
  doc().querySelector(".sheet .btn").click();
  await dormir(100);
  igual(doc().querySelectorAll(".tab").length, 5, "pestañas");
});
/* Gemini simulado dentro del iframe: responde por SSE como cliente, como coach (pista) o con la evaluación en JSON */
function simularIA(win){
  var vueltas = 0, original = win.fetch.bind(win);
  win.fetch = async function(url, op){
    if (String(url).indexOf("generativelanguage.googleapis.com") < 0) return original(url, op);
    var body = JSON.parse(op.body), sis = body.systemInstruction.parts[0].text, ult = body.contents[body.contents.length - 1].parts[0].text;
    var texto;
    if (/coach/i.test(sis) && /TAREA: califica/.test(ult)) texto = '{"nota": 8, "criterios": {"apertura": true, "preguntas": true, "argumento": true, "objeciones": true, "canasta": false, "cierre": true}, "descubrio": true, "resultado": "compró", "bien": "Preguntaste antes de ofrecer.", "mejorar": "Ofrece el filtro.", "frase": "¿Qué le piden sus clientes?"}';
    else if (/coach/i.test(sis)) texto = "Pregúntale qué le piden sus clientes.";
    else { vueltas++; texto = vueltas < 2 ? "Aquí sale más el 20W-50. ¿A cuánto me lo deja?" : "Bueno, mándeme eso. [FIN]"; }
    var enc = new TextEncoder();
    var stream = new win.ReadableStream({ start: function(c){
      c.enqueue(enc.encode("data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason: "STOP" }] }) + "\n\n"));
      c.close();
    } });
    return new win.Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  };
}
prueba("Hablar: conversación con un cliente de IA, pista del coach y evaluación (IA simulada)", async function(){
  localStorage.setItem("austrofil.geminiKey", "clave-falsa-solo-para-pruebas");
  await abrir("#/hablar");
  simularIA(F.contentWindow);
  ok(!doc().querySelector(".aviso-ia"), "pide activar la IA aunque hay clave");
  igual(doc().querySelectorAll(".cliente-card").length, DATA.clientes.clientes.length, "clientes en la lista");
  clic('[data-cliente="taller"]'); await dormir(80);
  clic('[data-dif="facil"]'); await dormir(80);
  clic("#empezar-charla");
  await esperar(function(){ return doc().querySelector("#chat-texto"); }, 3000, "la conversación");
  ok(/Maestro Jorge/.test(doc().querySelector("#chat").textContent), "el cliente no abrió la conversación");
  async function decir(t){
    var ta = doc().querySelector("#chat-texto");
    ta.value = t; ta.dispatchEvent(new F.contentWindow.Event("input"));
    clic("#chat-enviar");
    await esperar(function(){ return !doc().querySelector(".msg p.dots") && doc().querySelectorAll(".msg-cliente").length > 0; }, 4000, "la respuesta del cliente");
    await dormir(120);
  }
  await decir("Buenas, maestro. ¿Qué carros le llegan más al taller?");
  clic("#pista");
  await esperar(function(){ return doc().querySelector(".pista"); }, 3000, "la pista del coach");
  await decir("Le propongo el aceite que pide el manual de esos carros, con su filtro.");
  await esperar(function(){ return doc().querySelector("#evaluar-charla"); }, 3000, "el fin de la charla");
  clic("#evaluar-charla");
  await esperar(function(){ return doc().querySelector("#evaluacion"); }, 4000, "la evaluación");
  ok(/8\/10/.test(doc().querySelector("#evaluacion").textContent), "nota del coach");
  var perf = JSON.parse(localStorage.getItem("academia.perfiles")), d = JSON.parse(localStorage.getItem("academia.p." + perf.activo));
  igual(d.progreso.charlas.length, 1, "la conversación no quedó guardada");
  localStorage.removeItem("austrofil.geminiKey");
});

/* ============ CORRER ============ */
async function correr(){
  var lista = document.getElementById("lista"), mal = 0;
  try { await cargarDatos(); }
  catch (e){ document.getElementById("resumen").textContent = "No pude cargar los datos: " + e.message; document.title = "FALLAN: datos"; return; }
  for (var i = 0; i < pruebas.length; i++){
    var p = pruebas[i], li = document.createElement("li");
    li.textContent = p.nombre;
    lista.appendChild(li);
    try { await p.fn(); li.className = "ok"; li.textContent = "✓ " + p.nombre; }
    catch (e){
      mal++; li.className = "mal"; li.textContent = "✗ " + p.nombre;
      var s = document.createElement("small"); s.textContent = String(e && e.message || e); li.appendChild(s);
    }
  }
  devolver();
  var res = mal ? "FALLAN " + mal + " de " + pruebas.length : "OK " + pruebas.length + "/" + pruebas.length;
  document.getElementById("resumen").textContent = res;
  document.title = res;
  window.RESULTADO = { total: pruebas.length, fallan: mal };
}
correr();
