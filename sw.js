/* Academia Austrofil — service worker (sin internet después de la primera carga).
   La versión llega en la URL de registro (sw.js?v=N) desde la constante VERSION de index.html:
   así una sola constante nombra las cachés y no hay que tocar este archivo al publicar.
   Solo borra cachés propias: las que empiezan por "academia-" y no son de esta versión. */
"use strict";
var V = new URL(self.location.href).searchParams.get("v") || "0";
var PREFIJO = "academia-";
var APP = PREFIJO + "v" + V;
var FUENTES = PREFIJO + "v" + V + "-fuentes";
var ARCHIVOS = ["./", "manifest.webmanifest", "icons/gota-192.png", "icons/gota-512.png"];
var FUENTES_CSS = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,600..800&family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;600&display=swap";
var RE_VERSION = /var VERSION = \{ n: (\d+),/;

function versionDe(html){ var m = RE_VERSION.exec(html || ""); return m ? m[1] : ""; }

async function guardarApp(){
  var c = await caches.open(APP);
  for (var i = 0; i < ARCHIVOS.length; i++){
    var url = ARCHIVOS[i];
    var res = await fetch(new Request(url, { cache: "no-cache" }));
    if (url === "./"){
      var v = versionDe(await res.clone().text());
      /* si el servidor todavía entrega la versión anterior, se pide de nuevo sin caché */
      if (res.ok && v !== V){ res = await fetch(new Request(url, { cache: "reload" })); v = versionDe(await res.clone().text()); }
      if (!res.ok || v !== V) throw new Error("index.html no es la versión " + V);
    }
    if (!res.ok) throw new Error(url + " respondió " + res.status);
    await c.put(url, res);
  }
}

/* Google Fonts: la hoja de estilos y los archivos del juego "latin" (español completo) */
async function guardarFuentes(){
  try {
    var c = await caches.open(FUENTES);
    var css = await fetch(FUENTES_CSS, { mode: "cors" });
    if (!css.ok) return;
    var txt = await css.clone().text();
    await c.put(FUENTES_CSS, css);
    var urls = [], re = /\/\*\s*latin\s*\*\/\s*@font-face\s*{[^}]*?url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, m;
    while ((m = re.exec(txt))) if (urls.indexOf(m[1]) < 0) urls.push(m[1]);
    await Promise.all(urls.map(function(u){
      return fetch(u, { mode: "cors" }).then(function(r){ if (r.ok) return c.put(u, r); }).catch(function(){});
    }));
  } catch (e){ /* sin fuentes se usan las del sistema: no impide instalar */ }
}

self.addEventListener("install", function(e){
  e.waitUntil(guardarApp().then(guardarFuentes).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf(PREFIJO) === 0 && k !== APP && k !== FUENTES; })
      .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === self.location.origin){
    e.respondWith(caches.open(APP).then(function(c){ return c.match("./"); }).then(function(r){
      return r || fetch(req);
    }).catch(function(){ return fetch(req); }));
    return;
  }
  if (url.origin === self.location.origin){
    e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: APP }).then(function(r){ return r || fetch(req); }));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    e.respondWith(caches.open(FUENTES).then(function(c){
      return c.match(req.url, { ignoreVary: true }).then(function(r){
        if (r) return r;
        return fetch(req).then(function(res){
          if (res.ok || res.type === "opaque") c.put(req.url, res.clone());
          return res;
        });
      });
    }));
  }
  /* todo lo demás (la IA de Google, enlaces) va directo a la red */
});

/* la página pregunta si hay una versión publicada más nueva; se compara sin bajar nada si no cambió (no-cache = revalidar) */
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
