/* Sin internet, actualizaciones e instalación en el celular.
   - sw.js?v=N guarda toda la app la primera vez que se abre con internet (N = VERSION de index.html).
   - Cada vez que la app vuelve a primer plano con señal, el service worker mira si hay una versión publicada
     más nueva y aparece el aviso «Actualizar».
   - En Android, Chrome ofrece instalarla como app (beforeinstallprompt): se muestra el botón «Instalar». */
import { $, h, EQUIPO } from "./util.js";
import { toast, hoja } from "./ui.js";

var V = window.VERSION;
var actualizando = false, nuevaVersion = 0, instalador = null, oyentes = [];

export function iniciarPWA(){
  registrarSW();
  vigilarConexion();
  window.addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); instalador = e; avisar(); });
  window.addEventListener("appinstalled", function(){
    instalador = null; avisar();
    toast("Listo: la Academia quedó instalada. Funciona sin internet.");
  });
}

function registrarSW(){
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  /* para probar cambios en local sin caché: http://localhost:8765/?sinsw */
  if (/[?&]sinsw\b/.test(location.search)){
    navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister(); }); });
    return;
  }
  navigator.serviceWorker.register("sw.js?v=" + V.n).catch(function(){});
  navigator.serviceWorker.addEventListener("message", function(e){
    var d = e.data || {};
    if (d.tipo === "nueva-version" && +d.v > V.n) mostrarActualizar(+d.v);
  });
  navigator.serviceWorker.addEventListener("controllerchange", function(){ if (actualizando) location.reload(); });
  function comprobar(){
    if (navigator.onLine !== false && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ tipo: "comprobar" });
  }
  setTimeout(comprobar, 2500);
  window.addEventListener("online", comprobar);
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) comprobar(); });
  $("#banner-btn").addEventListener("click", function(){
    if (!nuevaVersion || actualizando) return;
    actualizando = true;
    $("#banner-tx").textContent = "Actualizando…";
    function fallo(t){ actualizando = false; $("#banner-tx").textContent = t; }
    navigator.serviceWorker.register("sw.js?v=" + nuevaVersion).then(function(reg){
      function vigilar(sw){
        if (!sw) return;
        sw.addEventListener("statechange", function(){ if (sw.state === "redundant") fallo("No se pudo actualizar ahora. Intenta en unos minutos."); });
      }
      vigilar(reg.installing || reg.waiting);
      reg.addEventListener("updatefound", function(){ vigilar(reg.installing); });
      if (reg.waiting) reg.waiting.postMessage({ tipo: "activar" });
    }).catch(function(){ fallo("Sin conexión: intenta cuando tengas señal."); });
  });
}
function mostrarActualizar(v){
  nuevaVersion = Math.max(nuevaVersion, v);
  $("#banner-tx").textContent = "Hay una versión nueva de la Academia (" + nuevaVersion + ").";
  $("#banner-act").hidden = false;
}

/* aviso discreto arriba cuando no hay señal: la app sigue funcionando igual */
function vigilarConexion(){
  var pill = $("#offline");
  function pintar(){ pill.hidden = navigator.onLine !== false; }
  window.addEventListener("online", pintar);
  window.addEventListener("offline", pintar);
  pintar();
}

export function instalada(){
  try { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e){ return false; }
}
export function puedeInstalar(){ return !!instalador && !instalada(); }
export function instalar(){
  if (!instalador) return;
  instalador.prompt();
  instalador.userChoice.then(function(){ instalador = null; avisar(); }, function(){});
}
export function alCambiarInstalacion(fn){ oyentes.push(fn); }
function avisar(){ pintarBoton(); oyentes.forEach(function(f){ f(); }); }

/* ============ BOTÓN «DESCARGAR APP» (siempre a la vista, en celular y en computadora) ============ */
/* Si el navegador ofrece instalar (Chrome o Edge), se instala con un toque; si no, se explican los pasos de ese equipo. */
function plataforma(){
  var ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return /SamsungBrowser/i.test(ua) ? "samsung" : /Firefox/i.test(ua) ? "otro" : "android";
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox/i.test(ua)) return "otro";
  if (/Chrome|CriOS/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "mac";
  return "otro";
}
var PASOS = {
  android: ["Toca el menú ⋮ (arriba a la derecha de Chrome).", "Elige «Instalar app» o «Agregar a la pantalla principal».", "Confirma. La gota de la Academia queda en tu pantalla de inicio."],
  samsung: ["Toca el menú ≡ (abajo a la derecha).", "Elige «Añadir página a» y luego «Pantalla de inicio».", "Confirma. La gota de la Academia queda en tu pantalla de inicio."],
  ios: ["Abre este link en Safari.", "Toca Compartir (el cuadrado con la flecha hacia arriba).", "Elige «Agregar a pantalla de inicio» y toca «Agregar»."],
  chrome: ["En la barra de direcciones, a la derecha, toca el ícono de instalar (una pantalla con una flecha).", "Si no lo ves: menú ⋮ › «Transmitir, guardar y compartir» › «Instalar página como aplicación».", "Confirma con «Instalar». Queda como programa en tu computadora."],
  edge: ["Toca el menú … (arriba a la derecha).", "Elige «Aplicaciones» › «Instalar este sitio como una aplicación».", "Confirma con «Instalar»."],
  mac: ["En Safari, abre el menú Archivo.", "Elige «Agregar al Dock»."],
  otro: ["Este navegador no instala apps web.", "Abre el link en Chrome (en el celular) o en Chrome o Edge (en la computadora) y toca otra vez «Descargar app»."]
};
export function abrirInstalar(){
  if (instalada()){ toast("La app ya está instalada en " + EQUIPO.este + "."); return; }
  if (instalador){ instalar(); return; }
  var cerrar = hoja([
    h("h2", null, "Descargar la app"),
    h("p", { class: "muted" }, "Queda con su ícono en " + EQUIPO.tu + ", se abre como una app y funciona sin internet. No ocupa casi espacio."),
    h("ol", { class: "pasos-lista" }, PASOS[plataforma()].map(function(p){ return h("li", null, p); })),
    h("div", { class: "btns" }, h("button", { class: "btn", onclick: function(){ cerrar(true); } }, "Entendido"))
  ]);
}
function pintarBoton(){
  var b = $("#btn-instalar");
  if (b) b.hidden = instalada();
}
export function iniciarBotonInstalar(){
  var b = $("#btn-instalar");
  if (!b) return;
  b.addEventListener("click", abrirInstalar);
  pintarBoton();
  try { window.matchMedia("(display-mode: standalone)").addEventListener("change", pintarBoton); } catch (e){}
}
