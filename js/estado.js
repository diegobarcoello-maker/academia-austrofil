/* Avance de cada asesor, guardado solo en este celular (localStorage, claves academia.*).
   - academia.perfiles  → asesores de este celular y cuál está activo.
   - academia.p.<id>    → avance de un asesor: lecciones, exámenes, repaso, racha y días de estudio.
   - academia.ajustes   → tema del celular.
   - academia.equipo    → reportes que juntó el supervisor (pantallas/supervisor.js).
   La v1 guardaba un solo asesor en academia.nombre / progreso / repaso / racha. Se migra solo al primer
   arranque de la v2 y esas claves quedan intactas como copia de seguridad. */
import { lsGet, lsSet, leerJSON, hoy, sumarDias, diasEntre, uid, limpio, pct } from "./util.js";
import { DATA, PREG, lineaPorCodigo, leccionesDe, leccionesLinea, lineasActivas } from "./datos.js";

export var REGLAS = {
  NOTA_MINIMA: 0.75,          /* aprobar una lección (3 de 4, 4 de 5) */
  NOTA_EXAMEN: 0.8,           /* aprobar el examen final */
  NOTA_PRUEBA: 0.8,           /* aprobar la prueba de nivel */
  PREGUNTAS_EXAMEN: 20,
  PREGUNTAS_PRUEBA: 10,
  QUIZ_RAPIDO: 5,
  MAX_REPASO_DIA: 10,
  CAJAS_DIAS: [1, 2, 4, 8, 16] /* a cuántos días vuelve una pregunta según cuántas veces seguidas la acertaste */
};
export var CLAVES = { perfiles: "academia.perfiles", ajustes: "academia.ajustes", equipo: "academia.equipo", perfil: "academia.p." };
var V1 = { nombre: "academia.nombre", progreso: "academia.progreso", repaso: "academia.repaso", racha: "academia.racha" };

export var ST = { perfiles: { v: 2, activo: "", lista: [] }, perfil: null, d: normalizar(null), ajustes: { v: 2, tema: "auto" } };

export function normalizar(d){
  d = d || {};
  var p = d.progreso || {}, r = d.repaso || {}, ra = d.racha || {};
  return {
    v: 2,
    linea: d.linea || null,
    progreso: { lecciones: p.lecciones || {}, examenes: p.examenes || {}, stats: p.stats || {},
                sims: p.sims || p.objeciones || {}, pruebas: p.pruebas || {},
                charlas: Array.isArray(p.charlas) ? p.charlas : [] },
    repaso: { items: r.items || {}, fijas: r.fijas || {}, dia: r.dia || "", hechas: r.hechas || 0, hecho: r.hecho || "" },
    racha: { dias: ra.dias || 0, ultimo: ra.ultimo || "", mejor: ra.mejor || 0 },
    actividad: d.actividad && typeof d.actividad === "object" ? d.actividad : {}
  };
}

