# Progreso — herramienta «Diagnóstico microbiológico médico» (Microbiología I)

Actualizado: 2026-09-20. Estado: **publicada** (commit `329f8db`) en
<https://udgca1190.com.mx/herramientas/diagnostico-microbiologico> (y `/en/…`).

## Qué es

Material didáctico interactivo de Microbiología I (I8581), versión 2.1, de Judith
Carolina De Arcos Jiménez y Jaime Briseño Ramírez: 7 módulos, 48 secciones, simulador
de Gram, animación de Ziehl-Neelsen, juego «¿qué medio siembro?», árbol de decisión,
cuatro casos, autoevaluación y comprobante con código de verificación. Tarjeta de tipo
«docente» en la rejilla general de Herramientas, junto a VIROLOGÍA (Microbiología II).

## Dónde vive

- Origen (no se edita): Google Drive →
  `INVESTIGACIÓN/INVESTIGACIÓN J-J/Diagnostico_microbiologico_presentacion/`
  (`index.html`, `assets/`, `README.txt`, `registro_apps_script.gs`).
- Publicado: `public/herramientas/diagnostico-microbiologico/app/`, generado por
  `scripts/microbiologia_publicar.py`. No editar a mano: ante cambios de la autora,
  volver a ejecutar el script y hacer commit.
- Página: `src/components/pages/DiagnosticoMicrobiologicoPage.astro` (iframe de altura
  fija con desplazamiento interno), rutas es/en, claves `micro.*` en `src/i18n.mjs`,
  tarjeta en `data/herramientas.yml` y traducción en `data/i18n/en.yml`.

## Qué transforma el script

Fuentes locales (Petrona → Source Serif 4, IBM Plex Sans → Inter), retira la clave
docente en texto plano («Clave configurada: …»), `loading="lazy"` en las fotos salvo la
de portada, PNG opaco → JPEG (1.2 MB → 126 KB), cita con la URL canónica, enlace
«← Herramientas» en la barra superior y comentario de procedencia. Cada paso se
comprueba con `assert`.

## Decisiones

- La clave docente no debe volver al HTML público: con ella y la URL del Apps Script
  cualquiera descargaría el CSV con nombres, códigos y calificaciones del grupo.
- `ENVIO_URL` sigue vacío: el alumno entrega el comprobante en Classroom. El envío
  automático (Apps Script → hoja de cálculo) queda **en pausa por decisión del
  usuario** (2026-09-20). Para activarlo: desplegar `registro_apps_script.gs` como
  aplicación web, pasar la URL `/exec` y fijarla en el script de publicación. Al
  hacerlo conviene una línea de consentimiento en «Mi registro» y avisar al comité de
  ética, porque la hoja concentrará datos de varios semestres para comparar cohortes.

## Verificación

Build de 75 páginas; capturas con Chrome headless de la página, la tarjeta y la app en
escritorio y a 420 px (con un arnés de iframe, porque Chrome headless no baja de ~470 px
de ancho real). Publicado y comprobado en Vercel.

## Pendientes

- Defecto de origen sin corregir: en pantallas de menos de ~470 px la barra superior
  del material sobresale 52 px y el botón «Docente» queda fuera de pantalla. Corregir
  en el archivo de Drive (permitir que la barra envuelva u ocultar ese botón en móvil)
  y regenerar.
- Envío automático de comprobantes (ver Decisiones).
