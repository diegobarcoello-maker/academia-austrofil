# Academia Austrofil — Lubricantes

Tutor para que los asesores de Austrofil aprendan la línea de lubricantes con el texto del
[Manual de Campo](https://diegobarcoello-maker.github.io/manual-austrofil/) y se certifiquen.
Sitio: https://diegobarcoello-maker.github.io/academia-austrofil/

- `index.html` lleva todo inline (HTML, CSS, JS y datos). `sw.js` lo deja usable sin internet.
- El contenido sale solo del manual: `datos/manual.json` es la extracción (`tools/extraer_manual.py`).
- La ruta va como datos: `datos/lineas.json` (orden y códigos) y un `datos/linea-<código>-<nombre>.json` por línea.
- Pruebas: `python3 -m pytest tests -q` (Playwright con Chromium, perfil Android; no usan internet).

## Agregar una línea nueva (ejemplo: 10 Filtros)

1. Si el contenido está en una vista del manual que todavía no se extrae, agrégala y vuelve a extraer:
   `python3 tools/extraer_manual.py ../manual-austrofil/index.html datos/manual.json --vistas v-lubricantes,v-motos,v-marcas,v-vender,v-mercado,v-glosario,v-filtros`
   Cada bloque queda con un id (`fi1.3`, `fi2.1`…): búscalos en `datos/manual.json`.
2. Crea `datos/linea-10-filtros.json` con la misma forma que `linea-11-lubricantes.json`:
   - `niveles` → `modulos` → `lecciones` → `preguntas`, con ids que empiecen por el código (`10-N1`, `10-M01`, `10-L01`, `10-L01-P1`);
   - `contenido` de cada lección: ids de bloques (`"fi1.1..fi1.9"` para un tramo) o `{"qa": "clave del banco"}`;
   - cada pregunta: `tipo` (`opcion`, `vf` o `emparejar`), una sola correcta y su `fuente`
     (`{"bloque": id}`, `{"bloques": [ids]}` o `{"qa": clave}`) con la `cita` copiada letra por letra;
   - `objeciones` es opcional (tres pasos: preguntar, argumentar, cerrar).
3. En `datos/lineas.json`, ponle `"archivo": "linea-10-filtros.json"` a la línea 10. Sin archivo sale como «Próximamente».
4. `python3 tools/construir.py` valida (fuentes, citas, una sola correcta, 3 a 5 preguntas, máximo 400 palabras) y mete los datos en `index.html`.
5. Sube la versión en `index.html` (`var VERSION = { n: …, fecha: "DD-MM-AAAA" }`): nombra la caché y avisa a los celulares que hay versión nueva.
6. `python3 -m pytest tests -q` y publica (commit y push a `main`; GitHub Pages publica la raíz).

No pongas claves, tokens ni teléfonos en el repo: es público. Cada asesor pega su clave de Gemini en la app y queda solo en su navegador.