/* ============ CARGA, PERFILES Y MIGRACIÓN ============ */
export function cargarEstado(){
  var a = leerJSON(CLAVES.ajustes) || {};
  ST.ajustes = { v: 2, tema: a.tema || "auto" };
  var p = leerJSON(CLAVES.perfiles);
  if (p && Array.isArray(p.lista)){
    ST.perfiles = { v: 2, activo: p.activo || "", lista: p.lista.filter(function(x){ return x && x.id && x.nombre; }) };
  } else {
    ST.perfiles = { v: 2, activo: "", lista: [] };
    migrarV1();
  }
  activar(ST.perfiles.activo);
}
function migrarV1(){
  var nombre = limpio(lsGet(V1.nombre), 60);
  if (!nombre) return false;
  var aj = leerJSON(CLAVES.ajustes) || {};
  var d = normalizar({ progreso: leerJSON(V1.progreso), repaso: leerJSON(V1.repaso), racha: leerJSON(V1.racha), linea: aj.linea || null });
  /* los días en que estudió (según lo guardado) cuentan como actividad */
  if (d.racha.ultimo) d.actividad[d.racha.ultimo] = 1;
  Object.keys(d.progreso.lecciones).forEach(function(id){
    var u = d.progreso.lecciones[id].ultimo;
    if (u) d.actividad[u] = (d.actividad[u] || 0) + 1;
  });
  /* la v1 solo contaba el repaso para la racha; la v2 cuenta cualquier día de estudio */
  var dias = Object.keys(d.actividad).sort(), ult = dias[dias.length - 1];
  if (ult && ult <= hoy()){
    var n = 1;
    while (d.actividad[sumarDias(ult, -n)]) n++;
    if (d.racha.ultimo === ult) n = Math.max(n, d.racha.dias);
    if (!d.racha.ultimo || d.racha.ultimo <= ult) d.racha = { dias: n, ultimo: ult, mejor: Math.max(d.racha.mejor || 0, n) };
  }
  var id = uid();
  lsSet(CLAVES.perfil + id, JSON.stringify(d));
  ST.perfiles = { v: 2, activo: id, lista: [{ id: id, nombre: nombre, creado: hoy(), migrado: "v1" }] };
  guardarPerfiles();
  return true;
}
function activar(id){
  var lista = ST.perfiles.lista;
  var p = lista.filter(function(x){ return x.id === id; })[0] || lista[0] || null;
  ST.perfil = p;
  ST.d = p ? normalizar(leerJSON(CLAVES.perfil + p.id)) : normalizar(null);
  if (p && ST.perfiles.activo !== p.id){ ST.perfiles.activo = p.id; guardarPerfiles(); }
}
export function guardar(){
  if (ST.perfil) lsSet(CLAVES.perfil + ST.perfil.id, JSON.stringify(ST.d));
  lsSet(CLAVES.ajustes, JSON.stringify(ST.ajustes));
}
function guardarPerfiles(){ lsSet(CLAVES.perfiles, JSON.stringify(ST.perfiles)); }
export function nombre(){ return ST.perfil ? ST.perfil.nombre : ""; }
export function hayPerfil(){ return !!ST.perfil; }
export function crearPerfil(n, datos){
  var p = { id: uid(), nombre: limpio(n, 60), creado: hoy() };
  ST.perfiles.lista.push(p);
  lsSet(CLAVES.perfil + p.id, JSON.stringify(normalizar(datos)));
  ST.perfiles.activo = p.id;
  guardarPerfiles();
  activar(p.id);
  marcarElegido();
  return p;
}
export function cambiarPerfil(id){
  guardar();
  ST.perfiles.activo = id;
  guardarPerfiles();
  activar(id);
  marcarElegido();
}
export function renombrar(n){
  if (!ST.perfil) return;
  ST.perfil.nombre = limpio(n, 60);
  guardarPerfiles();
}
export function borrarAvance(){
  ST.d = normalizar({ linea: ST.d.linea });
  guardar();
}
export function borrarPerfil(id){
  ST.perfiles.lista = ST.perfiles.lista.filter(function(x){ return x.id !== id; });
  lsSet(CLAVES.perfil + id, "");
  if (ST.perfiles.activo === id) ST.perfiles.activo = ST.perfiles.lista.length ? ST.perfiles.lista[0].id : "";
  guardarPerfiles();
  activar(ST.perfiles.activo);
}
/* restaurar desde un código de respaldo: si el asesor ya existe en este celular se reemplaza su avance */
export function restaurarPerfil(perfil, datos){
  var id = perfil.id || uid();
  var ya = ST.perfiles.lista.filter(function(x){ return x.id === id; })[0];
  if (ya) ya.nombre = limpio(perfil.nombre, 60) || ya.nombre;
  else ST.perfiles.lista.push({ id: id, nombre: limpio(perfil.nombre, 60) || "Asesor", creado: perfil.creado || hoy() });
  lsSet(CLAVES.perfil + id, JSON.stringify(normalizar(datos)));
  ST.perfiles.activo = id;
  guardarPerfiles();
  activar(id);
  marcarElegido();
}
export function datosDe(id){ return normalizar(leerJSON(CLAVES.perfil + id)); }

/* con varios asesores en el mismo celular se pregunta «¿quién estudia?» una vez por sesión */
var ELEGIDO = "academia.elegido";
export function marcarElegido(){ try { sessionStorage.setItem(ELEGIDO, "1"); } catch (e){} }
export function hayQueElegir(){
  if (ST.perfiles.lista.length < 2) return false;
  try { return sessionStorage.getItem(ELEGIDO) !== "1"; } catch (e){ return false; }
}

/* que el navegador no borre el avance cuando el celular se queda sin espacio */
export var almacen = { persistente: null };
export function pedirPersistencia(){
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persisted().then(function(ya){ return ya || navigator.storage.persist(); })
      .then(function(ok){ almacen.persistente = !!ok; }).catch(function(){});
  } catch (e){}
}

