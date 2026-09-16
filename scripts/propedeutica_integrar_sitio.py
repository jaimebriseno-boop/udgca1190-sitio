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
    'pebm.note': 'La búsqueda admite signo, epónimo, condición o maniobra. Cada ficha conserva las métricas recuperadas y sus artículos de referencia.',
    'pebm.meta': 'Buscador de signos de exploración física con rendimiento diagnóstico y calculadora de probabilidad posprueba (CA UDG-CA-1190).',
    'pebm.sources_heading': 'Evidencia diagnóstica',
    'pebm.sources_status': '{n} hallazgos · {refs} con artículos identificados',
    'pebm.sources_own': 'Se muestran sensibilidad, especificidad, LR+ y LR− con sus intervalos o rangos cuando están disponibles. Las referencias corresponden a artículos de investigación o revisiones; las cifras recuperadas de una síntesis se identifican en la ficha. Los datos no recuperados permanecen vacíos.',
    'pebm.sources_index': 'Los VPP y VPN observados se distinguen de los escenarios calculados a probabilidades preprueba de 5 %, 20 % y 50 %. Las LR derivadas de sensibilidad y especificidad puntuales se declaran como cálculo. No se combinan extremos de rangos ni se infiere sensibilidad o especificidad a partir de LR agrupadas.',
    'pebm.cite_heading': 'Cómo citar',
    'pebm.cite_text': 'Cite el artículo que aparece en la ficha del hallazgo. Si hay varios artículos asociados a una síntesis, consulte la población y el umbral de cada estudio. Cuando no se identificó un artículo, la referencia se deja vacía. Herramienta del Cuerpo Académico UDG-CA-1190, Universidad de Guadalajara, Centro Universitario de Tlajomulco; 2026.',
"""

EN = """    // Tool: Evidence-based physical diagnosis
    'pebm.kicker': 'Teaching tool · Physical diagnosis',
    'pebm.title': 'Evidence-based physical diagnosis',
    'pebm.intro': 'A finder for physical examination signs with their measured diagnostic performance, a post-test probability calculator, and a critical-reading guide. Aimed at students, interns and residents.',
    'pebm.iframe_title': 'Interactive finder for physical examination signs',
    'pebm.fullscreen': 'Open full screen ↗',
    'pebm.note': 'Search by sign, eponym, target condition or maneuver. Each record preserves the recovered metrics and its reference articles.',
    'pebm.meta': 'A finder for physical examination signs with diagnostic performance and a post-test probability calculator (UDG-CA-1190 Research Group).',
    'pebm.sources_heading': 'Diagnostic evidence',
    'pebm.sources_status': '{n} findings · {refs} with identified articles',
    'pebm.sources_own': 'Sensitivity, specificity, LR+ and LR− are displayed with available intervals or ranges. References identify research articles or reviews; figures recovered from a synthesis are identified in the record. Unrecovered data remain blank.',
    'pebm.sources_index': 'Observed PPV and NPV are distinguished from calculations at pre-test probabilities of 5%, 20% and 50%. LRs derived from point sensitivity and specificity are labeled as calculations. Range endpoints are never combined, and sensitivity or specificity is not inferred from pooled LRs.',
    'pebm.cite_heading': 'How to cite',
    'pebm.cite_text': 'Cite the article shown in the finding record. When several articles contribute to a synthesis, consult each study population and threshold. If no article was identified, the reference is blank. Tool by Research Group UDG-CA-1190, University of Guadalajara, Centro Universitario de Tlajomulco; 2026.',
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
    Herramienta docente de exploración física con sensibilidad, especificidad,
    razones de verosimilitud, valores predictivos y artículos de referencia
    cuando se recuperaron. Incluye búsqueda por signo, epónimo, condición o
    maniobra, calculadora de probabilidad posprueba y guía de lectura crítica.
    Distingue valores observados de cálculos y conserva vacíos los datos no
    recuperados. Bilingüe (es/en).
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
      A teaching tool for physical examination findings with sensitivity, specificity,
      likelihood ratios, predictive values and reference articles when recovered.
      Includes search by sign, eponym, condition or maneuver, a post-test probability
      calculator and a critical-reading guide. Distinguishes observed values from
      calculations and leaves unrecovered data blank. Bilingual (es/en).
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
