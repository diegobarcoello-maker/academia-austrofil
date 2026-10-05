/* Navegación por hash (#/ruta, #/leccion/11-L01…): cada pantalla se registra con su pestaña.
   Funciona igual sin internet porque todo vive en una sola página. */
import { $$ } from "./util.js";
import { app, barra, errorPantalla } from "./ui.js";
import { hayPerfil, hayQueElegir, pendientesHoy } from "./estado.js";

var PANTALLAS = {};
/* pantallas que se pueden abrir sin haber creado un asesor */
var LIBRES = ["bienvenida", "restaurar", "perfiles", "supervisor", "revisar"];
var guardia = null, despues = [];

/* op: { tab: "ruta"|"practicar"|"mostrador"|"yo", sesion: true para ocultar barras, scroll: false para no subir } */
export function registrar(nombre, fn, op){ PANTALLAS[nombre] = Object.assign({ fn: fn, tab: "ruta" }, op || {}); }
export function ponerGuardia(fn){ guardia = fn; }
export function alPintar(fn){ despues.push(fn); }
export function ruta(){ return (location.hash.replace(/^#\/?/, "") || "ruta").split("/"); }
export function ir(r){
  var nuevo = "#/" + r;
  if (location.hash === nuevo) render(); else location.hash = nuevo;
}
export function pantallaActual(){
  var r = ruta()[0];
  if (!PANTALLAS[r]) r = "ruta";
  if (!hayPerfil() && LIBRES.indexOf(r) < 0) return "bienvenida";
  if (hayQueElegir() && LIBRES.indexOf(r) < 0) return "perfiles";
  return r;
}

export function render(navegando){
  var r = ruta(), nombre = pantallaActual(), p = PANTALLAS[nombre];
  barra();
  app.textContent = "";
  /* elegir asesor al abrir (celular compartido): sin pestañas ni cabecera, primero hay que elegir */
  document.body.classList.toggle("sesion", !!p.sesion || (nombre === "perfiles" && r[0] !== "perfiles"));
  try { p.fn(nombre === r[0] ? r.slice(1) : [], !!navegando); }
  catch (e){ app.textContent = ""; errorPantalla(e, function(){ ir("ruta"); }); }
  pintarTabs(p.tab);
  despues.forEach(function(f){ f(nombre); });
  if (p.scroll !== false) window.scrollTo(0, 0);
  if (navegando) try { app.focus({ preventScroll: true }); } catch (e){}
}

function pintarTabs(tab){
  $$(".tab").forEach(function(b){
    var on = b.getAttribute("data-tab") === tab;
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  var n = hayPerfil() ? pendientesHoy() : 0;
  $$("[data-badge=practicar]").forEach(function(bd){ bd.hidden = !n; bd.textContent = n ? String(n) : ""; });
}

export function iniciarNav(){
  $$(".tab").forEach(function(b){
    b.addEventListener("click", function(){ ir(b.getAttribute("data-tab")); });
  });
  window.addEventListener("hashchange", function(){
    /* el botón atrás de Android también cierra una hoja abierta */
    $$(".sheet-bg").forEach(function(x){ x.remove(); });
    if (guardia && guardia() === false) return;
    render(true);
  });
}