/* ============ RUTA ============ */
export function lineaActual(){
  var l = lineaPorCodigo(ST.d.linea);
  if (l && l.activa) return l;
  return lineasActivas()[0] || DATA.lineas[0] || null;
}
export function elegirLinea(codigo){ ST.d.linea = +codigo; guardar(); }
export function lecOk(id){ var r = ST.d.progreso.lecciones[id]; return !!(r && r.ok); }
export function lecRegistro(id){ return ST.d.progreso.lecciones[id] || null; }
export function nivelOk(n){ return leccionesDe(n).every(function(x){ return lecOk(x.id); }); }
export function nivelAbierto(n){ return n.idx === 0 || nivelOk(n.linea.niveles[n.idx - 1]); }
export function aprobadasEn(lista){ return lista.filter(function(x){ return lecOk(x.id); }).length; }
export function lineaOk(l){ return l.activa && l.niveles.every(nivelOk); }
export function examen(l){ return ST.d.progreso.examenes[l.codigo] || null; }
/* el nivel en curso: el primero sin aprobar (null si ya aprobó todos) */
export function nivelActual(l){
  for (var i = 0; i < l.niveles.length; i++) if (!nivelOk(l.niveles[i])) return l.niveles[i];
  return null;
}
export function siguienteLeccion(l){
  var n = nivelActual(l);
  if (!n || !nivelAbierto(n)) return null;
  var ls = leccionesDe(n);
  for (var j = 0; j < ls.length; j++) if (!lecOk(ls[j].id)) return ls[j];
  return null;
}
export function simHecho(id){ return ST.d.progreso.sims[id] || null; }
export function avanceLinea(l){
  var lec = leccionesLinea(l), ok = aprobadasEn(lec), e = examen(l);
  var hechos = function(lista){ return lista.filter(function(s){ return simHecho(s.id); }).length; };
  return { lecciones: ok, total: lec.length, pct: pct(ok, lec.length),
           niveles: l.niveles.filter(nivelOk).length, nivelesTotal: l.niveles.length,
           examen: e, aprobado: !!(e && e.aprobado),
           casos: hechos(l.casos), casosTotal: l.casos.length,
           objeciones: hechos(l.objeciones), objecionesTotal: l.objeciones.length };
}

/* ============ REPASO ESPACIADO ============ */
/* falló: vuelve mañana */
export function aCaja1(id){
  if (!PREG[id]) return;
  delete ST.d.repaso.fijas[id];
  ST.d.repaso.items[id] = { c: 1, d: sumarDias(hoy(), REGLAS.CAJAS_DIAS[0]) };
}
/* acertó en una lección aprobada: entra al repaso a los 2 días si todavía no estaba */
export function entrarCaja2(id){
  if (!PREG[id] || ST.d.repaso.items[id] || ST.d.repaso.fijas[id]) return;
  ST.d.repaso.items[id] = { c: 2, d: sumarDias(hoy(), REGLAS.CAJAS_DIAS[1]) };
}
/* respuesta en el repaso: si acierta vuelve más tarde; tras el último salto queda dominada */
export function moverCaja(id, ok){
  var it = ST.d.repaso.items[id];
  if (!ok){ aCaja1(id); return; }
  if (!it) return;
  if (it.c >= REGLAS.CAJAS_DIAS.length){ delete ST.d.repaso.items[id]; ST.d.repaso.fijas[id] = hoy(); return; }
  it.c += 1;
  it.d = sumarDias(hoy(), REGLAS.CAJAS_DIAS[it.c - 1]);
}
export function vencidas(){
  var t = hoy(), items = ST.d.repaso.items;
  return Object.keys(items).filter(function(id){ return PREG[id] && items[id].d <= t; })
    .sort(function(a, b){ return items[a].c - items[b].c || (items[a].d < items[b].d ? -1 : items[a].d > items[b].d ? 1 : 0); });
}
export function enRepaso(){ return Object.keys(ST.d.repaso.items).filter(function(id){ return PREG[id]; }).length; }
export function dominadas(){ return Object.keys(ST.d.repaso.fijas).filter(function(id){ return PREG[id]; }).length; }
export function hechasHoy(){ return ST.d.repaso.dia === hoy() ? ST.d.repaso.hechas : 0; }
export function cupoRepaso(){ return Math.max(0, REGLAS.MAX_REPASO_DIA - hechasHoy()); }
export function pendientesHoy(){ return Math.min(vencidas().length, cupoRepaso()); }
export function contarHecha(){
  var t = hoy();
  if (ST.d.repaso.dia !== t){ ST.d.repaso.dia = t; ST.d.repaso.hechas = 0; }
  ST.d.repaso.hechas++;
}
export function anotar(id, ok){
  var s = ST.d.progreso.stats[id] || [0, 0];
  s[ok ? 0 : 1]++;
  ST.d.progreso.stats[id] = s;
}
/* módulos donde más falla: más de 25 % de errores (con 3 respuestas o más) o 2 preguntas que volvieron a empezar */
export function temasFlojos(l){
  var out = [];
  l.niveles.forEach(function(n){ n.modulos.forEach(function(m){
    var ok = 0, mal = 0, c1 = 0;
    m.lecciones.forEach(function(x){ x.preguntas.forEach(function(p){
      var s = ST.d.progreso.stats[p.id];
      if (s){ ok += s[0]; mal += s[1]; }
      var it = ST.d.repaso.items[p.id];
      if (it && it.c === 1) c1++;
    }); });
    var tot = ok + mal;
    if ((tot >= 3 && mal / tot > 0.25) || c1 >= 2) out.push({ modulo: m, r: tot ? mal / tot : 0, c: c1 });
  }); });
  out.sort(function(a, b){ return b.r - a.r || b.c - a.c; });
  return out.slice(0, 3).map(function(x){ return x.modulo; });
}

