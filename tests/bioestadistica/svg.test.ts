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
import type {
  DatosGrafica,
  FilaIC,
  GraficaBarras,
  GraficaCurvas,
  GraficaFagan,
  GraficaForest,
  GraficaHistogramaBoxplot,
} from '../../src/lib/bioestadistica/nucleo/tipos.ts';

const fmt = crearFormateador('es');

/** Gráfica de referencia: los seis métodos de `ic-proporcion` con 68/80. */
function grafica(extra: Partial<GraficaForest> = {}): GraficaForest {
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

// ---------------------------------------------------------------------------
// ic-forest con varios paneles
// ---------------------------------------------------------------------------

const LOG_FILAS: FilaIC[] = [
  { id: 'lr_pos', etiqueta: 'LR+', valor: 17, lo: 7.7, hi: 37.5 },
  { id: 'lr_neg', etiqueta: 'LR−', valor: 0.158, lo: 0.093, hi: 0.267 },
  { id: 'dor', etiqueta: 'DOR', valor: 108, lo: 39, hi: 296 },
];

/**
 * Caso real de `pruebas-diagnosticas`: proporciones en escala lineal arriba y
 * razones de verosimilitud en escala logarítmica abajo, con la referencia en 1.
 */
function forestDoble(filasLog: FilaIC[] = LOG_FILAS): GraficaForest {
  return {
    tipo: 'ic-forest',
    titulo: 'Rendimiento de la prueba diagnóstica',
    resumen: 'Sensibilidad 85.0 %, especificidad 95.0 %, LR+ 17.0',
    filas: [
      { id: 'sn', etiqueta: 'Sensibilidad', valor: 0.85, lo: 0.756, hi: 0.912, destacada: true },
      { id: 'sp', etiqueta: 'Especificidad', valor: 0.95, lo: 0.896, hi: 0.976 },
    ],
    dominio: [0, 1],
    escala: 'lineal',
    pista: 'pct0',
    paneles: [
      {
        rotulo: 'Razones de verosimilitud',
        filas: filasLog,
        escala: 'log',
        referencia: 1,
        pista: 'lr',
      },
    ],
  };
}

test('un panel secundario dibuja su propio eje, su referencia y su rótulo', () => {
  const svg = renderGrafica(forestDoble(), { fmt });
  // Un eje por panel; la referencia solo la declara el panel logarítmico.
  assert.equal(svg.match(/class="bio-svg__eje"/g)?.length, 2);
  assert.equal(svg.match(/class="bio-svg__ref"/g)?.length, 1);
  assert.match(svg, /class="bio-svg__panel-titulo"[^>]*>Razones de verosimilitud<\/text>/);
  assert.equal(svg.match(/class="bio-svg__punto"/g)?.length, 5);
  // Sin `rotulo` propio, el panel principal no lleva rótulo: el título de la
  // gráfica ya viaja en `<title>` y en el pie de la figura.
  assert.equal(svg.match(/class="bio-svg__panel-titulo"/g)?.length, 1);
  const conRotulo = renderGrafica({ ...forestDoble(), rotulo: 'Proporciones' }, { fmt });
  assert.equal(conRotulo.match(/class="bio-svg__panel-titulo"/g)?.length, 2);
  assert.match(conRotulo, /class="bio-svg__panel-titulo"[^>]*>Proporciones<\/text>/);
});

test('el eje logarítmico se ciñe a décadas y se rotula sin ruido de decimales', () => {
  const svg = renderGrafica(forestDoble(), { fmt });
  // Dominio efectivo [0.093, 296] → [0.01, 1000]: marcas en las décadas.
  for (const v of [0.01, 0.1, 1, 10, 100, 1000]) {
    assert.ok(svg.includes(`>${fmt.num(v, 'sig3')}</text>`), `falta la marca ${v}`);
  }
  // Con la pista `lr` la marca 1000 se leería «1,000.00».
  assert.ok(!svg.includes('1,000.00'));
});

test('una fila no finita o no positiva no rompe el panel logarítmico', () => {
  const filas = [
    { id: 'lr_pos', etiqueta: 'LR+', valor: 17, lo: 7.7, hi: 37.5 },
    { id: 'lr_neg', etiqueta: 'LR−', valor: 0 },
    { id: 'dor', etiqueta: 'DOR', valor: Infinity },
    { id: 'roto', etiqueta: 'Sin datos', valor: NaN },
  ];
  const svg = renderGrafica(forestDoble(filas), { fmt });
  // Dos proporciones + LR+: las otras tres filas no tienen punto que dibujar.
  assert.equal(svg.match(/class="bio-svg__punto"/g)?.length, 3);
  // Pero sí conservan su rótulo: la fila existe aunque su valor no se pueda situar.
  assert.ok(svg.includes('>DOR</tspan>'));
  assert.ok(svg.includes('>Sin datos</tspan>'));
});

test('un panel logarítmico sin ningún valor positivo cae en un dominio utilizable', () => {
  const sinDatos: GraficaForest = {
    ...forestDoble(),
    paneles: [{ rotulo: 'Razones', filas: [{ id: 'dor', etiqueta: 'DOR', valor: Infinity }], escala: 'log', pista: 'lr' }],
  };
  const svg = renderGrafica(sinDatos, { fmt });
  // [0.1, 10] por omisión: el eje existe y se puede leer.
  assert.equal(svg.match(/class="bio-svg__eje"/g)?.length, 2);
  assert.ok(svg.includes(`>${fmt.num(0.1, 'sig3')}</text>`));
});

// ---------------------------------------------------------------------------
// fagan
// ---------------------------------------------------------------------------

function fagan(extra: Partial<GraficaFagan> = {}): GraficaFagan {
  return {
    tipo: 'fagan',
    titulo: 'Nomograma de Fagan',
    resumen: 'Preprueba 30.0 %; un resultado positivo la lleva a 87.9 %',
    pre: 0.3,
    ejes: { pre: 'Preprueba %', lr: 'LR', post: 'Posprueba %' },
    lineas: [
      { id: 'pos', etiqueta: 'Resultado positivo', lr: 17, post: 0.879, destacada: true },
      { id: 'neg', etiqueta: 'Resultado negativo', lr: 0.158, post: 0.0634 },
    ],
    ...extra,
  };
}

function altoDe(svg: string): number {
  return Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)?.[1]);
}

