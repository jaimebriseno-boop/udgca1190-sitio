/**
 * Gráficas en SVG: escalas, ejes y bosque de intervalos.
 *
 *   node --test tests/bioestadistica/svg.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { crearFormateador } from '../../src/lib/bioestadistica/nucleo/formato.ts';
import {
  ANCHO_POR_DEFECTO,
  crearEscala,
  envolver,
  esc,
  pasoNice,
  renderGrafica,
  ticks,
  ticksLineales,
  ticksLog,
} from '../../src/lib/bioestadistica/nucleo/svg.ts';
import type { DatosGrafica } from '../../src/lib/bioestadistica/nucleo/tipos.ts';

const fmt = crearFormateador('es');

/** Gráfica de referencia: los seis métodos de `ic-proporcion` con 68/80. */
function grafica(extra: Partial<DatosGrafica> = {}): DatosGrafica {
  return {
    tipo: 'ic-forest',
    titulo: 'Intervalo de confianza de la proporción según el método',
    resumen: 'Proporción observada: 85.0 % (Wilson: 75.6 % a 91.2 %)',
    filas: [
      { id: 'wilson', etiqueta: 'Wilson (score)', valor: 0.85, lo: 0.756, hi: 0.912, destacada: true },
      { id: 'wilson_cc', etiqueta: 'Wilson con corrección', valor: 0.85, lo: 0.748, hi: 0.917 },
      { id: 'clopper_pearson', etiqueta: 'Clopper-Pearson', valor: 0.85, lo: 0.752, hi: 0.918 },
      { id: 'agresti_coull', etiqueta: 'Agresti-Coull', valor: 0.85, lo: 0.754, hi: 0.914 },
      { id: 'jeffreys', etiqueta: 'Jeffreys', valor: 0.85, lo: 0.761, hi: 0.913 },
      { id: 'wald', etiqueta: 'Wald (asintótico)', valor: 0.85, lo: 0.772, hi: 0.928 },
    ],
    dominio: [0, 1],
    escala: 'lineal',
    pista: 'pct0',
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Escalas y ejes
// ---------------------------------------------------------------------------

test('la escala lineal mapea el dominio sobre el rango', () => {
  const e = crearEscala([0, 1], [100, 300]);
  assert.equal(e.mapear(0), 100);
  assert.equal(e.mapear(1), 300);
  assert.equal(e.mapear(0.5), 200);
  // Fuera del dominio no se recorta: un Wald negativo tiene que verse.
  assert.equal(e.mapear(-0.1), 80);
});

test('la escala logarítmica reparte las décadas por igual', () => {
  const e = crearEscala([0.1, 100], [0, 300], 'log');
  assert.equal(e.mapear(0.1), 0);
  assert.equal(e.mapear(1), 100);
  assert.equal(e.mapear(10), 200);
  assert.equal(e.mapear(100), 300);
  assert.throws(() => crearEscala([0, 10], [0, 1], 'log'), RangeError);
});

test('pasoNice elige 1, 2, 2.5 o 5 por década', () => {
  assert.equal(pasoNice(1, 5), 0.2);
  assert.equal(pasoNice(10, 5), 2);
  assert.equal(pasoNice(100, 4), 25);
  assert.equal(pasoNice(0.05, 5), 0.01);
});

test('las marcas lineales caen dentro del dominio y sin ruido de coma flotante', () => {
  assert.deepEqual(ticksLineales(0, 1, 4), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(ticksLineales(0.1, 0.5, 4), [0.1, 0.2, 0.3, 0.4, 0.5]);
  for (const v of ticksLineales(-0.02, 1, 5)) assert.ok(v >= -0.02 && v <= 1);
});

test('las marcas logarítmicas son décadas', () => {
  assert.deepEqual(ticksLog(1, 1000), [1, 10, 100, 1000]);
  assert.deepEqual(ticks([0.1, 10], 'log'), [0.1, 0.2, 0.5, 1, 2, 5, 10]);
});

// ---------------------------------------------------------------------------
// Escape
// ---------------------------------------------------------------------------

test('esc neutraliza los caracteres que romperían el SVG', () => {
  assert.equal(esc('a < b & c > d "e"'), 'a &lt; b &amp; c &gt; d &quot;e&quot;');
});

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

test('envolver parte por espacios y respeta el máximo de líneas', () => {
  assert.deepEqual(envolver('Jeffreys', 24), ['Jeffreys']);
  assert.deepEqual(envolver('Clopper-Pearson (exacto)', 24), ['Clopper-Pearson (exacto)']);
  assert.deepEqual(envolver('Wilson con corrección de continuidad', 24), [
    'Wilson con corrección de',
    'continuidad',
  ]);
  // Lo que no cabe en dos líneas se acumula en la última: recortar el nombre de
  // un método sería peor que dejarlo asomar.
  assert.equal(envolver('a b c d e f g h i j k l m n', 6).length, 2);
});

// ---------------------------------------------------------------------------
// ic-forest
// ---------------------------------------------------------------------------

test('el SVG lleva título y descripción accesibles referenciados por aria-labelledby', () => {
  const svg = renderGrafica(grafica(), { fmt });
  assert.match(svg, /<svg class="bio-svg" role="img" aria-labelledby="bio-grafica-t bio-grafica-d"/);
  assert.match(svg, /<title id="bio-grafica-t">Intervalo de confianza de la proporción según el método<\/title>/);
  assert.match(svg, /<desc id="bio-grafica-d">Proporción observada: 85\.0 % \(Wilson: 75\.6 % a 91\.2 %\)<\/desc>/);
  assert.match(svg, new RegExp(`viewBox="0 0 ${ANCHO_POR_DEFECTO} \\d+(\\.\\d+)?"`));
});

test('hay una fila por método, con su punto y su barra de intervalo', () => {
  const svg = renderGrafica(grafica(), { fmt });
  assert.equal(svg.match(/class="bio-svg__fila/g)?.length, 6);
  assert.equal(svg.match(/class="bio-svg__punto"/g)?.length, 6);
  assert.equal(svg.match(/class="bio-svg__ic"/g)?.length, 6);
  assert.equal(svg.match(/class="bio-svg__etiqueta"/g)?.length, 6);
  // Cada rótulo se dibuja con `tspan`, que es lo que permite partirlo en dos
  // líneas cuando no cabe en la columna.
  assert.equal(svg.match(/<tspan x="/g)?.length, 6);
  // Solo Wilson va destacada.
  assert.equal(svg.match(/class="bio-svg__fila is-destacada"/g)?.length, 1);
});

test('una fila sin intervalo dibuja el punto pero no la barra', () => {
  const svg = renderGrafica(
    grafica({ filas: [{ id: 'p', etiqueta: 'Proporción', valor: 0.85 }] }),
    { fmt },
  );
  assert.equal(svg.match(/class="bio-svg__punto"/g)?.length, 1);
  assert.equal(svg.match(/class="bio-svg__ic"/g), null);
});

test('el eje rotula con la pista de formato de la calculadora', () => {
  const svg = renderGrafica(grafica(), { fmt });
  // El porcentaje en español lleva espacio fino U+202F: se compara contra el
  // formateador, no contra un literal escrito a mano.
  for (const v of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const etiqueta = fmt.num(v, 'pct0');
    assert.ok(svg.includes(`>${etiqueta}</text>`), `falta la marca ${etiqueta}`);
  }
  assert.ok(fmt.num(1, 'pct0').includes('100'));
});

test('el dominio se amplía cuando un intervalo se sale de [0, 1]', () => {
  const conWald = grafica({
    filas: [{ id: 'wald', etiqueta: 'Wald', valor: 0.97, lo: 0.93, hi: 1.02 }],
  });
  const svg = renderGrafica(conWald, { fmt, ancho: 600 });
  // El extremo superior (1.02) se dibuja dentro del lienzo, no recortado en el borde.
  const x = Number(/class="bio-svg__ic" x1="[\d.]+" y1="[\d.]+" x2="([\d.]+)"/.exec(svg)?.[1]);
  assert.ok(x <= 600 - 20 + 1e-9, `el extremo quedó fuera del área de trazado: ${x}`);
  assert.ok(x > 300, 'el extremo superior debería quedar a la derecha del lienzo');
});

test('la línea de referencia se dibuja solo cuando la calculadora la declara', () => {
  assert.equal(renderGrafica(grafica(), { fmt }).match(/class="bio-svg__ref"/g), null);
  const conRef = renderGrafica(grafica({ referencia: 0.5 }), { fmt });
  assert.equal(conRef.match(/class="bio-svg__ref"/g)?.length, 1);
});

test('el texto del contenido se escapa', () => {
  const svg = renderGrafica(
    grafica({
      titulo: 'IC <script>alert(1)</script>',
      resumen: 'a & b',
      filas: [{ id: 'x', etiqueta: 'p < 0.05', valor: 0.5, lo: 0.4, hi: 0.6 }],
    }),
    { fmt },
  );
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('IC &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(svg.includes('p &lt; 0.05'));
  assert.ok(svg.includes('a &amp; b'));
});

test('el prefijo de los identificadores es configurable para dos gráficas en una página', () => {
  const svg = renderGrafica(grafica(), { fmt, id: 'g2' });
  assert.match(svg, /aria-labelledby="g2-t g2-d"/);
  assert.match(svg, /<title id="g2-t">/);
});

test('un tipo de gráfica no implementado se detiene con un mensaje claro', () => {
  const falsa = { ...grafica(), tipo: 'fagan' } as unknown as DatosGrafica;
  assert.throws(() => renderGrafica(falsa, { fmt }), /fagan/);
});
