/**
 * Construye data/i18n/en.yml a partir de la salida del workflow de traducción.
 * Uso: node scripts/build_en_i18n.mjs <ruta-al-json-del-workflow>
 * Las claves de campo coinciden con las del español (titulo, resumen, bio_corta…)
 * para que src/i18n.mjs → localize() las fusione cuando lang === 'en'.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) { console.error('Falta la ruta al JSON del workflow.'); process.exit(1); }

const R = JSON.parse(readFileSync(src, 'utf8')).result;

const integrantes = {};
for (const m of R.members.members) {
  integrantes[m.id] = { grado: m.grado_en, institucion: m.institucion_en, bio_corta: m.bio_corta_en };
}
const lineas = {};
for (const l of R.lines.lineas) {
  lineas[l.id] = {
    titulo: l.titulo_en,
    titulo_corto: l.titulo_corto_en,
    resumen: l.resumen_en,
    especificas: l.especificas.map((e) => ({ id: e.id, titulo: e.titulo_en })),
  };
}
const herramientas = {};
for (const h of R.tools.herramientas) {
  herramientas[h.id] = { nombre: h.nombre_en, resumen: h.resumen_en, descripcion: h.descripcion_en };
}
const actividades = {};
for (const a of R.misc.actividades) {
  actividades[a.id] = { titulo: a.titulo_en, descripcion: a.descripcion_en };
}
const sitio = {
  nombre: R.misc.nombre_en,
  adscripcion: R.misc.adscripcion_en,
  mision: R.misc.mision_en,
  contacto: { ciudad: R.misc.ciudad_en },
  kpis: R.misc.kpis.map((k) => ({ num: k.num, label: k.label_en })),
  page_intros: R.misc.page_intros,
};

const obj = { sitio, integrantes, lineas, herramientas, actividades };
const header =
  '# Traducciones al INGLÉS del contenido del sitio (overrides de data/*.yml).\n' +
  '# Generado por scripts/build_en_i18n.mjs (traducción + revisión por editor nativo).\n' +
  '# Mismas claves de campo que el español; src/i18n.mjs → localize() las fusiona cuando lang === "en".\n' +
  '# Para ajustar el inglés, edita aquí; el español se edita en los data/*.yml originales.\n\n';

mkdirSync(join(ROOT, 'data/i18n'), { recursive: true });
writeFileSync(
  join(ROOT, 'data/i18n/en.yml'),
  header + yaml.dump(obj, { lineWidth: 110, quotingType: '"', forceQuotes: false, noRefs: true }),
  'utf8',
);
console.log('Escrito data/i18n/en.yml');
