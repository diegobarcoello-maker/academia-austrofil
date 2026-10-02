#!/usr/bin/env python3
"""Dibuja los íconos de la gota (192 y 512 px) con Chromium, sin librerías externas en la app.
Uso: python3 tools/iconos.py   → icons/gota-192.png e icons/gota-512.png
El dibujo cabe en la zona segura de los íconos «maskable» (círculo del 80 %)."""
import os
from playwright.sync_api import sync_playwright

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="{s}" height="{s}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#B4550F"/>
  <g transform="translate(50 52) scale(1.78) translate(-12 -15.6)">
    <path d="M12 1C12 1 2 13 2 19.5A10 10 0 0 0 22 19.5C22 13 12 1 12 1Z" fill="none" stroke="#FCFCFA" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
</svg>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for s in (192, 512):
        pg = b.new_page(viewport={"width": s, "height": s})
        pg.set_content("<html><body style='margin:0'>" + SVG.format(s=s) + "</body></html>")
        pg.screenshot(path=os.path.join(RAIZ, "icons", "gota-%d.png" % s), clip={"x": 0, "y": 0, "width": s, "height": s})
        pg.close()
    b.close()
print("íconos listos")
