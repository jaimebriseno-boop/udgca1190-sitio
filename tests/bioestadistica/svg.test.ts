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
  GraficaCurvas,
  GraficaFagan,
  GraficaForest,
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

test('un tipo de gráfica no implementado se detiene con un mensaje claro', () => {
  // `km` (Kaplan-Meier) está declarada en `TipoGrafica` pero aún no se dibuja.
  const falsa = { ...grafica(), tipo: 'km' } as unknown as DatosGrafica;
  assert.throws(() => renderGrafica(falsa, { fmt }), /km/);
});
