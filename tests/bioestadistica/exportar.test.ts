/**
 * Estado en la URL y formatos de salida (CSV y Markdown).
 *
 *   node --test tests/bioestadistica/exportar.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TOPE_URL,
  aCSV,
  aMarkdown,
  codificarEstado,
  decodificarEstado,
  hayEstado,
} from '../../src/lib/bioestadistica/nucleo/exportar.ts';
import type { EntradaDef, Entradas } from '../../src/lib/bioestadistica/nucleo/tipos.ts';

/** Entradas de `ic-proporcion`, más una derivada y una columna para los casos generales. */
const defs: EntradaDef[] = [
  { id: 'x', tipo: 'entero', min: 0, requerido: true, derivado: false },
  { id: 'n', tipo: 'entero', min: 1, requerido: true, derivado: false },
  { id: 'nivel', tipo: 'proporcion', min: 0.8, max: 0.999, requerido: false, derivado: false },
  { id: 'total', tipo: 'entero', requerido: false, derivado: true },
];

const conColumna: EntradaDef[] = [
  ...defs,
  { id: 'datos', tipo: 'columna', requerido: false, derivado: false },
  { id: 'cola', tipo: 'opcion', opciones: ['dos', 'una'], requerido: false, derivado: false },
  { id: 'corr', tipo: 'decimal', opciones: ['0', '0.5'], requerido: true, derivado: false },
];

// ---------------------------------------------------------------------------
// codificarEstado / decodificarEstado
// ---------------------------------------------------------------------------

test('el estado viaja con los identificadores del YAML y el nivel como proporción', () => {
  assert.equal(codificarEstado({ x: 68, n: 80, nivel: 0.95 }, defs), 'x=68&n=80&nivel=0.95');
});

test('las entradas derivadas no se escriben: se recalculan al leer', () => {
  assert.equal(codificarEstado({ x: 68, n: 80, total: 80 }, defs), 'x=68&n=80');
});

test('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
  const entradas: Entradas = { x: 68, n: 80, nivel: 0.95 };
  assert.deepEqual(decodificarEstado(codificarEstado(entradas, defs), defs), entradas);
  const conDatos: Entradas = { x: 3, n: 7, datos: [1, 2.5, -3], cola: 'una' };
  assert.deepEqual(decodificarEstado(codificarEstado(conDatos, conColumna), conColumna), conDatos);
});

test('se lee igual con «?» delante y con los parámetros en otro orden', () => {
  assert.deepEqual(decodificarEstado('?n=80&x=68', defs), { x: 68, n: 80 });
  assert.deepEqual(decodificarEstado('n=80&x=68', defs), { x: 68, n: 80 });
});

test('los parámetros desconocidos o mal formados se ignoran sin romper la página', () => {
  assert.deepEqual(decodificarEstado('?x=68&n=abc&utm_source=x&nivel=', defs), { x: 68 });
  assert.deepEqual(decodificarEstado('?total=99', defs), {});
  assert.deepEqual(decodificarEstado('?cola=tres', conColumna), {});
  // Un selector numérico solo admite sus opciones: «3» no entra, «0.5» sí (como número).
  assert.deepEqual(decodificarEstado('?corr=3', conColumna), {});
  assert.deepEqual(decodificarEstado('?corr=0.5', conColumna), { corr: 0.5 });
  assert.deepEqual(decodificarEstado('', defs), {});
});

test('un nivel escrito como porcentaje en la URL se entiende como proporción', () => {
  assert.deepEqual(decodificarEstado('?nivel=99', defs), { nivel: 0.99 });
});

test('una columna con algún valor ilegible conserva los válidos', () => {
  assert.deepEqual(decodificarEstado('?datos=1;2;;abc;4', conColumna), { datos: [1, 2, 4] });
});

test('las columnas se omiten si el enlace se pasa del tope de longitud', () => {
  const larga = Array.from({ length: 900 }, (_, i) => i + 0.5);
  const s = codificarEstado({ x: 1, n: 2, datos: larga }, conColumna);
  assert.ok(s.length <= TOPE_URL, `el enlace mide ${s.length}`);
  assert.equal(s, 'x=1&n=2');
  // Una columna corta sí cabe.
  assert.match(codificarEstado({ x: 1, n: 2, datos: [1, 2, 3] }, conColumna), /datos=1%3B2%3B3/);
});

