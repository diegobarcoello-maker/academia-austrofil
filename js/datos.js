/* Contenido de la Academia: catálogo de líneas, ruta de cada línea y texto del Manual de Campo.

   Las lecciones guardan referencias al manual (ids de bloque como "lu1.3", tramos "lu1.1..lu1.9" o
   respuestas del banco {"qa": "clave"}) y aquí se resuelven al texto real de datos/manual.json.
   Sumar una línea = crear datos/linea-<código>-<nombre>.json y ponerle "archivo" en datos/lineas.json.
   No hay que tocar código: la app y el service worker leen el catálogo. */
import { palabras } from "./util.js";

export const DATA = { manual: {}, lineas: [], contextoIA: [] };
export const LEC = {};    /* lecciones por id (11-L01…) */
export const PREG = {};   /* preguntas del banco fijo por id (11-L01-P1…) */
export const SIM = {};    /* casos de mostrador y objeciones por id (11-C01, 11-O1…) */
export const MAN = { bloques: {}, orden: [], pos: {}, vistas: {}, qa: {} };

/* las rutas de datos/ se resuelven desde la raíz de la app (así también funcionan desde tests/pruebas.html) */
var RAIZ = new URL("../", import.meta.url);
async function traer(url){
  var r = await fetch(new URL(url, RAIZ));
  if (!r.ok) throw new Error(url + " respondió " + r.status);
  return r.json();
}

export async function cargarDatos(){
  var res = await Promise.all([traer("datos/lineas.json"), traer("datos/manual.json")]);
  var cat = res[0], manual = res[1];
  indexarManual(manual);
  DATA.manual = manual.manual || {};
  /* apoyo para la IA: las líneas del contexto del manual que hablan del portafolio y de lubricantes */
  DATA.contextoIA = (manual.contexto || []).filter(function(l){
    return /^(PORTAFOLIO|Castrol|FUNDAMENTOS|20W-50|COMPOSICIÓN|MOTOR 4T|SIN CAMBIO|TURBO|VENTA)/.test(l);
  });
  var fuentes = await Promise.all((cat.lineas || []).map(function(m){
    return m.archivo ? traer("datos/" + m.archivo).catch(function(e){ return { __error: e }; }) : null;
  }));
  DATA.lineas = (cat.lineas || []).map(function(m, i){ return armarLinea(m, fuentes[i]); });
  indexar();
  return DATA;
}

/* ============ MANUAL ============ */
function indexarManual(man){
  MAN.bloques = {}; MAN.orden = []; MAN.pos = {}; MAN.vistas = {}; MAN.qa = {};
  (man.vistas || []).forEach(function(v){
    MAN.vistas[v.id] = v;
    (v.bloques || []).forEach(function(b){ MAN.bloques[b.id] = b; MAN.pos[b.id] = MAN.orden.length; MAN.orden.push(b.id); });
  });
  (man.qa || []).forEach(function(q){ MAN.qa[q.k] = q; });
}
export function tituloSub(vista, sub){
  var v = MAN.vistas[vista];
  if (!v) return "";
  var s = (v.secciones || []).filter(function(x){ return x.sub === sub; })[0];
  return s ? (s.pestana || s.h2) : v.titulo;
}
/* fuente legible de un bloque o de una respuesta del banco */
export function fuenteDe(ref){
  if (ref && typeof ref === "object") return MAN.qa[ref.qa] ? { qa: ref.qa, texto: "Banco de respuestas del manual" } : null;
  var b = MAN.bloques[ref];
  if (!b) return null;
  var t = MAN.vistas[b.vista].menu + " › " + tituloSub(b.vista, b.sub);
  if (b.h3) t += " › " + b.h3;
  return { vista: b.vista, sub: b.sub, texto: t };
}
/* ["lu1.1..lu1.9", "gl.8", {qa: …}] → lista de ids de bloque y {qa}; lo que no existe se informa con avisar() */
export function expandir(refs, avisar, donde){
  var out = [];
  (refs || []).forEach(function(r){
    if (r && typeof r === "object"){
      if (!MAN.qa[r.qa]){ avisar(donde + ": no existe la clave del QA «" + r.qa + "»"); return; }
      out.push({ qa: r.qa });
      return;
    }
    r = String(r);
    if (r.indexOf("..") > -1){
      var ab = r.split(".."), a = ab[0], b = ab[1];
      if (!MAN.bloques[a] || !MAN.bloques[b]){ avisar(donde + ": rango inválido " + r); return; }
      var i = MAN.pos[a], j = MAN.pos[b];
      if (j < i || MAN.bloques[a].vista !== MAN.bloques[b].vista){ avisar(donde + ": rango inválido " + r); return; }
      for (var k = i; k <= j; k++) out.push(MAN.orden[k]);
    } else if (MAN.bloques[r]) out.push(r);
    else avisar(donde + ": no existe el bloque " + r);
  });
  return out;
}
var CAMPOS = [["etiqueta", "lbl"], ["nota", "k"], ["cols", "cols"], ["celdas", "cells"], ["h3", "h3"], ["h4", "h4"],
              ["clase", "cls"], ["marcas", "marcas"], ["propias", "own"], ["grupo", "grp"]];