/* ============ CONVERSACIONES CON CLIENTES (pestaña Hablar) ============ */
/* r = { c: cliente, d: dificultad, n: nota 0-10, f: fecha, r: resultado }; se guardan las últimas 40 */
export function guardarCharla(r){
  var a = ST.d.progreso.charlas;
  a.push(r);
  if (a.length > 40) a.splice(0, a.length - 40);
}
export function resumenCharlas(d){
  var a = ((d || ST.d).progreso.charlas || []).filter(function(x){ return typeof x.n === "number"; });
  if (!a.length) return { n: 0, prom: 0, mejor: 0 };
  var suma = a.reduce(function(s, x){ return s + x.n; }, 0);
  return { n: a.length, prom: Math.round(suma / a.length * 10) / 10, mejor: Math.max.apply(null, a.map(function(x){ return x.n; })) };
}
export function mejorCharla(clienteId){
  var a = ST.d.progreso.charlas.filter(function(x){ return x.c === clienteId && typeof x.n === "number"; });
  return a.length ? Math.max.apply(null, a.map(function(x){ return x.n; })) : null;
}

/* ============ RACHA Y DÍAS DE ESTUDIO ============ */
/* cualquier sesión terminada (lección, repaso, quiz, caso, objeción, examen) cuenta como día de estudio */
export function marcarEstudio(){
  var t = hoy(), a = ST.d.actividad, ra = ST.d.racha;
  a[t] = (a[t] || 0) + 1;
  var limite = sumarDias(t, -120);
  Object.keys(a).forEach(function(k){ if (k < limite) delete a[k]; });
  if (ra.ultimo !== t){
    ra.dias = ra.ultimo && diasEntre(ra.ultimo, t) === 1 ? ra.dias + 1 : 1;
    ra.ultimo = t;
    ra.mejor = Math.max(ra.mejor || 0, ra.dias);
  }
}
export function rachaActual(d){
  d = d || ST.d;
  if (!d.racha.ultimo) return 0;
  var x = diasEntre(d.racha.ultimo, hoy());
  return x >= 0 && x <= 1 ? d.racha.dias : 0;
}
/* lunes a domingo de esta semana */
export function semana(){
  var t = hoy(), dia = (new Date().getDay() + 6) % 7, lunes = sumarDias(t, -dia);
  return [0, 1, 2, 3, 4, 5, 6].map(function(i){
    var iso = sumarDias(lunes, i);
    return { iso: iso, hecho: !!ST.d.actividad[iso], hoy: iso === t, futuro: i > dia };
  });
}
export function diasEstudiados(n, d){
  d = d || ST.d;
  var desde = sumarDias(hoy(), -(n - 1));
  return Object.keys(d.actividad).filter(function(k){ return k >= desde; }).length;
}
export function ultimoEstudio(d){
  d = d || ST.d;
  var ks = Object.keys(d.actividad).sort();
  return ks.length ? ks[ks.length - 1] : d.racha.ultimo || "";
}
