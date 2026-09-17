/**
 * Cadenas de interfaz de «Bioestadística abierta» en `src/i18n.mjs`: las claves
 * `bio.*` y `tools.bio.*` deben existir en las DOS tablas (`es` y `en`).
 *
 * `t()` no sirve por sí solo para detectar una clave que falta en inglés: cuando
 * la tabla `en` no la trae, devuelve la cadena española (respaldo deliberado).
 * Por eso la paridad se comprueba sobre el texto del archivo, tabla por tabla, y
 * `t()` solo confirma que la clave existe en alguna de las dos.
 *
 *   node --test tests/bioestadistica/i18n.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { t, tPrefijo } from '../../src/i18n.mjs';

/** Raíz del repositorio (este archivo vive en `tests/bioestadistica/`). */
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

// `src/i18n.mjs` lee `data/sitio.yml` con `process.cwd()`; así la prueba corre
// desde cualquier directorio. Cada archivo de prueba tiene su propio proceso.
process.chdir(RAIZ);

/**
 * Borde con `src/i18n.mjs`: es JavaScript sin declaraciones de tipos propias
 * (el proyecto lo admite con `allowJs`), así que su firma se acota aquí una sola
 * vez en vez de dejar `any` suelto por la prueba.
 */
const traducir: (lang: string, clave: string, vars?: Record<string, string | number>) => string = t;
// `tPrefijo` construye su objeto vacío en JavaScript y TypeScript infiere `{}`;
// la aserción le pone la forma con la que viaja al navegador.
const conPrefijo = tPrefijo as (lang: string, prefijo: string) => Record<string, string>;

const RUTA = `${RAIZ}src/i18n.mjs`;
const TEXTO = readFileSync(RUTA, 'utf8');

/** ¿La clave pertenece a la sección de Bioestadística abierta? */
const esBio = (k: string): boolean => k.startsWith('bio.') || k.startsWith('tools.bio.');

/** Claves de una tabla del diccionario, en orden de aparición y con repeticiones. */
function clavesDe(bloque: string): string[] {
  return [...bloque.matchAll(/^ {4}'([^']+)':/gm)].map((m) => m[1] as string);
}

/** Corta `const UI = { es: {…}, en: {…} }` en sus dos tablas. */
function tablas(): { es: string[]; en: string[] } {
  const iEs = TEXTO.indexOf('\n  es: {\n');
  const iEn = TEXTO.indexOf('\n  en: {\n');
  const iFin = TEXTO.indexOf('\n};', iEn);
  assert.ok(iEs > -1 && iEn > iEs && iFin > iEn, 'src/i18n.mjs: no se reconoce la estructura de UI { es, en }');
  return { es: clavesDe(TEXTO.slice(iEs, iEn)), en: clavesDe(TEXTO.slice(iEn, iFin)) };
}

const TABLAS = tablas();
const BIO_ES = TABLAS.es.filter(esBio);
const BIO_EN = TABLAS.en.filter(esBio);

// ---------------------------------------------------------------------------
// Paridad entre las dos tablas
// ---------------------------------------------------------------------------

test('el diccionario tiene claves bio.* y tools.bio.* en las dos tablas', () => {
  assert.ok(BIO_ES.length > 0, 'ninguna clave bio.* en la tabla es');
  assert.ok(BIO_EN.length > 0, 'ninguna clave bio.* en la tabla en');
  assert.ok(
    BIO_ES.some((k) => k.startsWith('tools.bio.')) && BIO_EN.some((k) => k.startsWith('tools.bio.')),
    'faltan las claves tools.bio.* del índice de Herramientas',
  );
  assert.ok(
    BIO_ES.some((k) => k.startsWith('bio.ui.')) && BIO_EN.some((k) => k.startsWith('bio.ui.')),
    'faltan las claves bio.ui.* de la interfaz de calculadora',
  );
});

test('las tablas es y en traen exactamente las mismas claves de la sección', () => {
  const es = new Set(BIO_ES);
  const en = new Set(BIO_EN);
  const soloEs = [...es].filter((k) => !en.has(k)).sort();
  const soloEn = [...en].filter((k) => !es.has(k)).sort();
  assert.deepEqual(soloEs, [], `claves sin traducir al inglés en src/i18n.mjs: ${soloEs.join(', ')}`);
  assert.deepEqual(soloEn, [], `claves que solo existen en inglés en src/i18n.mjs: ${soloEn.join(', ')}`);
});

test('ninguna clave de la sección está definida dos veces en la misma tabla', () => {
  for (const [lang, claves] of [
    ['es', BIO_ES],
    ['en', BIO_EN],
  ] as const) {
    const vistas = new Set<string>();
    const repetidas: string[] = [];
    for (const k of claves) {
      if (vistas.has(k)) repetidas.push(k);
      vistas.add(k);
    }
    assert.deepEqual(repetidas, [], `tabla ${lang}: claves repetidas ${repetidas.join(', ')}`);
  }
});