test('hayEstado distingue una URL con datos de una sin ellos', () => {
  assert.equal(hayEstado('?x=68&n=80', defs), true);
  assert.equal(hayEstado('?ejemplo=1', defs), false);
  assert.equal(hayEstado('', defs), false);
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

test('el CSV lleva BOM, coma y CRLF para que Excel lo abra sin asistente', () => {
  const csv = aCSV([
    ['Medida', 'Estimación', 'IC'],
    ['Wilson (score)', '85.0 %', '75.6 % a 91.2 %'],
  ]);
  assert.ok(csv.startsWith('﻿'), 'falta el BOM de UTF-8');
  assert.equal(csv.slice(1), 'Medida,Estimación,IC\r\nWilson (score),85.0 %,75.6 % a 91.2 %');
});

test('el CSV entrecomilla solo lo que lo necesita y duplica las comillas', () => {
  const csv = aCSV([['a,b', 'dijo "hola"', 'salto\nde línea', ' con espacio ', 'simple']]);
  assert.equal(csv.slice(1), '"a,b","dijo ""hola""","salto\nde línea"," con espacio ",simple');
});

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const ui: Record<string, string> = {
  entradas: 'Entradas',
  resultados: 'Resultados',
  interpretacion: 'Interpretación',
  metodos: 'Métodos para manuscrito',
  codigo_r: 'Código R',
  url_estado: 'Enlace con estos datos',
  generado_por: 'Generado con Bioestadística abierta',
  medida: 'Medida',
  estimacion: 'Estimación',
  ic: 'IC',
};

const md = aMarkdown({
  titulo: 'IC de una proporción',
  url: 'https://udgca1190.com.mx/herramientas/bioestadistica/ic-proporcion/?x=68&n=80',
  entradas: [
    ['Casos con la característica (x)', '68'],
    ['Total de observaciones (n)', '80'],
  ],
  resumen: [
    ['Proporción observada', '85.0 %', ''],
    ['Wilson (score)', '85.0 %', '75.6 % a 91.2 %'],
  ],
  interpretacion: ['68 de 80 observaciones presentan la característica: 85.0 %.', 'Los métodos coinciden.'],
  metodos: 'El intervalo de confianza al 95 % se calculó con el método de Wilson [1,4].',
  codigoR: 'x <- 68; n <- 80\ncat(toJSON(res))\n',
  ui,
  cita: 'Briseño-Ramírez J, De Arcos-Jiménez JC. IC de una proporción…',
});

test('el Markdown trae todas las secciones, en orden', () => {
  const orden = [
    '# IC de una proporción',
    '## Entradas',
    '## Resultados',
    '## Interpretación',
    '## Métodos para manuscrito',
    '## Código R',
    '## Enlace con estos datos',
  ];
  let desde = 0;
  for (const seccion of orden) {
    const i = md.indexOf(seccion, desde);
    assert.ok(i >= 0, `falta la sección «${seccion}»`);
    desde = i;
  }
});

test('la tabla de resultados tiene encabezado y una fila por medida', () => {
  assert.ok(md.includes('| Medida | Estimación | IC |'));
  assert.ok(md.includes('| --- | --- | --- |'));
  assert.ok(md.includes('| Wilson (score) | 85.0 % | 75.6 % a 91.2 % |'));
});

test('las entradas van como lista de rótulo y valor', () => {
  assert.ok(md.includes('- **Casos con la característica (x):** 68'));
});

test('el código R va en un bloque cercado de R y el enlace entre ángulos', () => {
  assert.ok(md.includes('```r\nx <- 68; n <- 80\ncat(toJSON(res))\n```'));
  assert.ok(md.includes('<https://udgca1190.com.mx/herramientas/bioestadistica/ic-proporcion/?x=68&n=80>'));
});

test('el pie lleva la cita y el crédito', () => {
  assert.ok(md.includes('Briseño-Ramírez J, De Arcos-Jiménez JC.'));
  assert.ok(md.trimEnd().endsWith('Generado con Bioestadística abierta'));
});

test('una barra vertical en un rótulo no parte la tabla', () => {
  const conBarra = aMarkdown({
    titulo: 'T',
    url: 'https://example.org/',
    entradas: [],
    resumen: [['a | b', '1', '']],
    interpretacion: [],
    metodos: '',
    codigoR: '',
    ui,
    cita: '',
  });
  assert.ok(conBarra.includes('| a \\| b | 1 |  |'));
});

test('el CSV neutraliza fórmulas de hoja de cálculo sin tocar los valores formateados', () => {
  const csv = aCSV([['=1+1', '+SUM(A1)', '-2+3', '@foo', '\tx', '-2.9 % a 19.0 %', '−2.9 % a 19.0 %', '85.0 %', '-0.5']]);
  const fila = csv.replace(/^﻿/, '').split(',');
  assert.deepEqual(fila.slice(0, 5), ["'=1+1", "'+SUM(A1)", "'-2+3", "'@foo", "'\tx"]);
  // Un intervalo o un número negativo formateados por la calculadora no son fórmulas.
  assert.deepEqual(fila.slice(5), ['-2.9 % a 19.0 %', '−2.9 % a 19.0 %', '85.0 %', '-0.5']);
});
