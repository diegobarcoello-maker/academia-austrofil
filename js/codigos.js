/* Códigos que el asesor copia o manda por WhatsApp. No pasan por ningún servidor.
   - Respaldo (AA1.… / AA0.…): todo el avance de un asesor, para cambiar de celular.
     Acepta también los códigos de la v1, que guardaban un solo asesor.
   - Avance (AV1.… / AV0.…): resumen para el supervisor, que lo pega en su Panel del supervisor.
   El 1 o el 0 del prefijo dicen si el contenido va comprimido. Formato: PREFIJO.<datos>.<suma de control> */
import { empaquetar, desempaquetar, suma, hoy, limpio, pct, fechaEc } from "./util.js";
import { lineasActivas } from "./datos.js";
import { ST, normalizar, avanceLinea, temasFlojos, rachaActual, diasEstudiados, ultimoEstudio } from "./estado.js";

/* ============ RESPALDO ============ */
export async function crearRespaldo(){
  var o = { a: "academia", v: 2, f: hoy(),
            perfil: { id: ST.perfil.id, nombre: ST.perfil.nombre, creado: ST.perfil.creado || "" }, datos: ST.d };
  var p = await empaquetar(o);
  return (p.comprimido ? "AA1" : "AA0") + "." + p.cuerpo + "." + p.suma;
}
export async function leerRespaldo(texto){
  var t = String(texto || "").replace(/\s+/g, "");
  var m = t.match(/(AA[01])\.([A-Za-z0-9_-]+)\.([0-9a-z]{6})/);
  if (!m) throw new Error("Ese texto no es un código de respaldo de la Academia. Cópialo completo (empieza con AA1.).");
  if (suma(m[2]) !== m[3]) throw new Error("El código está incompleto o cambió una letra. Cópialo de nuevo, completo.");
  var o;
  try { o = await desempaquetar(m[2], m[1] === "AA1"); }
  catch (e){ throw new Error(e && e.message && /Chrome/.test(e.message) ? e.message : "No pude leer el código. Cópialo de nuevo, completo."); }
  if (o && o.a === "academia" && o.v === 2 && o.perfil && o.datos)
    return { perfil: o.perfil, datos: normalizar(o.datos), fecha: o.f || "" };
  if (o && o.a === "academia" && o.d && typeof o.d === "object"){
    /* código de la v1: un solo asesor, con cada parte guardada como texto JSON */
    var d = o.d;
    var leer = function(k){ try { var v = JSON.parse(d[k] || "null"); return v && typeof v === "object" ? v : null; } catch (e){ return null; } };
    return { perfil: { nombre: limpio(d["academia.nombre"], 60) || "Asesor" },
             datos: normalizar({ progreso: leer("academia.progreso"), repaso: leer("academia.repaso"), racha: leer("academia.racha") }),
             fecha: o.f || "" };
  }
  throw new Error("Ese código no es de la Academia.");
}

/* ============ AVANCE PARA EL SUPERVISOR ============ */
function resumenLineas(){
  return lineasActivas().map(function(l){
    var a = avanceLinea(l), e = a.examen;
    return { c: l.codigo, n: l.nombre, la: a.lecciones, lt: a.total, na: a.niveles, nt: a.nivelesTotal,
             e: a.aprobado ? { p: e.cert.pct, f: e.cert.fecha } : null,
             ei: e ? e.intentos || 0 : 0, em: e && e.total ? pct(e.mejor, e.total) : 0,
             ca: a.casos, ct: a.casosTotal, oa: a.objeciones, ot: a.objecionesTotal,
             fl: temasFlojos(l).map(function(m){ return m.titulo; }) };
  });
}
export async function crearCodigoAvance(){
  var o = { a: "avance", v: 1, id: ST.perfil.id, n: ST.perfil.nombre, f: hoy(), app: window.VERSION.n,
            r: rachaActual(), m: ST.d.racha.mejor || 0, ds: diasEstudiados(30), ue: ultimoEstudio(), l: resumenLineas() };
  var p = await empaquetar(o);
  return (p.comprimido ? "AV1" : "AV0") + "." + p.cuerpo + "." + p.suma;
}
/* texto legible del avance; el supervisor lo lee en WhatsApp aunque no use el panel */
export function textoAvance(){
  var out = ["ACADEMIA AUSTROFIL · MI AVANCE", "Asesor: " + ST.perfil.nombre, "Fecha: " + fechaEc(hoy())];
  resumenLineas().forEach(function(x){
    out.push("");
    out.push("Línea " + x.c + " " + x.n + ": " + pct(x.la, x.lt) + " % · " + x.la + "/" + x.lt + " lecciones · niveles " + x.na + "/" + x.nt);
    out.push("Examen final: " + (x.e ? "aprobado con " + x.e.p + " % (" + fechaEc(x.e.f) + ")" : x.ei ? "no aprobado (mejor " + x.em + " %)" : "no rendido"));
    out.push("Mostrador: casos " + x.ca + "/" + x.ct + " · objeciones " + x.oa + "/" + x.ot);
    out.push("Temas para reforzar: " + (x.fl.length ? x.fl.join("; ") : "ninguno"));
  });
  out.push("");
  out.push("Racha: " + rachaActual() + " · días de estudio en 30 días: " + diasEstudiados(30));
  return out.join("\n");
}
/* saca todos los códigos AV de un texto pegado (uno o varios mensajes de WhatsApp) */
export async function leerReportes(texto){
  var re = /(AV[01])\.([A-Za-z0-9_-]+)\.([0-9a-z]{6})/g, m, out = [], malos = 0, t = String(texto || "");
  while ((m = re.exec(t))){
    if (suma(m[2]) !== m[3]){ malos++; continue; }
    try {
      var o = await desempaquetar(m[2], m[1] === "AV1");
      if (o && o.a === "avance" && o.id && o.n && Array.isArray(o.l)) out.push(o); else malos++;
    } catch (e){ malos++; }
  }
  return { reportes: out, malos: malos };
}
