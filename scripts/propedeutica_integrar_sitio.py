#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Integra la herramienta «Propedéutica médica basada en evidencia» en el sitio.
Idempotente: si ya está aplicado, no vuelve a insertar nada."""
import re, sys
from pathlib import Path

RAIZ = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
cambios = []

# ─────────────────────────── 1 · src/i18n.mjs ───────────────────────────
p = RAIZ / "src/i18n.mjs"
s = p.read_text(encoding="utf-8")

ES = """    // Herramienta: Propedéutica médica basada en evidencia
    'pebm.kicker': 'Herramienta docente · Diagnóstico físico',
    'pebm.title': 'Propedéutica médica basada en evidencia',
    'pebm.intro': 'Buscador de signos de exploración física con su rendimiento diagnóstico medido, calculadora de probabilidad posprueba y guía de lectura crítica. Dirigido a estudiantes, internos y residentes.',
    'pebm.iframe_title': 'Buscador interactivo de signos de exploración física',
    'pebm.fullscreen': 'Abrir en pantalla completa ↗',
    'pebm.note': 'La búsqueda ignora acentos y admite el nombre del signo, su epónimo, la condición diana o parte de la maniobra. Cada ficha declara su patrón de referencia y su nivel de confianza.',
    'pebm.meta': 'Buscador de signos de exploración física con rendimiento diagnóstico y calculadora de probabilidad posprueba (CA UDG-CA-1190).',
    'pebm.sources_heading': 'Origen de los datos',
    'pebm.sources_status': '1 185 hallazgos · 249 condiciones diana',
    'pebm.sources_own': '<b>309 hallazgos con cifras completas</b> proceden de investigación propia del Cuerpo Académico: búsqueda en PubMed por dominio, recuperación del resumen de cada PMID declarado y verificación de cada cifra contra el texto real de ese resumen. Se publican sensibilidad, especificidad, razones de verosimilitud, intervalos de confianza, población estudiada y la cita textual que respalda el dato.',
    'pebm.sources_index': '<b>876 entradas funcionan como índice</b> hacia McGee S. <i>Evidence-Based Physical Diagnosis</i>, 3.ª ed. (Elsevier, 2012). De ellas se publica la aportación del proyecto —nomenclatura en español, descripción de la maniobra, patrón de referencia y clasificación cualitativa— junto con el localizador exacto (caja EBM y página), pero no las cifras: la selección y disposición de esas tablas es obra de su autor y su editorial, y el contenido de este sitio se publica bajo CC BY 4.0.',
    'pebm.cite_heading': 'Cómo citar',
    'pebm.cite_text': 'Briseño-Ramírez J, en representación del Cuerpo Académico UDG-CA-1190. Propedéutica médica basada en evidencia [herramienta en línea]. Universidad de Guadalajara, Centro Universitario de Tlajomulco; 2026. Disponible en: https://udgca1190.com.mx/herramientas/propedeutica',
"""

EN = """    // Tool: Evidence-based physical diagnosis
    'pebm.kicker': 'Teaching tool · Physical diagnosis',
    'pebm.title': 'Evidence-based physical diagnosis',
    'pebm.intro': 'A finder for physical examination signs with their measured diagnostic performance, a post-test probability calculator, and a critical-reading guide. Aimed at students, interns and residents.',
    'pebm.iframe_title': 'Interactive finder for physical examination signs',
    'pebm.fullscreen': 'Open full screen ↗',
    'pebm.note': 'Search ignores diacritics and accepts the name of the sign, its eponym, the target condition, or part of the maneuver. Every record states its reference standard and its confidence level.',
    'pebm.meta': 'A finder for physical examination signs with diagnostic performance and a post-test probability calculator (UDG-CA-1190 Research Group).',
    'pebm.sources_heading': 'Where the data come from',
    'pebm.sources_status': '1,185 findings · 249 target conditions',
    'pebm.sources_own': '<b>309 findings carry complete figures</b> and come from original research by the Research Group: PubMed searches by domain, retrieval of the abstract for every declared PMID, and verification of every figure against the actual text of that abstract. Sensitivity, specificity, likelihood ratios, confidence intervals, the population studied and the verbatim quote supporting the datum are all published.',
    'pebm.sources_index': '<b>876 entries work as an index</b> into McGee S. <i>Evidence-Based Physical Diagnosis</i>, 3rd ed. (Elsevier, 2012). For these we publish the project’s own contribution — Spanish nomenclature, description of the maneuver, reference standard and qualitative classification — together with the exact locator (EBM box and page), but not the figures: the selection and arrangement of those tables is the work of its author and publisher, and this site’s content is released under CC BY 4.0.',
    'pebm.cite_heading': 'How to cite',
    'pebm.cite_text': 'Briseño-Ramírez J, on behalf of Research Group UDG-CA-1190. Evidence-based physical diagnosis [online tool]. University of Guadalajara, Centro Universitario de Tlajomulco; 2026. Available from: https://udgca1190.com.mx/en/herramientas/propedeutica',
