/* Academia Austrofil — service worker: la app queda usable sin internet desde la primera visita.
   La versión llega en la URL de registro (sw.js?v=N) desde la constante VERSION de index.html:
   una sola constante nombra la caché y no hay que tocar este archivo para publicar contenido.
   Guarda la página, estilos, código, fuentes, íconos y TODOS los datos: el catálogo, el manual y cada
   archivo de línea que figure en datos/lineas.json (una línea nueva se guarda sola).
   Si agregas un archivo de código (.js) o de estilo, súmalo a ARCHIVOS.
   Solo borra cachés propias (las que empiezan por "academia-"): en el mismo dominio viven el Manual y SpeakUp. */
"use strict";
var V = new URL(self.location.href).searchParams.get("v") || "0";
var PREFIJO = "academia-";
var CACHE = PREFIJO + "v" + V;
var ARCHIVOS = [
  "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/util.js", "js/datos.js", "js/estado.js", "js/ui.js", "js/nav.js", "js/ia.js", "js/quiz.js",
  "js/codigos.js", "js/certificado.js", "js/validar.js", "js/pwa.js",
  "js/pantallas/bienvenida.js", "js/pantallas/ruta.js", "js/pantallas/practicar.js", "js/pantallas/mostrador.js",
  "js/pantallas/yo.js", "js/pantallas/supervisor.js", "js/pantallas/revisar.js",
  "fonts/archivo-latin.woff2", "fonts/plex-sans-latin.woff2", "fonts/plex-mono-600-latin.woff2",
  "icons/gota-192.png", "icons/gota-512.png",
  "datos/manual.json"
];
var RE_VERSION = /var VERSION = \{ n: (\d+),/;

function versionDe(html){ var m = RE_VERSION.exec(html || ""); return m ? m[1] : ""; }
/* cada archivo se pide con ?v=N (salta cualquier caché intermedia) y se guarda con su nombre limpio */
function fresco(url){ return fetch(new Request(url + (url.indexOf("?") < 0 ? "?" : "&") + "v=" + V, { cache: "reload" })); }

async function guardarApp(){
  var c = await caches.open(CACHE);
  var pag = await fresco("./");
  if (!pag.ok || versionDe(await pag.clone().text()) !== V) throw new Error("index.html no es la versión " + V);
  var cat = await fresco("datos/lineas.json");
  if (!cat.ok) throw new Error("datos/lineas.json respondió " + cat.status);
  var lista = ARCHIVOS.slice();
  ((await cat.clone().json()).lineas || []).forEach(function(l){ if (l.archivo) lista.push("datos/" + l.archivo); });
  var resps = await Promise.all(lista.map(function(u){
    return fresco(u).then(function(r){ if (!r.ok) throw new Error(u + " respondió " + r.status); return [u, r]; });
  }));
  await c.put("./", pag);
  await c.put("datos/lineas.json", cat);
  await Promise.all(resps.map(function(x){ return c.put(x[0], x[1]); }));
}

self.addEventListener("install", function(e){
  e.waitUntil(guardarApp().then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf(PREFIJO) === 0 && k !== CACHE; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url), scope = self.registration.scope;
  /* lo de afuera (la IA de Google, WhatsApp, el Manual) va directo a la red */
  if (url.origin !== self.location.origin || req.url.indexOf(scope) !== 0) return;
  if (req.mode === "navigate"){
    e.respondWith(caches.open(CACHE).then(function(c){ return c.match("./"); })
      .then(function(r){ return r || fetch(req); }).catch(function(){ return fetch(req); }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(req, { ignoreSearch: true }).then(function(r){
      if (r) return r;
      /* algo que no estaba en la lista: se trae y se guarda para la próxima vez sin señal */
      return fetch(req).then(function(res){
        if (res.ok && res.type === "basic") c.put(req, res.clone());
        return res;
      });
    });
  }));
});

/* la página pregunta si hay una versión publicada más nueva; con no-cache solo revalida (no baja nada si no cambió) */
self.addEventListener("message", function(e){
  var d = e.data || {};
  if (d.tipo === "activar"){ self.skipWaiting(); return; }
  if (d.tipo !== "comprobar" || !e.source) return;
  e.waitUntil(fetch(new Request("./", { cache: "no-cache" })).then(function(r){ return r.ok ? r.text() : ""; })
    .then(function(html){
      var v = versionDe(html);
      if (v && +v > +V) e.source.postMessage({ tipo: "nueva-version", v: +v });
    }).catch(function(){}));
});