// ---------------------------------------------------------------------------
// Resolución con t()
// ---------------------------------------------------------------------------

test('t() resuelve toda clave de la sección a un texto no vacío', () => {
  for (const lang of ['es', 'en'] as const) {
    for (const clave of new Set([...BIO_ES, ...BIO_EN])) {
      const valor = traducir(lang, clave);
      // `t` devuelve la propia clave cuando no existe en ninguna tabla.
      assert.notEqual(valor, clave, `t('${lang}', '${clave}') no encuentra la clave`);
      assert.ok(valor.trim().length > 0, `t('${lang}', '${clave}') está vacía`);
    }
  }
});

test('t() interpola las variables de la cadena', () => {
  assert.ok(traducir('es', 'bio.ui.err_min', { min: 0 }).includes('0'));
  assert.ok(!traducir('en', 'bio.ui.err_max', { max: 100 }).includes('{max}'));
  assert.equal(traducir('es', 'bio.ui.calculadoras_n', { n: 25 }), '25 calculadoras');
});

// ---------------------------------------------------------------------------
// tPrefijo: lo que viaja al navegador
// ---------------------------------------------------------------------------

test('tPrefijo(bio.ui.) entrega el mismo juego de claves en los dos idiomas', () => {
  const ui = { es: conPrefijo('es', 'bio.ui.'), en: conPrefijo('en', 'bio.ui.') };
  const clavesEs = Object.keys(ui.es).sort();
  const clavesEn = Object.keys(ui.en).sort();
  assert.ok(clavesEs.length > 0, 'tPrefijo devolvió un objeto vacío');
  assert.deepEqual(clavesEs, clavesEn);
  // El prefijo se retira y los valores son texto útil.
  for (const [clave, valor] of Object.entries(ui.es)) {
    assert.ok(!clave.startsWith('bio.ui.'), `tPrefijo no retiró el prefijo de ${clave}`);
    assert.ok(valor.trim().length > 0, `bio.ui.${clave} está vacía en español`);
    const valorEn = ui.en[clave];
    assert.ok(valorEn !== undefined && valorEn.trim().length > 0, `bio.ui.${clave} está vacía en inglés`);
  }
});

test('tPrefijo(bio.ui.) recoge todas las claves bio.ui.* del diccionario', () => {
  const esperadas = BIO_ES.filter((k) => k.startsWith('bio.ui.')).map((k) => k.slice('bio.ui.'.length));
  assert.deepEqual(Object.keys(conPrefijo('es', 'bio.ui.')).sort(), [...esperadas].sort());
});

// ---------------------------------------------------------------------------
// Cadenas con marcadores obligatorios
// ---------------------------------------------------------------------------

test('bio.cite_template trae los cuatro marcadores de la cita en ambos idiomas', () => {
  for (const lang of ['es', 'en'] as const) {
    const plantilla = traducir(lang, 'bio.cite_template');
    for (const marcador of ['{autores}', '{titulo}', '{anio}', '{url}']) {
      assert.ok(plantilla.includes(marcador), `bio.cite_template (${lang}) no incluye ${marcador}`);
    }
  }
});

test('los mensajes de error de rango llevan su marcador', () => {
  for (const lang of ['es', 'en'] as const) {
    assert.ok(traducir(lang, 'bio.ui.err_min').includes('{min}'), `bio.ui.err_min (${lang}) sin {min}`);
    assert.ok(traducir(lang, 'bio.ui.err_max').includes('{max}'), `bio.ui.err_max (${lang}) sin {max}`);
  }
});

test('las cadenas de comparación con R conservan sus marcadores', () => {
  for (const lang of ['es', 'en'] as const) {
    const coincide = traducir(lang, 'bio.ui.r_coincide');
    assert.ok(coincide.includes('{k}') && coincide.includes('{m}'), `bio.ui.r_coincide (${lang})`);
    const difiere = traducir(lang, 'bio.ui.r_difiere');
    assert.ok(
      difiere.includes('{campo}') && difiere.includes('{ts}') && difiere.includes('{r}'),
      `bio.ui.r_difiere (${lang})`,
    );
  }
});

test('tools.bio.* está completo en los dos idiomas', () => {
  for (const lang of ['es', 'en'] as const) {
    for (const clave of ['tools.bio.kicker', 'tools.bio.title', 'tools.bio.intro', 'tools.bio.index']) {
      const valor = traducir(lang, clave);
      assert.notEqual(valor, clave, `falta ${clave} en ${lang}`);
      assert.ok(valor.trim().length > 0);
    }
  }
});

test('cada grupo de calculadoras tiene nombre y descripción en ambos idiomas', () => {
  for (const grupo of ['diagnostico', 'asociacion', 'muestra', 'acuerdo', 'modelos']) {
    for (const lang of ['es', 'en'] as const) {
      for (const clave of [`bio.grupo.${grupo}`, `bio.grupo_desc.${grupo}`]) {
        assert.notEqual(traducir(lang, clave), clave, `falta ${clave} en ${lang}`);
      }
    }
  }
});