"""

if "'pebm.title'" in s:
    print("· i18n.mjs: ya contenía las claves pebm.*, sin cambios")
else:
    # Se insertan justo antes de la primera clave 'dengue.kicker' de cada idioma,
    # que existe una vez en el bloque es y otra en el bloque en.
    partes = s.split("    'dengue.kicker':")
    if len(partes) != 3:
        sys.exit("✗ i18n.mjs: no se encontraron exactamente dos bloques 'dengue.kicker'")
    s = partes[0] + ES + "    'dengue.kicker':" + partes[1] + EN + "    'dengue.kicker':" + partes[2]
    p.write_text(s, encoding="utf-8")
    cambios.append("src/i18n.mjs")

# ─────────────────────── 2 · data/herramientas.yml ───────────────────────
p = RAIZ / "data/herramientas.yml"
s = p.read_text(encoding="utf-8")
ENTRADA = """- id: propedeutica-basada-en-evidencia
  nombre: "Propedéutica médica basada en evidencia"
  tipo: estadistica
  estado: activa
  resumen: "Buscador de signos de exploración física con su rendimiento diagnóstico medido."
  descripcion: |
    Herramienta docente que reúne 1 185 hallazgos de exploración física con su
    rendimiento diagnóstico: sensibilidad, especificidad, razones de verosimilitud
    con intervalo de confianza y patrón de referencia declarado. Incluye buscador
    por signo, epónimo, condición diana o maniobra; calculadora de probabilidad
    posprueba con nomograma de Fagan; y una guía de lectura crítica sobre bandas
    de LR, concordancia interobservador y sesgos de diseño de los estudios de
    pruebas diagnósticas. De los 1 185 hallazgos, 309 provienen de investigación
    propia del CA verificada contra el resumen de cada PMID y se publican con
    cifras completas; los 876 restantes funcionan como índice localizador hacia
    la obra de referencia. Bilingüe (es/en).
  tecnologias: ["Python", "JavaScript", "PubMed", "Crossref"]
  linea: clinica-epidemiologica-traslacional
  enlace_app: "/herramientas/propedeutica"
  repositorio: ""
  doi: ""
  captura: "/herramientas/placeholder.svg"
  destacado: true

"""
if "propedeutica-basada-en-evidencia" in s:
    print("· herramientas.yml: ya contenía la entrada, sin cambios")
else:
    m = re.search(r"^- id: ", s, re.M)
    if not m:
        sys.exit("✗ herramientas.yml: no se encontró ninguna entrada '- id:'")
    s = s[:m.start()] + ENTRADA + s[m.start():]
    p.write_text(s, encoding="utf-8")
    cambios.append("data/herramientas.yml")

# ───────────────────────── 3 · data/i18n/en.yml ─────────────────────────
p = RAIZ / "data/i18n/en.yml"
s = p.read_text(encoding="utf-8")
OV = """  propedeutica-basada-en-evidencia:
    nombre: Evidence-based physical diagnosis
    enlace_app: /en/herramientas/propedeutica
    resumen: A finder for physical examination signs with their measured diagnostic performance.
    descripcion: >-
      A teaching tool bringing together 1,185 physical examination findings with their diagnostic
      performance: sensitivity, specificity, likelihood ratios with confidence intervals, and a
      declared reference standard. It includes a finder by sign, eponym, target condition or
      maneuver; a post-test probability calculator with a Fagan nomogram; and a critical-reading
      guide covering LR bands, interobserver agreement, and design biases in diagnostic accuracy
      studies. Of the 1,185 findings, 309 come from the group's own research, verified against the
      abstract of each PMID and published with complete figures; the remaining 876 act as a locator
      index into the reference work. Bilingual (es/en).
"""
if "propedeutica-basada-en-evidencia" in s:
    print("· en.yml: ya contenía el override, sin cambios")
else:
    m = re.search(r"^herramientas:\s*$", s, re.M)
    if not m:
        sys.exit("✗ en.yml: no se encontró la sección 'herramientas:'")
    fin = m.end() + 1
    s = s[:fin] + OV + s[fin:]
    p.write_text(s, encoding="utf-8")
    cambios.append("data/i18n/en.yml")

print("✓ archivos modificados:", ", ".join(cambios) if cambios else "ninguno")