function bloqueSalida(ref){
  if (typeof ref === "object") return { t: "qa", f: MAN.qa[ref.qa].a, qa: ref.qa };
  var b = MAN.bloques[ref], o = { id: b.id, t: b.tipo, f: b.fmt };
  CAMPOS.forEach(function(c){
    var v = b[c[0]];
    if (v && (!Array.isArray(v) || v.length)) o[c[1]] = v;
  });
  return o;
}
/* texto donde tiene que estar, letra por letra, la cita de una pregunta */
export function textoFuente(f){
  if (!f || typeof f !== "object") return null;
  if ("qa" in f) return MAN.qa[f.qa] ? MAN.qa[f.qa].a : null;
  if ("bloques" in f){
    if (!Array.isArray(f.bloques) || !f.bloques.length || f.bloques.some(function(x){ return !MAN.bloques[x]; })) return null;
    return f.bloques.map(function(x){ return MAN.bloques[x].texto; }).join(" · ");
  }
  var b = MAN.bloques[f.bloque];
  return b ? b.texto : null;
}
function origenDe(f){
  if (!f || typeof f !== "object") return { texto: "" };
  if ("qa" in f) return { qa: f.qa, texto: "Banco de respuestas del manual" };
  if ("bloques" in f){
    var textos = [];
    (f.bloques || []).forEach(function(x){ var o = fuenteDe(x); if (o && textos.indexOf(o.texto) < 0) textos.push(o.texto); });
    return { texto: textos.join(" · ") };
  }
  return fuenteDe(f.bloque) || { texto: "" };
}
function armarPregunta(p, extra){
  var q = Object.assign({}, p, extra);
  if (!q.cita && p.fuente && p.fuente.bloques) q.cita = textoFuente(p.fuente) || "";
  q.origen = origenDe(p.fuente);
  return q;
}

