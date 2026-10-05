/* Sin internet, actualizaciones e instalación en el celular.
   - sw.js?v=N guarda toda la app la primera vez que se abre con internet (N = VERSION de index.html).
   - Cada vez que la app vuelve a primer plano con señal, el service worker mira si hay una versión publicada
     más nueva y aparece el aviso «Actualizar».
   - En Android, Chrome ofrece instalarla como app (beforeinstallprompt): se muestra el botón «Instalar». */
import { $ } from "./util.js";
import { toast } from "./ui.js";

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
function avisar(){ oyentes.forEach(function(f){ f(); }); }
