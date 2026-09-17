/**
 * Columna pegada: texto copiado de una hoja de cálculo → lista de números.
 *
 * Los casos de esta prueba son pegados reales: Excel (con `\r\n` y comillas en
 * las celdas), Google Sheets (con `\n`), una fila horizontal separada por
 * comas, una tabla de dos columnas y una columna con huecos.
 *
 *   node --test tests/bioestadistica/pegado.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { crearFormateador } from '../../src/lib/bioestadistica/nucleo/formato.ts';
import { codificarEstado, decodificarEstado } from '../../src/lib/bioestadistica/nucleo/exportar.ts';
import { parsearPegado, resumenPegado } from '../../src/lib/bioestadistica/nucleo/pegado.ts';
import type { EntradaDef, Entradas } from '../../src/lib/bioestadistica/nucleo/tipos.ts';

// `src/i18n.mjs` lee `data/sitio.yml` con `process.cwd()`: la última prueba de
// este archivo usa el diccionario real y necesita la raíz del repositorio.
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));

const fmt = crearFormateador('es');

// ---------------------------------------------------------------------------
// Pegados de hoja de cálculo
// ---------------------------------------------------------------------------

test('Excel: una columna con fin de línea \\r\\n', () => {
  const r = parsearPegado('150\r\n160\r\n172\r\n');
  assert.deepEqual(r.valores, [150, 160, 172]);
  assert.equal(r.faltantes, 0);
  assert.deepEqual(r.ignorados, []);
  assert.equal(r.encabezado, undefined);
  assert.equal(r.variasColumnas, false);
});

test('Google Sheets: una columna con fin de línea \\n', () => {
  const r = parsearPegado('12.5\n13.1\n11.8\n');
  assert.deepEqual(r.valores, [12.5, 13.1, 11.8]);
  assert.equal(r.variasColumnas, false);
});

test('un pegado con retorno de carro solo (\\r) se lee igual', () => {
  assert.deepEqual(parsearPegado('1\r2\r3').valores, [1, 2, 3]);
});

// ---------------------------------------------------------------------------
// Separadores
// ---------------------------------------------------------------------------

test('una sola línea con separador es una serie horizontal, no varias columnas', () => {
  for (const texto of ['1, 2, 3', '1;2;3', '1\t2\t3']) {
    const r = parsearPegado(texto);
    assert.deepEqual(r.valores, [1, 2, 3], `texto: ${JSON.stringify(texto)}`);
    assert.equal(r.variasColumnas, false, `texto: ${JSON.stringify(texto)}`);
  }
});

test('un separador final no inventa un dato faltante', () => {
  const r = parsearPegado('1;2;3;');
  assert.deepEqual(r.valores, [1, 2, 3]);
  assert.equal(r.faltantes, 0);
});

test('si todas las comas son decimales, la coma no es separador', () => {
  const r = parsearPegado('1,5\n2,5');
  assert.deepEqual(r.valores, [1.5, 2.5]);
  assert.equal(r.variasColumnas, false);
});

test('con «;» de separador, la coma sigue siendo decimal', () => {
  const r = parsearPegado('1,5; 2,5');
  assert.deepEqual(r.valores, [1.5, 2.5]);
  assert.equal(r.variasColumnas, false);
});

test('una coma que no es decimal sí separa («1,2,3»)', () => {
  assert.deepEqual(parsearPegado('1,2,3').valores, [1, 2, 3]);
});

test('el tabulador manda sobre «;» y «;» sobre la coma', () => {
  assert.deepEqual(parsearPegado('1\t2;3,4\n5\t6;7,8').valores, [1, 5]);
  assert.deepEqual(parsearPegado('1;2,3\n4;5,6').valores, [1, 4]);
});

test('dos columnas separadas por tabulador: se usa la primera y se avisa', () => {
  const r = parsearPegado('150\t7.2\n160\t7.4\n172\t6.9');
  assert.deepEqual(r.valores, [150, 160, 172]);
  assert.equal(r.variasColumnas, true);
  assert.deepEqual(r.ignorados, []);
});

test('un tabulador suelto al final de la línea no es una segunda columna', () => {
  const r = parsearPegado('150\t\n160\t');
  assert.deepEqual(r.valores, [150, 160]);
  assert.equal(r.variasColumnas, false);
});

// ---------------------------------------------------------------------------
// Encabezado
// ---------------------------------------------------------------------------

test('la primera celda con texto es el encabezado de la columna', () => {
  const r = parsearPegado('plaquetas\n150\n160');
  assert.equal(r.encabezado, 'plaquetas');
  assert.deepEqual(r.valores, [150, 160]);
  assert.deepEqual(r.ignorados, []);
});

test('encabezado de una tabla con varias columnas', () => {
  const r = parsearPegado('edad\tsexo\n34\tM\n41\tF');
  assert.equal(r.encabezado, 'edad');
  assert.deepEqual(r.valores, [34, 41]);
  assert.deepEqual(r.ignorados, []);
  assert.equal(r.variasColumnas, true);
});

test('un pegado horizontal también puede traer su encabezado', () => {
  const r = parsearPegado('edad, 34, 41');
  assert.equal(r.encabezado, 'edad');
  assert.deepEqual(r.valores, [34, 41]);
});

test('sin texto inicial no hay encabezado', () => {
  assert.equal(parsearPegado('34\n41').encabezado, undefined);
});

// ---------------------------------------------------------------------------
// Faltantes y texto omitido
// ---------------------------------------------------------------------------

test('los marcadores de faltante se cuentan y no son texto omitido', () => {
  const r = parsearPegado('150\nNA\n\n.\n#N/A\n-\n160');
  assert.deepEqual(r.valores, [150, 160]);
  assert.equal(r.faltantes, 5);
  assert.deepEqual(r.ignorados, []);
});

test('los faltantes no distinguen mayúsculas y admiten sus variantes', () => {
  const r = parsearPegado('1\nna\nNaN\nnull\nNULL\nN/A\n—\n2');
  assert.deepEqual(r.valores, [1, 2]);
  assert.equal(r.faltantes, 6);
});

test('el texto que no es número ni faltante se omite y se conserva', () => {
  const r = parsearPegado('150\nabc\n12abc\n160');
  assert.deepEqual(r.valores, [150, 160]);
  assert.deepEqual(r.ignorados, ['abc', '12abc']);
  assert.equal(r.encabezado, undefined);
});

test('las líneas vacías de en medio son celdas vacías; las de los extremos, no', () => {
  const r = parsearPegado('\n\n150\n\n160\n\n\n');
  assert.deepEqual(r.valores, [150, 160]);
  assert.equal(r.faltantes, 1);
});

// ---------------------------------------------------------------------------
// Tolerancia de la captura (la misma que un campo suelto)
// ---------------------------------------------------------------------------

test('las celdas entrecomilladas por la hoja de cálculo pierden sus comillas', () => {
  const r = parsearPegado('"1,5"\n"2,5"\n"1 234"');
  assert.deepEqual(r.valores, [1.5, 2.5, 1234]);
  assert.deepEqual(r.ignorados, []);
});

test('espacios de miles y menos tipográfico', () => {
  const r = parsearPegado('1 234\n1 234\n1 234\n−5');
  assert.deepEqual(r.valores, [1234, 1234, 1234, -5]);
});

test('notación científica y decimales con punto', () => {
  assert.deepEqual(parsearPegado('1e3\n.5\n-3.25').valores, [1000, 0.5, -3.25]);
});

test('un texto vacío o en blanco devuelve todo en cero', () => {
  for (const texto of ['', '   ', '\n\n', '\r\n']) {
    const r = parsearPegado(texto);
    assert.deepEqual(r.valores, [], `texto: ${JSON.stringify(texto)}`);
    assert.equal(r.faltantes, 0);
    assert.deepEqual(r.ignorados, []);
    assert.equal(r.encabezado, undefined);
    assert.equal(r.variasColumnas, false);
  }
});

test('un pegado sin ningún número no lanza: devuelve la lista vacía', () => {
  const r = parsearPegado('lorem\nipsum\ndolor');
  assert.deepEqual(r.valores, []);
  assert.equal(r.encabezado, 'lorem');
  assert.deepEqual(r.ignorados, ['ipsum', 'dolor']);
});

// ---------------------------------------------------------------------------
// resumenPegado
// ---------------------------------------------------------------------------

const UI_ES: Record<string, string> = {
  pegado_n: '{n} valores leídos',
  pegado_faltantes: '{k} faltantes omitidos',
  pegado_ignorados: '{k} no numéricos omitidos ({lista})',
  pegado_encabezado: 'encabezado «{h}» omitido',
  pegado_varias_columnas: 'varias columnas: se usó la primera',
};

const UI_EN: Record<string, string> = {
  pegado_n: '{n} values read',
  pegado_faltantes: '{k} missing skipped',
  pegado_ignorados: '{k} non-numeric skipped ({lista})',
  pegado_encabezado: 'header “{h}” skipped',
  pegado_varias_columnas: 'several columns: the first one was used',
};

test('sin incidencias, el resumen es solo el número de valores', () => {
  const r = parsearPegado('1\n2\n3');
  assert.equal(resumenPegado(r, UI_ES, fmt), '3 valores leídos');
  assert.equal(resumenPegado(r, UI_EN, fmt), '3 values read');
});

test('el resumen enumera todas las incidencias, en orden', () => {
  const r = parsearPegado('plaquetas\tgrupo\n150\tA\nNA\tB\nabc\tC\n160\tD');
  assert.equal(
    resumenPegado(r, UI_ES, fmt),
    '2 valores leídos · 1 faltantes omitidos · 1 no numéricos omitidos ("abc") · encabezado «plaquetas» omitido · varias columnas: se usó la primera',
  );
  assert.equal(
    resumenPegado(r, UI_EN, fmt),
    '2 values read · 1 missing skipped · 1 non-numeric skipped ("abc") · header “plaquetas” skipped · several columns: the first one was used',
  );
});

test('el resumen cuenta todos los textos omitidos y muestra como mucho tres', () => {
  const r = parsearPegado('1\nabc\ndef\nghi\njkl\n2');
  assert.deepEqual(r.ignorados, ['abc', 'def', 'ghi', 'jkl']);
  assert.equal(resumenPegado(r, UI_ES, fmt), '2 valores leídos · 4 no numéricos omitidos ("abc", "def", "ghi", …)');
});

test('un texto largo se recorta para que el resumen quepa en una línea', () => {
  const r = parsearPegado('1\nabcdefghijklmnopqrstuvwxyz');
  assert.equal(resumenPegado(r, UI_ES, fmt), '1 valores leídos · 1 no numéricos omitidos ("abcdefghijk…")');
});

test('el resumen usa el formateador del idioma para el separador de miles', () => {
  const muchos = { valores: new Array<number>(1500).fill(1), faltantes: 0, ignorados: [], variasColumnas: false };
  assert.equal(resumenPegado(muchos, UI_ES, fmt), '1,500 valores leídos');
});

test('el resumen no se cae si falta una cadena del diccionario', () => {
  assert.equal(resumenPegado(parsearPegado('1'), {}, fmt), 'pegado_n');
});

// ---------------------------------------------------------------------------
// Ida y vuelta por la URL (exportar.ts ya codifica columnas con «;»)
// ---------------------------------------------------------------------------

test('lo que devuelve parsearPegado viaja íntegro en la URL y vuelve igual', () => {
  const defs: EntradaDef[] = [{ id: 'x', tipo: 'columna', min: 2, requerido: true, derivado: false }];
  const r = parsearPegado('plaquetas\n150\n1,5\nNA\n−5\n1 234');
  assert.deepEqual(r.valores, [150, 1.5, -5, 1234]);
  const entradas: Entradas = { x: r.valores };
  const consulta = codificarEstado(entradas, defs);
  assert.equal(consulta, 'x=150%3B1.5%3B-5%3B1234');
  assert.deepEqual(decodificarEstado(consulta, defs).x, r.valores);
});

test('una columna vacía no ocupa sitio en la URL', () => {
  const defs: EntradaDef[] = [{ id: 'x', tipo: 'columna', requerido: false, derivado: false }];
  assert.equal(codificarEstado({ x: parsearPegado('').valores }, defs), '');
});

// ---------------------------------------------------------------------------
// Contrato con el diccionario de interfaz
// ---------------------------------------------------------------------------

test('el diccionario real trae las cadenas del pegado con sus marcadores', async () => {
  const { tPrefijo } = await import('../../src/i18n.mjs');
  const conPrefijo = tPrefijo as (lang: string, prefijo: string) => Record<string, string>;
  const marcadores: Record<string, string[]> = {
    pegado_placeholder: [],
    pegado_n: ['{n}'],
    pegado_faltantes: ['{k}'],
    pegado_ignorados: ['{k}', '{lista}'],
    pegado_encabezado: ['{h}'],
    pegado_varias_columnas: [],
    err_sin_datos: [],
    err_n_min: ['{min}'],
  };
  for (const lang of ['es', 'en'] as const) {
    const ui = conPrefijo(lang, 'bio.ui.');
    for (const [clave, esperados] of Object.entries(marcadores)) {
      const valor = ui[clave];
      assert.ok(valor !== undefined && valor.trim() !== '', `falta bio.ui.${clave} en ${lang}`);
      for (const marcador of esperados) {
        assert.ok(valor.includes(marcador), `bio.ui.${clave} (${lang}) no incluye ${marcador}`);
      }
    }
    // Con el diccionario real, el resumen sigue siendo una sola línea.
    const resumen = resumenPegado(parsearPegado('plaquetas\n150\nNA\nabc\n160'), ui, crearFormateador(lang));
    assert.ok(!resumen.includes('{'), `quedan marcadores sin sustituir: ${resumen}`);
    assert.ok(!resumen.includes('\n'));
  }
});

// ---------------------------------------------------------------------------
// Espacios como separador y comas de miles (hallazgos de la revisión de H2)
// ---------------------------------------------------------------------------

test('los valores separados por espacios son valores, no un número concatenado', () => {
  // Antes «1 2 3» se leía como 123 sin aviso: `parsearNumero` quita los espacios de miles.
  assert.deepEqual(parsearPegado('150 160 170').valores, [150, 160, 170]);
  assert.deepEqual(parsearPegado('1.5 2.5  3.5').valores, [1.5, 2.5, 3.5]);
  assert.deepEqual(parsearPegado('1,5 2,5').valores, [1.5, 2.5]);
  // Una tabla de texto plano (un PDF) tiene varias columnas: la primera, con aviso.
  const tabla = parsearPegado('1 2 3\n4 5 6\n');
  assert.deepEqual(tabla.valores, [1, 4]);
  assert.equal(tabla.variasColumnas, true);
});

test('un solo espacio de miles sigue siendo un número; dos o más huecos, una serie', () => {
  assert.deepEqual(parsearPegado('1 234\n2 345').valores, [1234, 2345]);
  assert.deepEqual(parsearPegado('12 345,6').valores, [12345.6]);
  assert.deepEqual(parsearPegado('1\u202f234\n5\u00a0678').valores, [1234, 5678]);
  assert.deepEqual(parsearPegado('1 234 567').valores, [1, 234, 567]);
});

test('la coma de miles con punto decimal no se confunde con una columna', () => {
  // Antes «1,234.5» se leía como 1: la coma pasaba por separador de columnas.
  assert.deepEqual(parsearPegado('1,234.5\n2,345.6\n').valores, [1234.5, 2345.6]);
  assert.deepEqual(parsearPegado('12,345\n6,789').valores, [12.345, 6.789]);
  // «1, 2, 3» y «1,2,3» siguen siendo tres valores.
  assert.deepEqual(parsearPegado('1, 2, 3').valores, [1, 2, 3]);
  assert.deepEqual(parsearPegado('1,2,3').valores, [1, 2, 3]);
  // El convenio hispano (punto de miles, coma decimal) tampoco se parte en columnas.
  assert.deepEqual(parsearPegado('1.234,5\n2.345,6\n').valores, [1234.5, 2345.6]);
  assert.equal(parsearPegado('1.234,5\n2.345,6\n').variasColumnas, false);
});