/* ============ LÍNEAS ============ */
function sinAviso(){}
function armarLinea(meta, src){
  var l = { codigo: meta.codigo, nombre: meta.nombre, archivo: meta.archivo || "", intro: "",
            niveles: [], objeciones: [], casos: [], activa: false, fuente: null, error: "" };
  if (!src) return l;
  if (src.__error){ l.error = String(src.__error.message || src.__error); return l; }
  l.fuente = src;
  l.intro = src.intro || "";
  (src.niveles || []).forEach(function(niv, ni){
    var n = { id: niv.id, titulo: niv.titulo, idx: ni, linea: l, modulos: [] };
    (niv.modulos || []).forEach(function(mod){
      var m = { id: mod.id, titulo: mod.titulo, nivel: n, lecciones: [] };
      (mod.lecciones || []).forEach(function(lec){
        var refs = expandir(lec.contenido, sinAviso, lec.id);
        var cuerpo = refs.map(bloqueSalida);
        var texto = cuerpo.map(function(c){ return c.t === "nota" ? (c.lbl || "") + " " + c.f : c.f; }).join(" ");
        var pal = palabras(texto);
        var fuentes = [], vistos = {};
        refs.forEach(function(r){
          var f = fuenteDe(r);
          if (!f) return;
          var clave = f.qa || (f.vista + "/" + f.sub);
          if (vistos[clave]) return;
          vistos[clave] = 1;
          if (!f.qa) f = { vista: f.vista, sub: f.sub, texto: MAN.vistas[f.vista].menu + " › " + tituloSub(f.vista, f.sub) };
          fuentes.push(f);
        });
        var x = { id: lec.id, titulo: lec.titulo, modulo: m, nivel: n, linea: l, cuerpo: cuerpo, fuentes: fuentes,
                  palabras: pal, minutos: Math.min(3, Math.max(2, Math.round(pal / 100))), preguntas: [] };
        x.preguntas = (lec.preguntas || []).map(function(p){ return armarPregunta(p, { leccion: x }); });
        m.lecciones.push(x);
      });
      n.modulos.push(m);
    });
    l.niveles.push(n);
  });
  /* casos de mostrador y objeciones: misma forma, pasos de opción múltiple */
  [["casos", "caso"], ["objeciones", "objecion"]].forEach(function(par){
    (src[par[0]] || []).forEach(function(ob){
      var s = { id: ob.id, tipo: par[1], titulo: ob.titulo, cliente: ob.cliente, situacion: ob.situacion,
                icono: ob.icono || "", linea: l, pasos: [], manual: [] };
      s.pasos = (ob.pasos || []).map(function(p){ return armarPregunta(Object.assign({ tipo: "opcion" }, p), { sim: s }); });
      expandir(ob.manual || [], sinAviso, ob.id).forEach(function(r){
        s.manual.push({ f: typeof r === "object" ? MAN.qa[r.qa].a : MAN.bloques[r].fmt, fuente: fuenteDe(r) });
      });
      l[par[0]].push(s);
    });
  });
  l.activa = l.niveles.length > 0;
  return l;
}
function vaciar(o){ Object.keys(o).forEach(function(k){ delete o[k]; }); }
function indexar(){
  vaciar(LEC); vaciar(PREG); vaciar(SIM);
  DATA.lineas.forEach(function(l){
    leccionesLinea(l).forEach(function(x){
      LEC[x.id] = x;
      x.preguntas.forEach(function(p){ PREG[p.id] = p; });
    });
    l.casos.concat(l.objeciones).forEach(function(s){ SIM[s.id] = s; });
  });
}

/* ============ CONSULTAS ============ */
export function lineaPorCodigo(c){
  for (var i = 0; i < DATA.lineas.length; i++) if (String(DATA.lineas[i].codigo) === String(c)) return DATA.lineas[i];
  return null;
}
export function lineasActivas(){ return DATA.lineas.filter(function(l){ return l.activa; }); }
export function leccionesDe(n){ var o = []; n.modulos.forEach(function(m){ o = o.concat(m.lecciones); }); return o; }
export function leccionesLinea(l){ var o = []; l.niveles.forEach(function(n){ o = o.concat(leccionesDe(n)); }); return o; }
export function preguntasDe(lista){ var o = []; lista.forEach(function(x){ o = o.concat(x.preguntas); }); return o; }
export function preguntasLinea(l){ return preguntasDe(leccionesLinea(l)); }
export function numeroLeccion(x){ return x.id.split("-L")[1] || ""; }
export function textoLeccion(x){
  return x.cuerpo.map(function(b){ return (b.lbl ? b.lbl + ": " : "") + String(b.f || "").replace(/\*\*/g, ""); }).join("\n");
}
