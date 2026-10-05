/* Certificado en PNG dibujado en canvas, sin librerías ni internet. */
import { h, fechaEc } from "./util.js";
import { DATA } from "./datos.js";
import { REGLAS, examen, nombre } from "./estado.js";
import { toast } from "./ui.js";

function ajustarFuente(c, txt, peso, max, min, ancho, familia){
  var t = max;
  do { c.font = peso + " " + t + "px " + familia; t -= 2; } while (c.measureText(txt).width > ancho && t > min);
}
function gotaCanvas(c, x, y, s, color, grosor){
  /* el mismo trazo de la gota del manual: M12 1C12 1 2 13 2 19.5A10 10 0 0 0 22 19.5C22 13 12 1 12 1Z */
  c.save(); c.translate(x - 12 * s, y - 1 * s); c.scale(s, s);
  c.beginPath(); c.moveTo(12, 1);
  c.bezierCurveTo(12, 1, 2, 13, 2, 19.5);
  c.arc(12, 19.5, 10, Math.PI, 0, true);
  c.bezierCurveTo(22, 13, 12, 1, 12, 1);
  c.closePath();
  c.lineWidth = grosor; c.strokeStyle = color; c.stroke(); c.restore();
}
export function datosCert(l){
  var e = examen(l);
  return { nombre: nombre() || "Asesor", linea: l.codigo + " · " + l.nombre, bien: e.cert.bien, total: e.cert.total,
           pct: e.cert.pct, fecha: fechaEc(e.cert.fecha), lineaNombre: l.nombre,
           archivo: "certificado-academia-austrofil-" + l.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-") + ".png" };
}
export async function dibujarCertificado(cv, d){
  try {
    await Promise.all(['800 60px "Archivo"', '400 24px "IBM Plex Sans"', '600 24px "IBM Plex Mono"']
      .map(function(f){ return document.fonts && document.fonts.load ? document.fonts.load(f) : null; }));
  } catch (e){}
  var W = 1600, H = 1131, c = cv.getContext("2d");
  cv.width = W; cv.height = H;
  var SANS = '"IBM Plex Sans", Roboto, sans-serif', MONO = '"IBM Plex Mono", monospace', TIT = '"Archivo", "Arial Narrow", sans-serif';
  c.fillStyle = "#FCFCFA"; c.fillRect(0, 0, W, H);
  c.fillStyle = "#F6E7D6"; c.fillRect(0, 0, W, 18); c.fillRect(0, H - 18, W, 18);
  c.strokeStyle = "#B4550F"; c.lineWidth = 5; c.strokeRect(46, 46, W - 92, H - 92);
  c.strokeStyle = "#D8DCD2"; c.lineWidth = 2; c.strokeRect(62, 62, W - 124, H - 124);
  gotaCanvas(c, W / 2, 112, 3.1, "#B4550F", 2.4);
  c.textAlign = "center"; c.textBaseline = "alphabetic";
  if ("letterSpacing" in c) c.letterSpacing = "6px";
  c.fillStyle = "#8E430C"; c.font = "600 24px " + MONO;
  c.fillText("ACADEMIA AUSTROFIL", W / 2, 248);
  if ("letterSpacing" in c) c.letterSpacing = "0px";
  if ("fontStretch" in c) c.fontStretch = "expanded";
  c.fillStyle = "#191C19"; c.font = "800 66px " + TIT;
  c.fillText("Certificado de aprobación", W / 2, 336);
  if ("fontStretch" in c) c.fontStretch = "normal";
  c.fillStyle = "#565C54"; c.font = "400 30px " + SANS;
  c.fillText("Se certifica que", W / 2, 424);
  c.fillStyle = "#191C19";
  if ("fontStretch" in c) c.fontStretch = "semi-expanded";
  ajustarFuente(c, d.nombre, "800", 84, 40, W - 320, TIT);
  c.fillText(d.nombre, W / 2, 524);
  if ("fontStretch" in c) c.fontStretch = "normal";
  c.strokeStyle = "#BFC5B7"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(W / 2 - 430, 556); c.lineTo(W / 2 + 430, 556); c.stroke();
  c.fillStyle = "#565C54"; c.font = "400 30px " + SANS;
  c.fillText("aprobó el examen final de la línea", W / 2, 624);
  c.fillStyle = "#B4550F"; c.font = "800 56px " + TIT;
  c.fillText(d.linea.toUpperCase(), W / 2, 702);
  c.fillStyle = "#191C19"; c.font = "600 34px " + MONO;
  c.fillText("Nota: " + d.bien + " de " + d.total + "  ·  " + d.pct + " %", W / 2, 790);
  c.fillStyle = "#565C54"; c.font = "600 28px " + MONO;
  c.fillText("Fecha: " + d.fecha, W / 2, 846);
  c.fillStyle = "#6B7268"; c.font = "400 22px " + SANS;
  c.fillText("Contenido: Manual de Campo Austrofil v" + (DATA.manual.version || "") + "  ·  Academia Austrofil, versión " + window.VERSION.n, W / 2, 990);
  c.fillText("Examen de " + d.total + " preguntas al azar del banco fijo · se aprueba con " + Math.round(REGLAS.NOTA_EXAMEN * 100) + " %", W / 2, 1028);
}
export function blobDe(cv){ return new Promise(function(res){ cv.toBlob(function(b){ res(b); }, "image/png"); }); }
export function descargarBlob(blob, nombreArchivo){
  var a = h("a", { href: URL.createObjectURL(blob), download: nombreArchivo });
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
export async function compartirCert(cv, d){
  var blob = await blobDe(cv);
  var texto = "Aprobé la Academia Austrofil — " + d.lineaNombre + " con " + d.pct + " %.";
  try {
    var file = new File([blob], d.archivo, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: "Certificado Academia Austrofil", text: texto });
      return;
    }
  } catch (e){ if (e && e.name === "AbortError") return; }
  descargarBlob(blob, d.archivo);
  toast("Descargué el certificado: adjúntalo en WhatsApp.");
  window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
}