test('el nomograma dibuja tres ejes, una recta por resultado y sus tres puntos', () => {
  const svg = renderGrafica(fagan(), { fmt });
  assert.equal(svg.match(/class="bio-svg__fagan-eje"/g)?.length, 3);
  assert.equal(svg.match(/class="bio-svg__fagan-linea/g)?.length, 2);
  assert.equal(svg.match(/class="bio-svg__fagan-punto/g)?.length, 6);
  assert.equal(svg.match(/class="bio-svg__fagan-linea is-destacada"/g)?.length, 1);
  // La recta secundaria, sus tres puntos y su entrada de leyenda comparten el modificador.
  assert.equal(svg.match(/is-secundaria/g)?.length, 5);
});

test('los tres ejes llevan su título y las marcas de porcentaje de la escala logit', () => {
  const svg = renderGrafica(fagan(), { fmt });
  for (const t of ['Preprueba %', 'LR', 'Posprueba %']) {
    assert.ok(svg.includes(`>${t}</text>`), `falta el título ${t}`);
  }
  // Extremos y centro de la escala de probabilidad, en los dos ejes exteriores.
  for (const p of [0.001, 0.5, 0.999]) {
    const rotulo = fmt.num(p, Number.isInteger(p * 100) ? 'pct0' : 'pct1');
    assert.equal(svg.match(new RegExp(`>${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</text>`, 'g'))?.length, 2);
  }
  // Marcas del eje central, sin notación científica.
  for (const v of [0.001, 1, 1000]) assert.ok(svg.includes(`>${fmt.num(v, 'sig3')}</text>`), `falta el LR ${v}`);
  assert.ok(!/e[+-]\d/.test(svg));
});

test('el título de eje del nomograma se escapa', () => {
  const svg = renderGrafica(fagan({ ejes: { pre: 'Pre & post', lr: '<LR>', post: 'Post "%"' } }), { fmt });
  assert.ok(svg.includes('Pre &amp; post'));
  assert.ok(svg.includes('&lt;LR&gt;'));
  assert.ok(!svg.includes('<LR>'));
});

test('una recta con valores imposibles se omite sin lanzar, pero los ejes se dibujan', () => {
  const lineas = [
    { id: 'a', etiqueta: 'Posprueba imposible', lr: 17, post: 1.5 },
    { id: 'b', etiqueta: 'LR cero', lr: 0, post: 0.5 },
    { id: 'c', etiqueta: 'LR no definido', lr: NaN, post: 0.5 },
    { id: 'd', etiqueta: 'Válida', lr: 4, post: 0.63, destacada: true },
  ];
  const svg = renderGrafica(fagan({ lineas }), { fmt });
  assert.equal(svg.match(/class="bio-svg__fagan-eje"/g)?.length, 3);
  assert.equal(svg.match(/class="bio-svg__fagan-linea/g)?.length, 1);
  assert.equal(svg.match(/class="bio-svg__fagan-punto/g)?.length, 3);
  assert.ok(svg.includes('Válida'));
  assert.ok(!svg.includes('Posprueba imposible'));
});

test('una preprueba fuera de (0, 1) deja el nomograma vacío de rectas', () => {
  const svg = renderGrafica(fagan({ pre: 0 }), { fmt });
  assert.equal(svg.match(/class="bio-svg__fagan-eje"/g)?.length, 3);
  assert.equal(svg.match(/class="bio-svg__fagan-linea/g), null);
});

/** Extremos de la primera recta del nomograma y ordenada de su punto en el eje central. */
function rectaFagan(svg: string): { y1: number; y2: number; yLr: number } {
  const linea = /class="bio-svg__fagan-linea[^"]*" x1="[\d.-]+" y1="(-?[\d.]+)" x2="[\d.-]+" y2="(-?[\d.]+)"/.exec(svg);
  const puntos = [...svg.matchAll(/class="bio-svg__fagan-punto[^"]*" cx="[\d.]+" cy="(-?[\d.]+)"/g)];
  assert.ok(linea && puntos.length >= 3, 'no se encontró la recta con sus tres puntos');
  return { y1: Number(linea[1]), y2: Number(linea[2]), yLr: Number(puntos[1]?.[1]) };
}

test('la recta del nomograma corta el eje central exactamente en el LR, también fuera de los ejes', () => {
  // Dentro de la escala y fuera de ella (preprueba 0.01 %, posprueba > 99.9 %):
  // el extremo NO se recorta (cambiaría la pendiente); lo que sobra se oculta con clipPath.
  const posprueba = (pre: number, lr: number): number => {
    const o = (pre / (1 - pre)) * lr;
    return o / (1 + o);
  };
  for (const [pre, lr] of [
    [0.3, 17],
    [0.0001, 17],
    [0.9999, 1e9],
    [0.005, 0.1],
  ] as const) {
    const post = posprueba(pre, lr);
    const svg = renderGrafica(fagan({ pre, lineas: [{ id: 'x', etiqueta: 'x', lr, post, destacada: true }] }), { fmt });
    const { y1, y2, yLr } = rectaFagan(svg);
    assert.ok(Math.abs((y1 + y2) / 2 - yLr) <= 0.01, `pre ${pre}, LR ${lr}: el punto del LR (${yLr}) no está sobre la recta (${(y1 + y2) / 2})`);
    assert.match(svg, /<clipPath id="bio-grafica-fagan-rec">/);
    assert.match(svg, /<g clip-path="url\(#bio-grafica-fagan-rec\)">/);
    assert.equal(svg.match(/class="bio-svg__fagan-linea/g)?.length, 1);
  }
  // Los ejes y sus marcas sí quedan siempre dentro del lienzo.
  const svg = renderGrafica(fagan({ pre: 0.9999 }), { fmt });
  const alto = altoDe(svg);
  for (const y of [...svg.matchAll(/class="bio-svg__fagan-tick" x1="[\d.]+" y1="(-?[\d.]+)"/g)].map((m) => Number(m[1]))) {
    assert.ok(y >= 0 && y <= alto, `marca fuera del lienzo: ${y}`);
  }
});

test('la leyenda del nomograma nombra cada resultado con su LR y su posprueba', () => {
  const svg = renderGrafica(fagan(), { fmt });
  assert.equal(svg.match(/class="bio-svg__leyenda/g)?.length, 2);
  assert.ok(svg.includes(`Resultado positivo: LR ${fmt.num(17, 'lr')} · ${fmt.num(0.879, 'pct1')}`));
  assert.ok(svg.includes(`Resultado negativo: LR ${fmt.num(0.158, 'lr')} · ${fmt.num(0.0634, 'pct1')}`));
});

// ---------------------------------------------------------------------------
// curvas
// ---------------------------------------------------------------------------

function curvas(extra: Partial<GraficaCurvas> = {}): GraficaCurvas {
  return {
    tipo: 'curvas',
    titulo: 'VPP y VPN frente a la prevalencia',
    resumen: 'Con Sn 85.0 % y Sp 95.0 %',
    curvas: [
      { id: 'vpp', etiqueta: 'VPP', puntos: [[0, 0], [0.5, 0.9], [1, 1]], destacada: true },
      { id: 'vpn', etiqueta: 'VPN', puntos: [[0, 1], [0.5, 0.85], [1, 0]] },
    ],
    ejeX: { etiqueta: 'Prevalencia', dominio: [0, 1], pista: 'pct0' },
    ejeY: { etiqueta: 'Probabilidad posprueba', dominio: [0, 1], pista: 'pct0' },
    marcador: { x: 0.3, etiqueta: 'Prevalencia observada', valores: { vpp: 0.919 } },
    ...extra,
  };
}

/** Eje vertical del área de trazado: sirve para traducir datos a coordenadas. */
function ejeY(svg: string): (v: number) => number {
  const m = /class="bio-svg__eje" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/.exec(svg);
  assert.ok(m, 'no se encontró el eje vertical');
  assert.equal(m[1], m[3], 'el primer eje debería ser el vertical');
  const arriba = Number(m[2]);
  const abajo = Number(m[4]);
  return (v) => abajo - v * (abajo - arriba);
}

function puntosMarcador(svg: string): number[] {
  return [...svg.matchAll(/class="bio-svg__marcador-punto[^"]*" cx="[\d.]+" cy="([\d.]+)"/g)].map((m) => Number(m[1]));
}

test('cada curva se dibuja como una polilínea con su propio trazo', () => {
  const svg = renderGrafica(curvas(), { fmt });
  assert.equal(svg.match(/<polyline class="bio-svg__curva/g)?.length, 2);
  assert.equal(svg.match(/<polyline class="bio-svg__curva is-destacada"/g)?.length, 1);
  assert.equal(svg.match(/<polyline class="bio-svg__curva is-secundaria"/g)?.length, 1);
  // Leyenda arriba: un segmento y un texto por curva.
  assert.equal(svg.match(/class="bio-svg__leyenda /g)?.length, 2);
  assert.equal(svg.match(/class="bio-svg__leyenda-texto"/g)?.length, 2);
  assert.ok(svg.includes('>VPP</text>'));
  assert.ok(svg.includes('>VPN</text>'));
});

test('las curvas llevan los dos títulos de eje y sus marcas', () => {
  const svg = renderGrafica(curvas(), { fmt });
  assert.ok(svg.includes('>Prevalencia</text>'));
  assert.ok(svg.includes('>Probabilidad posprueba</text>'));
  for (const v of [0, 0.5, 1]) {
    assert.ok(svg.includes(`>${fmt.num(v, 'pct0')}</text>`), `falta la marca ${v}`);
  }
});

test('el marcador pone un punto sobre cada curva y respeta los valores declarados', () => {
  const svg = renderGrafica(curvas(), { fmt });
  assert.equal(svg.match(/class="bio-svg__marcador"/g)?.length, 1);
  const y = ejeY(svg);
  const puntos = puntosMarcador(svg);
  assert.equal(puntos.length, 2);
  // VPP viene declarado (0.919); VPN se interpola entre (0, 1) y (0.5, 0.85) → 0.91.
  assert.ok(Math.abs(puntos[0] - y(0.919)) < 0.01, `VPP: ${puntos[0]} ≠ ${y(0.919)}`);
  assert.ok(Math.abs(puntos[1] - y(0.91)) < 0.01, `VPN: ${puntos[1]} ≠ ${y(0.91)}`);
  assert.ok(svg.includes('>Prevalencia observada</text>'));
});

test('sin valores declarados el marcador interpola sobre la polilínea', () => {
  const svg = renderGrafica(curvas({ marcador: { x: 0.3 } }), { fmt });
  const y = ejeY(svg);
  const puntos = puntosMarcador(svg);
  // VPP entre (0, 0) y (0.5, 0.9) → 0.54; VPN entre (0, 1) y (0.5, 0.85) → 0.91.
  assert.ok(Math.abs(puntos[0] - y(0.54)) < 0.01, `VPP: ${puntos[0]} ≠ ${y(0.54)}`);
  assert.ok(Math.abs(puntos[1] - y(0.91)) < 0.01, `VPN: ${puntos[1]} ≠ ${y(0.91)}`);
});

test('un punto no finito parte la polilínea en lugar de romperla', () => {
  const svg = renderGrafica(
    curvas({
      curvas: [{ id: 'vpp', etiqueta: 'VPP', puntos: [[0, 0], [0.25, 0.5], [0.5, NaN], [0.75, 0.9], [1, 1]] }],
      marcador: undefined,
    }),
    { fmt },
  );
  assert.equal(svg.match(/<polyline class="bio-svg__curva/g)?.length, 2);
  assert.ok(!svg.includes('NaN'));
});

test('el texto de las curvas se escapa', () => {
  const svg = renderGrafica(
    curvas({ ejeX: { etiqueta: 'p < 0.05 & «x»', dominio: [0, 1], pista: 'pct0' } }),
    { fmt },
  );
  assert.ok(svg.includes('p &lt; 0.05 &amp; «x»'));
});

// ---------------------------------------------------------------------------
// barras
// ---------------------------------------------------------------------------

/** Caso real de `chi-cuadrada-fisher`: observadas frente a esperadas en las cuatro celdas. */
function barras(extra: Partial<GraficaBarras> = {}): GraficaBarras {
  return {
    tipo: 'barras',
    titulo: 'Frecuencias observadas y esperadas por celda',
    resumen: 'χ² de Pearson 12.3 con 1 grado de libertad (p = 0.000)',
    series: [
      { id: 'obs', etiqueta: 'Observadas', destacada: true },
      { id: 'esp', etiqueta: 'Esperadas' },
    ],
    categorias: [
      { id: 'a', etiqueta: 'Expuestos con desenlace', valores: [68, 54] },
      { id: 'b', etiqueta: 'Expuestos sin desenlace', valores: [6, 20] },
      { id: 'c', etiqueta: 'No expuestos, desenlace', valores: [12, 26] },
      { id: 'd', etiqueta: 'No expuestos, sin desenlace', valores: [114, 100] },
    ],
    ejeY: { etiqueta: 'Frecuencia', dominio: [0, 120], pista: 'int' },
    ...extra,
  };
}

/**
 * Rectángulos de barra del área de trazado. Las muestras de la leyenda llevan la
 * misma clase (comparten la regla de relleno del CSS) y se dibujan antes, así
 * que se descartan por posición: `enLeyenda` es el número de series rotuladas.
 */
function barrasDibujadas(svg: string, enLeyenda = 0): RegExpMatchArray[] {
  return [...svg.matchAll(/<rect class="(bio-svg__barra[^"]*)"[^>]*height="([\d.]+)"/g)].slice(enLeyenda);
}

test('barras: el SVG lleva título, descripción y viewBox con el alto real', () => {
  const svg = renderGrafica(barras(), { fmt });
  assert.match(svg, /<svg class="bio-svg" role="img" aria-labelledby="bio-grafica-t bio-grafica-d"/);
  assert.match(svg, /<title id="bio-grafica-t">Frecuencias observadas y esperadas por celda<\/title>/);
  assert.match(svg, /<desc id="bio-grafica-d">χ² de Pearson 12\.3 con 1 grado de libertad \(p = 0\.000\)<\/desc>/);
  assert.match(svg, new RegExp(`viewBox="0 0 ${ANCHO_POR_DEFECTO} \\d+(\\.\\d+)?"`));
  // Leyenda + 220 del área + eje + dos líneas de rótulo: entre 300 y 400.
  const alto = altoDe(svg);
  assert.ok(alto > 300 && alto < 400, `alto inesperado: ${alto}`);
});

test('barras: hay una barra por serie y categoría, más la muestra de cada serie en la leyenda', () => {
  const svg = renderGrafica(barras(), { fmt });
  // 4 categorías × 2 series + 2 muestras: la muestra lleva la misma clase que la
  // barra para que el relleno salga de la misma regla de CSS.
  assert.equal(svg.match(/class="bio-svg__barra/g)?.length, 10);
  assert.equal(barrasDibujadas(svg, 2).length, 8);
  assert.equal(svg.match(/class="bio-svg__barra is-destacada"/g)?.length, 5);
  assert.equal(svg.match(/class="bio-svg__barra is-secundaria"/g)?.length, 5);
  // Un rótulo por categoría, partido en dos líneas cuando no cabe.
  assert.equal(svg.match(/class="bio-svg__etiqueta"/g)?.length, 4);
  assert.ok(svg.includes('>Expuestos con</tspan>'));
});

test('barras: la serie secundaria se rellena con una trama declarada en defs', () => {
  const svg = renderGrafica(barras(), { fmt });
  assert.match(svg, /<pattern id="bio-grafica-trama" patternUnits="userSpaceOnUse" width="6" height="6">/);
  assert.equal(svg.match(/class="bio-svg__trama"/g)?.length, 3);
  // Cuatro barras secundarias y su muestra en la leyenda.
  assert.equal(svg.match(/fill="url\(#bio-grafica-trama\)"/g)?.length, 5);
  // La destacada va en navy sólido: sin atributo de relleno, lo pone el CSS.
  assert.ok(!/class="bio-svg__barra is-destacada" fill=/.test(svg));
  // Sin series secundarias no hace falta definir ninguna trama.
  const sola = renderGrafica(
    barras({
      series: [{ id: 'obs', etiqueta: 'Observadas', destacada: true }],
      categorias: [{ id: 'a', etiqueta: 'Discordantes b', valores: [18] }],
    }),
    { fmt },
  );
  assert.equal(sola.match(/<pattern /g), null);
});

test('barras: una segunda serie secundaria estrena su propia trama', () => {
  const svg = renderGrafica(
    barras({
      series: [
        { id: 'obs', etiqueta: 'Observadas', destacada: true },
        { id: 'esp', etiqueta: 'Esperadas' },
        { id: 'ajus', etiqueta: 'Ajustadas' },
      ],
      categorias: [{ id: 'a', etiqueta: 'Celda a', valores: [68, 54, 60] }],
    }),
    { fmt },
  );
  assert.match(svg, /<pattern id="bio-grafica-trama-2"/);
  assert.equal(svg.match(/fill="url\(#bio-grafica-trama\)"/g)?.length, 2);
  assert.equal(svg.match(/fill="url\(#bio-grafica-trama-2\)"/g)?.length, 2);
  assert.equal(svg.match(/class="bio-svg__barra is-secundaria is-trazo-2"/g)?.length, 2);
});

test('barras: la leyenda solo aparece con más de una serie', () => {
  const svg = renderGrafica(barras(), { fmt });
  assert.equal(svg.match(/class="bio-svg__leyenda-texto"/g)?.length, 2);
  assert.ok(svg.includes('>Observadas</text>'));
  assert.ok(svg.includes('>Esperadas</text>'));
  const sola = renderGrafica(
    barras({
      series: [{ id: 'b', etiqueta: 'Pares discordantes', destacada: true }],
      categorias: [
        { id: 'b', etiqueta: 'b (positivo, luego negativo)', valores: [18] },
        { id: 'c', etiqueta: 'c (negativo, luego positivo)', valores: [7] },
      ],
    }),
    { fmt },
  );
  assert.equal(sola.match(/class="bio-svg__leyenda-texto"/g), null);
  assert.equal(barrasDibujadas(sola).length, 2);
});

test('barras: el eje de frecuencias se rotula con la pista de la calculadora', () => {
  const svg = renderGrafica(barras(), { fmt });
  for (const v of [0, 50, 100]) {
    assert.ok(svg.includes(`>${fmt.num(v, 'int')}</text>`), `falta la marca ${v}`);
  }
  assert.ok(svg.includes('>Frecuencia</text>'));
  // Sin pista declarada se cuentan enteros, no decimales.
  const sinPista = renderGrafica(barras({ ejeY: { etiqueta: 'Frecuencia', dominio: [0, 120] } }), { fmt });
  assert.ok(sinPista.includes(`>${fmt.num(100, 'int')}</text>`));
  assert.ok(!sinPista.includes('>100.000</text>'));
});

test('barras: con pocos conteos las marcas del eje siguen siendo enteras', () => {
  // Con un máximo de 9, el paso «bonito» sería 2.5 y la pista `int` rotularía
  // «3» sobre la posición de 2.5: el eje de conteos usa paso entero.
  const svg = renderGrafica(
    barras({
      ejeY: { etiqueta: 'Pares discordantes', dominio: [0, 0], pista: 'int' },
      series: [{ id: 'obs', etiqueta: 'Observados', destacada: true }],
      categorias: [
        { id: 'b', etiqueta: 'b', valores: [9] },
        { id: 'c', etiqueta: 'c', valores: [4] },
      ],
    }),
    { fmt },
  );
  const marcas = [...svg.matchAll(/class="bio-svg__tick-texto"[^>]*text-anchor="end"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(marcas, [0, 3, 6, 9].map((v) => fmt.num(v, 'int')));
});

test('barras: el valor va encima de cada barra y se calla cuando la barra es estrecha', () => {
  const svg = renderGrafica(barras(), { fmt });
  assert.equal(svg.match(/class="bio-svg__valor"/g)?.length, 8);
  assert.ok(svg.includes(`>${fmt.num(114, 'int')}</text>`));
  // Ocho categorías × dos series dejan barras de menos de 22 unidades: el número
  // se pisaría con el de la barra vecina y se omite.
  const apretada = renderGrafica(
    barras({
      categorias: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, etiqueta: `Celda ${i}`, valores: [10 + i, 12] })),
    }),
    { fmt },
  );
  assert.equal(apretada.match(/class="bio-svg__valor"/g), null);
  assert.equal(barrasDibujadas(apretada, 2).length, 16);
});

test('barras: la referencia se dibuja solo cuando se declara, con su etiqueta', () => {
  assert.equal(renderGrafica(barras(), { fmt }).match(/class="bio-svg__ref"/g), null);
  const conRef = renderGrafica(
    barras({ referencia: { valor: 12.5, etiqueta: 'Esperado bajo H₀' } }),
    { fmt },
  );
  assert.equal(conRef.match(/class="bio-svg__ref"/g)?.length, 1);
  assert.match(conRef, /class="bio-svg__marcador-texto"[^>]*text-anchor="end">Esperado bajo H₀<\/text>/);
  // Sin etiqueta la línea existe igual, pero nadie escribe encima del área.
  const sinEtiqueta = renderGrafica(barras({ referencia: { valor: 12.5 } }), { fmt });
  assert.equal(sinEtiqueta.match(/class="bio-svg__ref"/g)?.length, 1);
  assert.equal(sinEtiqueta.match(/class="bio-svg__marcador-texto"/g), null);
});

test('barras: el dominio se amplía al mayor valor y a la referencia', () => {
  // Declarado hasta 10, pero la celda d vale 114 y la referencia 150.
  const svg = renderGrafica(
    barras({ ejeY: { etiqueta: 'Frecuencia', dominio: [0, 10], pista: 'int' }, referencia: { valor: 150 } }),
    { fmt },
  );
  assert.ok(svg.includes(`>${fmt.num(150, 'int')}</text>`) || svg.includes(`>${fmt.num(100, 'int')}</text>`));
  // Ninguna barra puede salirse por arriba del área de trazado.
  for (const m of barrasDibujadas(svg, 2)) {
    const y = Number(/y="([\d.]+)"/.exec(m[0])?.[1]);
    assert.ok(y > 0, `una barra empieza fuera del lienzo: ${y}`);
  }
});

test('barras: un valor no finito o negativo omite la barra y conserva la categoría', () => {
  const svg = renderGrafica(
    barras({
      categorias: [
        { id: 'a', etiqueta: 'Celda válida', valores: [68, 54] },
        { id: 'b', etiqueta: 'Sin esperada', valores: [6, NaN] },
        { id: 'c', etiqueta: 'Infinita', valores: [Infinity, 26] },
        { id: 'd', etiqueta: 'Negativa', valores: [-3, 100] },
      ],
    }),
    { fmt },
  );
  // 8 posibles − 3 imposibles = 5 barras dibujadas (+ 2 muestras de leyenda).
  assert.equal(barrasDibujadas(svg, 2).length, 5);
  assert.ok(!svg.includes('NaN'));
  assert.ok(!svg.includes('Infinity'));
  for (const etiqueta of ['Sin esperada', 'Infinita', 'Negativa']) {
    assert.ok(svg.includes(`>${etiqueta}</tspan>`), `falta el rótulo ${etiqueta}`);
  }
});

test('barras: el texto del contenido se escapa y el prefijo de identificadores es configurable', () => {
  const svg = renderGrafica(
    barras({
      titulo: 'χ² <script>alert(1)</script>',
      categorias: [{ id: 'a', etiqueta: 'a & b', valores: [68, 54] }],
      referencia: { valor: 50, etiqueta: 'p < 0.05' },
    }),
    { fmt, id: 'g2' },
  );
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('χ² &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(svg.includes('a &amp; b'));
  assert.ok(svg.includes('p &lt; 0.05'));
  assert.match(svg, /aria-labelledby="g2-t g2-d"/);
  assert.match(svg, /<pattern id="g2-trama"/);
  assert.equal(svg.match(/fill="url\(#g2-trama\)"/g)?.length, 2);
});

// ---------------------------------------------------------------------------
// histograma-boxplot
// ---------------------------------------------------------------------------

/** Caso real de `descriptivos`: 40 observaciones resumidas en cuatro clases. */
function hist(extra: Partial<GraficaHistogramaBoxplot> = {}): GraficaHistogramaBoxplot {
  return {
    tipo: 'histograma-boxplot',
    titulo: 'Distribución de la variable',
    resumen: 'n = 40; mediana 12.4 (RIC 9.8 a 15.1)',
    ejeX: { etiqueta: 'Concentración (mg/L)', dominio: [4, 20], pista: 'dec1' },
    bins: [
      { desde: 4, hasta: 8, n: 4 },
      { desde: 8, hasta: 12, n: 14 },
      { desde: 12, hasta: 16, n: 13 },
      { desde: 16, hasta: 20, n: 9 },
    ],
    etiquetaFrecuencia: 'Frecuencia',
    caja: { min: 4.2, q1: 9.8, mediana: 12.4, q3: 15.1, max: 19.6, bigoteInf: 4.2, bigoteSup: 19.6, atipicos: [] },
    normal: { media: 12.3, de: 3.8, etiqueta: 'Normal ajustada' },
    marcadores: [{ id: 'media', etiqueta: 'Media', x: 12.3, destacada: true }],
    ...extra,
  };
}

test('histograma: el SVG lleva título, descripción y viewBox con la suma real de las bandas', () => {
  const svg = renderGrafica(hist(), { fmt });
  assert.match(svg, /<title id="bio-grafica-t">Distribución de la variable<\/title>/);
  assert.match(svg, /<desc id="bio-grafica-d">n = 40; mediana 12\.4 \(RIC 9\.8 a 15\.1\)<\/desc>/);
  assert.match(svg, new RegExp(`viewBox="0 0 ${ANCHO_POR_DEFECTO} \\d+(\\.\\d+)?"`));
  // 170 del histograma + 64 de la caja + eje + título del eje, más las bandas de
  // arriba: por encima de 300 y por debajo de 400.
  const alto = altoDe(svg);
  assert.ok(alto > 300 && alto < 400, `alto inesperado: ${alto}`);
});

test('histograma: hay una barra por clase y la curva normal se dibuja recortada al panel', () => {
  const svg = renderGrafica(hist(), { fmt });
  assert.equal(svg.match(/class="bio-svg__hist-barra"/g)?.length, 4);
  assert.equal(svg.match(/<polyline class="bio-svg__normal"/g)?.length, 1);
  assert.match(svg, /<clipPath id="bio-grafica-hist-rec">/);
  assert.match(svg, /<g clip-path="url\(#bio-grafica-hist-rec\)">/);
  // La polilínea se evalúa en 120 puntos del dominio.
  const puntos = /<polyline class="bio-svg__normal" points="([^"]+)"/.exec(svg)?.[1] ?? '';
  assert.equal(puntos.split(' ').length, 120);
  assert.ok(!puntos.includes('NaN'));
  // Sin curva normal declarada no hay polilínea ni recorte.
  const sinNormal = renderGrafica(hist({ normal: undefined }), { fmt });
  assert.equal(sinNormal.match(/class="bio-svg__normal"/g), null);
  assert.equal(sinNormal.match(/<clipPath/g), null);
  assert.equal(sinNormal.match(/class="bio-svg__hist-barra"/g)?.length, 4);
});

test('histograma: una DE no utilizable deja el panel sin curva, pero con sus barras', () => {
  for (const de of [0, -1, NaN, Infinity]) {
    const svg = renderGrafica(hist({ normal: { media: 12.3, de, etiqueta: 'Normal' } }), { fmt });
    assert.equal(svg.match(/class="bio-svg__normal"/g), null, `de = ${de}`);
    assert.equal(svg.match(/class="bio-svg__hist-barra"/g)?.length, 4);
  }
});

test('histograma: el eje de frecuencias lleva su título y marcas enteras', () => {
  const svg = renderGrafica(hist(), { fmt });
  assert.ok(svg.includes('>Frecuencia</text>'));
  for (const v of [0, 5, 10, 15]) {
    assert.ok(svg.includes(`>${fmt.num(v, 'int')}</text>`), `falta la marca de frecuencia ${v}`);
  }
  // Una frecuencia es un conteo: el eje nunca se rotula con un paso de 2.5.
  const pocas = renderGrafica(
    hist({
      bins: [
        { desde: 4, hasta: 8, n: 2 },
        { desde: 8, hasta: 12, n: 9 },
        { desde: 12, hasta: 16, n: 5 },
      ],
      normal: undefined,
    }),
    { fmt },
  );
  const marcas = [...pocas.matchAll(/class="bio-svg__tick-texto"[^>]*text-anchor="end"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(marcas, [0, 3, 6, 9].map((v) => fmt.num(v, 'int')));
});

test('histograma: el eje x es único y se rotula con la pista de la variable', () => {
  const svg = renderGrafica(hist(), { fmt });
  assert.ok(svg.includes('>Concentración (mg/L)</text>'));
  for (const v of [5, 10, 15, 20]) {
    assert.ok(svg.includes(`>${fmt.num(v, 'dec1')}</text>`), `falta la marca ${v}`);
  }
});

test('histograma: la caja dibuja el resumen de cinco números con bigotes y atípicos', () => {
  const svg = renderGrafica(hist({ caja: { ...hist().caja, bigoteInf: 5.4, bigoteSup: 18.2, atipicos: [4.2, 19.6, 21.4] } }), { fmt });
  assert.equal(svg.match(/class="bio-svg__caja"/g)?.length, 1);
  assert.equal(svg.match(/class="bio-svg__mediana"/g)?.length, 1);
  // Dos bigotes, cada uno con su línea y su tope vertical.
  assert.equal(svg.match(/class="bio-svg__bigote"/g)?.length, 4);
  assert.equal(svg.match(/class="bio-svg__atipico"/g)?.length, 3);
  // La caja va de q1 a q3, siempre con ancho positivo.
  const caja = /<rect class="bio-svg__caja" x="([\d.]+)"[^>]*width="([\d.]+)"/.exec(svg);
  assert.ok(caja, 'no se encontró el rectángulo de la caja');
  assert.ok(Number(caja[2]) > 0, `la caja no tiene ancho: ${caja[2]}`);
});

test('histograma: un número no finito omite su pieza de la caja sin romper el resto', () => {
  const svg = renderGrafica(
    hist({
      caja: { min: NaN, q1: NaN, mediana: NaN, q3: 15.1, max: 19.6, bigoteInf: NaN, bigoteSup: 19.6, atipicos: [NaN, 18.5] },
    }),
    { fmt },
  );
  assert.equal(svg.match(/class="bio-svg__caja"/g), null);
  assert.equal(svg.match(/class="bio-svg__mediana"/g), null);
  // Solo el bigote superior: línea y tope.
  assert.equal(svg.match(/class="bio-svg__bigote"/g)?.length, 2);
  assert.equal(svg.match(/class="bio-svg__atipico"/g)?.length, 1);
  assert.ok(!svg.includes('NaN'));
});

test('histograma: el marcador cruza los dos paneles y lleva su rótulo', () => {
  const svg = renderGrafica(hist(), { fmt });
  assert.equal(svg.match(/class="bio-svg__marcador is-destacada"/g)?.length, 1);
  assert.match(svg, /class="bio-svg__marcador-texto is-destacada"[^>]*>Media<\/text>/);
  // La línea empieza en el panel del histograma y termina en el eje x.
  const linea = /class="bio-svg__marcador is-destacada" x1="([\d.]+)" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/.exec(svg);
  assert.ok(linea, 'no se encontró la línea del marcador');
  assert.ok(Number(linea[3]) - Number(linea[2]) > 200, 'el marcador no cruza los dos paneles');
});

test('histograma: dos marcadores reparten sus rótulos en dos bandas y lados opuestos', () => {
  const svg = renderGrafica(
    hist({
      marcadores: [
        { id: 'media', etiqueta: 'Media', x: 6, destacada: true },
        { id: 'mediana', etiqueta: 'Mediana', x: 18 },
      ],
    }),
    { fmt },
  );
  const textos = [...svg.matchAll(/class="bio-svg__marcador-texto[^"]*"[^>]*y="([\d.]+)"([^>]*)>([^<]+)</g)];
  assert.equal(textos.length, 2);
  assert.notEqual(textos[0][1], textos[1][1], 'los dos rótulos quedaron en la misma banda');
  // El de la izquierda escribe hacia la derecha y el de la derecha, al revés.
  assert.ok(!textos[0][2].includes('text-anchor="end"'), 'el marcador izquierdo debería escribir hacia la derecha');
  assert.ok(textos[1][2].includes('text-anchor="end"'), 'el marcador derecho debería escribir hacia la izquierda');
});

test('histograma: con tres o más marcadores los nombres pasan a la leyenda', () => {
  const svg = renderGrafica(
    hist({
      bins: undefined,
      normal: undefined,
      marcadores: [
        { id: 'luo', etiqueta: 'Luo 2018', x: 11.8, destacada: true },
        { id: 'wan', etiqueta: 'Wan 2014', x: 12.1 },
        { id: 'hozo', etiqueta: 'Hozo 2005', x: 12.6 },
      ],
    }),
    { fmt },
  );
  assert.equal(svg.match(/class="bio-svg__marcador[ "]/g)?.length, 3);
  assert.equal(svg.match(/class="bio-svg__marcador is-destacada"/g)?.length, 1);
  assert.equal(svg.match(/class="bio-svg__marcador-texto/g), null);
  assert.equal(svg.match(/class="bio-svg__leyenda is-marcador/g)?.length, 3);
  assert.equal(svg.match(/class="bio-svg__leyenda-texto"/g)?.length, 3);
  for (const etiqueta of ['Luo 2018', 'Wan 2014', 'Hozo 2005']) {
    assert.ok(svg.includes(`>${etiqueta}</text>`), `falta ${etiqueta} en la leyenda`);
  }
});

test('histograma: sin bins el panel superior se queda con la curva normal, y sin ella desaparece', () => {
  const soloNormal = renderGrafica(hist({ bins: undefined }), { fmt });
  assert.equal(soloNormal.match(/class="bio-svg__hist-barra"/g), null);
  assert.equal(soloNormal.match(/<polyline class="bio-svg__normal"/g)?.length, 1);
  assert.equal(soloNormal.match(/class="bio-svg__caja"/g)?.length, 1);
  // Sin histograma no hay eje de frecuencias ni su título.
  assert.ok(!soloNormal.includes('>Frecuencia</text>'));
  assert.equal(soloNormal.match(/class="bio-svg__leyenda-texto"/g)?.length, 1);
  assert.ok(soloNormal.includes('>Normal ajustada</text>'));

  const soloCaja = renderGrafica(hist({ bins: undefined, normal: undefined }), { fmt });
  assert.equal(soloCaja.match(/class="bio-svg__normal"/g), null);
  assert.equal(soloCaja.match(/class="bio-svg__caja"/g)?.length, 1);
  assert.equal(soloCaja.match(/class="bio-svg__mediana"/g)?.length, 1);

  // Cada variante ocupa menos alto que la anterior: el viewBox suma bandas reales.
  assert.ok(altoDe(soloCaja) < altoDe(soloNormal), 'la variante sin panel superior debería ser más baja');
  assert.ok(altoDe(soloNormal) < altoDe(renderGrafica(hist(), { fmt })), 'el histograma completo debería ser el más alto');
});

test('histograma: el dominio declarado se amplía a un atípico que se sale', () => {
  const svg = renderGrafica(
    hist({ caja: { ...hist().caja, atipicos: [28] } }),
    { fmt },
  );
  const cx = Number(/class="bio-svg__atipico" cx="([\d.]+)"/.exec(svg)?.[1]);
  // 28 es el extremo del dominio efectivo: cae justo en el borde derecho del área.
  assert.ok(Math.abs(cx - (ANCHO_POR_DEFECTO - 20)) < 1e-6, `el atípico quedó en ${cx}`);
  // Y el eje llega hasta él: hay una marca por encima del dominio declarado.
  const marcas = [...svg.matchAll(/class="bio-svg__tick-texto" font-size="\d+" x="[\d.]+"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.ok(marcas.includes(fmt.num(25, 'dec1')), `las marcas del eje x no llegan a 25: ${marcas.join(', ')}`);
});

test('histograma: los bins imposibles se descartan sin romper el panel', () => {
  const svg = renderGrafica(
    hist({
      bins: [
        { desde: 4, hasta: 8, n: 4 },
        { desde: 8, hasta: 8, n: 14 },
        { desde: 12, hasta: 10, n: 13 },
        { desde: 16, hasta: 20, n: NaN },
        { desde: 16, hasta: 20, n: 9 },
      ],
    }),
    { fmt },
  );
  assert.equal(svg.match(/class="bio-svg__hist-barra"/g)?.length, 2);
  assert.ok(!svg.includes('NaN'));
});

test('histograma: el texto se escapa y el prefijo de identificadores es configurable', () => {
  const svg = renderGrafica(
    hist({
      titulo: 'Descriptivos <b>',
      ejeX: { etiqueta: 'x < 5 & «y»', dominio: [4, 20], pista: 'dec1' },
      etiquetaFrecuencia: 'n & %',
      marcadores: [{ id: 'm', etiqueta: 'Media "x"', x: 12.3 }],
    }),
    { fmt, id: 'g3' },
  );
  assert.ok(!svg.includes('<b>'));
  assert.ok(svg.includes('Descriptivos &lt;b&gt;'));
  assert.ok(svg.includes('x &lt; 5 &amp; «y»'));
  assert.ok(svg.includes('n &amp; %'));
  assert.ok(svg.includes('Media &quot;x&quot;'));
  assert.match(svg, /aria-labelledby="g3-t g3-d"/);
  assert.match(svg, /<clipPath id="g3-hist-rec">/);
});

test('un tipo de gráfica no implementado se detiene con un mensaje claro', () => {
  // `km` (Kaplan-Meier) está declarada en `TipoGrafica` pero aún no se dibuja.
  const falsa = { ...grafica(), tipo: 'km' } as unknown as DatosGrafica;
  assert.throws(() => renderGrafica(falsa, { fmt }), /km/);
});
