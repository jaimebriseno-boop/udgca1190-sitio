/**
 * Gráficas declarativas en SVG, como cadena de texto y sin DOM.
 *
 * El mismo módulo produce el SVG que se renderiza en build (SSR, desde el
 * frontmatter de Astro) y el que el controlador inserta con `innerHTML` al
 * recalcular: una sola implementación, imposible que las dos vistas diverjan.
 *
 * El color NO viaja en el SVG: cada elemento lleva su clase (`bio-svg__eje`,
 * `bio-svg__punto`…) y `Grafica.astro` publica los estilos globales con los
 * tokens `--udg-*`. Así el SVG insertado con `innerHTML` —que nunca recibe los
 * atributos de ámbito de Astro— se ve exactamente igual que el del servidor.
 *
 * Las series se distinguen por color Y por trazo (sólido, discontinuo,
 * punteado): la gráfica tiene que leerse igual impresa en blanco y negro.
 *
 * Las primitivas de escala y de ejes son genéricas (lineal y logarítmica). Con
 * ellas se dibujan las tres gráficas declaradas: `ic-forest` (uno o varios
 * paneles, cada uno con su escala y su eje), `fagan` (nomograma de 1975) y
 * `curvas`. Las que faltan (barras, histograma-boxplot, km, potencia) caen en
 * el `default` de `renderGrafica`.
 */
import type {
  Curva,
  DatosGrafica,
  EjeGrafica,
  FilaIC,
  Formateador,
  GraficaCurvas,
  GraficaFagan,
  GraficaForest,
  PanelIC,
  Pista,
} from './tipos.ts';

export type EscalaTipo = 'lineal' | 'log';

/** Escala de un dominio de datos a un rango de coordenadas del lienzo. */
export interface Escala {
  tipo: EscalaTipo;
  dominio: [number, number];
  rango: [number, number];
  /** Valor del dato → coordenada en el lienzo. */
  mapear(v: number): number;
}

/**
 * Geometría del lienzo, en unidades de usuario del `viewBox`.
 *
 * El SVG se escala al ancho del contenedor, así que el tamaño de letra se
 * expresa aquí (y viaja como atributo `font-size`, no en la hoja de estilos)
 * para que la estimación del ancho de la columna de etiquetas y lo que se dibuja
 * no puedan separarse.
 */
const LIENZO = {
  /** Alto de una fila con la etiqueta en una sola línea. */
  filaAlto: 30,
  /** Alto de una fila cuando alguna etiqueta ocupa dos líneas. */
  filaAltoDoble: 40,
  /** Separación entre las dos líneas de una etiqueta partida. */
  lineaAlto: 17,
  /** Margen superior antes de la primera fila. */
  margenSup: 10,
  /** Separación entre la columna de etiquetas y el área de trazado. */
  canal: 12,
  /** Margen derecho: deja sitio al radio del punto y a la última etiqueta del eje. */
  margenDer: 20,
  /** Distancia entre la última fila y la línea del eje. */
  ejeSep: 8,
  /** Largo de la marca de cada valor del eje. */
  tickLargo: 5,
  /** Línea base del rótulo de cada valor del eje, medida desde el eje. */
  tickTexto: 19,
  /** Alto reservado bajo el eje para sus rótulos. */
  ejeAlto: 26,
  /** Radio del punto de la estimación. */
  punto: 4,
  /** Media altura de los topes verticales del intervalo. */
  tope: 5,
  /** Tamaño de letra de las etiquetas de fila. */
  fuenteEtiqueta: 15,
  /** Tamaño de letra de los rótulos del eje. */
  fuenteTick: 13,
  /**
   * Ancho medio de carácter como fracción del tamaño de letra. Sirve para
   * repartir el lienzo sin medir texto (no hay DOM en este módulo); es
   * deliberadamente holgado para Inter en minúsculas con acentos.
   */
  anchoCaracter: 0.55,
  /** Fracción máxima del lienzo que puede ocupar la columna de etiquetas. */
  fraccionEtiquetas: 0.42,

  // Bosque de varios paneles
  /** Separación vertical entre el eje de un panel y el siguiente panel. */
  panelSep: 18,
  /** Alto reservado por el rótulo de un panel. */
  panelTituloAlto: 22,
  /** Tamaño de letra del rótulo de un panel. */
  fuentePanel: 13,

  // Nomograma de Fagan
  /** Margen superior de los tres ejes (deja sitio a sus títulos). */
  faganSup: 44,
  /** Alto útil de los ejes del nomograma. */
  faganAlto: 356,
  /** Separación entre un eje exterior y el rótulo de sus marcas. */
  faganCanal: 14,
  /** Largo de la marca de los ejes del nomograma. */
  faganTick: 4,
  /** Tamaño de letra de las marcas del nomograma (denso: 19 marcas por eje). */
  fuenteFagan: 11,
  /** Radio de los puntos preprueba, LR y posprueba. */
  faganPunto: 4,
  /** Separación entre el pie de los ejes y la leyenda. */
  faganLeyendaSep: 24,

  // Leyenda (curvas y nomograma)
  /** Alto de una fila de la leyenda. */
  leyendaAlto: 19,
  /** Largo del segmento de muestra de cada entrada. */
  leyendaTrazo: 26,
  /** Separación entre el segmento de muestra y su texto. */
  leyendaCanal: 8,
  /** Separación horizontal entre dos entradas de la misma fila. */
  leyendaSep: 20,
  /** Tamaño de letra de la leyenda. */
  fuenteLeyenda: 13,

  // Curvas
  /** Alto del área de trazado. */
  curvasAlto: 250,
  /** Alto reservado bajo las marcas del eje x para su título. */
  tituloEjeAlto: 20,
  /** Banda sobre el área de trazado para el rótulo del marcador. */
  marcadorAlto: 16,
} as const;

/** Ancho aproximado de un texto en unidades de usuario. */
function anchoTexto(texto: string, fuente: number): number {
  return texto.length * fuente * LIENZO.anchoCaracter;
}

/**
 * Parte una etiqueta larga en varias líneas por los espacios, sin superar
 * `maxCaracteres` ni `maxLineas`; lo que sobre se acumula en la última línea,
 * porque recortar el nombre de un método sería peor que dejarlo asomar.
 */
export function envolver(texto: string, maxCaracteres: number, maxLineas = 2): string[] {
  if (texto.length <= maxCaracteres || maxLineas <= 1) return [texto];
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(' ')) {
    const tentativa = actual === '' ? palabra : `${actual} ${palabra}`;
    if (tentativa.length > maxCaracteres && actual !== '' && lineas.length < maxLineas - 1) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = tentativa;
    }
  }
  lineas.push(actual);
  return lineas;
}

/** Escapa texto para insertarlo como contenido o como valor de atributo. */
export function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Coordenada con tres decimales como máximo (SVG compacto y determinista). */
function co(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}

/**
 * ¿Este valor se puede dibujar en una escala de este tipo? En logarítmica hay
 * que exigir además que sea positivo: un LR− de 0, un DOR infinito o un «no
 * definido» no tienen sitio en el eje y se omiten en lugar de amontonarse en el
 * extremo izquierdo.
 */
function dibujable(v: number | undefined, tipo: EscalaTipo): v is number {
  return typeof v === 'number' && Number.isFinite(v) && (tipo !== 'log' || v > 0);
}

/** Crea una escala; la logarítmica exige un dominio estrictamente positivo. */
export function crearEscala(dominio: [number, number], rango: [number, number], tipo: EscalaTipo = 'lineal'): Escala {
  const [d0, d1] = dominio;
  const [r0, r1] = rango;
  if (tipo === 'log') {
    if (!(d0 > 0 && d1 > 0)) throw new RangeError(`escala log: el dominio debe ser positivo (${d0}, ${d1})`);
    const l0 = Math.log10(d0);
    const l1 = Math.log10(d1);
    const k = l1 === l0 ? 0 : (r1 - r0) / (l1 - l0);
    return { tipo, dominio, rango, mapear: (v) => (v > 0 ? r0 + (Math.log10(v) - l0) * k : r0) };
  }
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return { tipo, dominio, rango, mapear: (v) => r0 + (v - d0) * k };
}

/** Paso «bonito» (1, 2, 2.5 o 5 × 10ⁿ) para cubrir un recorrido con ≈ `objetivo` marcas. */
export function pasoNice(recorrido: number, objetivo: number): number {
  const bruto = Math.abs(recorrido) / Math.max(1, objetivo);
  if (!(bruto > 0)) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / base;
  const m = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return m * base;
}

/** Redondea al número de decimales del paso, para que 0.1 + 0.2 no produzca «0.30000000000000004». */
function redondear(v: number, paso: number): number {
  const dec = Math.min(12, Math.max(0, -Math.floor(Math.log10(paso)) + 1));
  return Number(v.toFixed(dec));
}

/** Marcas de un eje lineal dentro del dominio. */
export function ticksLineales(d0: number, d1: number, objetivo = 5): number[] {
  const paso = pasoNice(d1 - d0, objetivo);
  const eps = paso * 1e-9;
  const inicio = Math.ceil((d0 - eps) / paso) * paso;
  const salida: number[] = [];
  for (let i = 0; i < 200; i++) {
    const v = redondear(inicio + i * paso, paso);
    if (v > d1 + eps) break;
    salida.push(v);
  }
  return salida;
}

/** Marcas de un eje logarítmico: décadas, con 2 y 5 cuando el recorrido es corto. */
export function ticksLog(d0: number, d1: number): number[] {
  const lo = Math.max(d0, Number.MIN_VALUE);
  const e0 = Math.floor(Math.log10(lo));
  const e1 = Math.ceil(Math.log10(d1));
  const mantisas = e1 - e0 <= 2 ? [1, 2, 5] : [1];
  const salida: number[] = [];
  for (let e = e0; e <= e1; e++) {
    for (const m of mantisas) {
      const v = m * Math.pow(10, e);
      if (v >= d0 * (1 - 1e-9) && v <= d1 * (1 + 1e-9)) salida.push(v);
    }
  }
  return salida;
}

/** Marcas del eje según el tipo de escala. */
export function ticks(dominio: [number, number], tipo: EscalaTipo = 'lineal', objetivo = 5): number[] {
  return tipo === 'log' ? ticksLog(dominio[0], dominio[1]) : ticksLineales(dominio[0], dominio[1], objetivo);
}

/**
 * Ancho del `viewBox` por omisión. Coincide con el `max-width` que
 * `Grafica.astro` da al SVG: por encima de ese ancho el dibujo no crece y las
 * letras se ven a su tamaño natural; por debajo se escala con el contenedor.
 */
export const ANCHO_POR_DEFECTO = 520;

export interface OpcionesGrafica {
  fmt: Formateador;
  /** Ancho del `viewBox` en unidades de usuario; el SVG se escala al contenedor. */
  ancho?: number;
  /** Prefijo de los `id` de `<title>` y `<desc>`; cámbialo si hay dos gráficas en una página. */
  id?: string;
}

/** Envoltura común: `viewBox`, título y descripción accesibles. */
function lienzoSvg(
  id: string,
  titulo: string,
  resumen: string,
  ancho: number,
  alto: number,
  cuerpo: string,
  defs = '',
): string {
  return (
    `<svg class="bio-svg" role="img" aria-labelledby="${esc(id)}-t ${esc(id)}-d"` +
    ` viewBox="0 0 ${co(ancho)} ${co(alto)}" xmlns="http://www.w3.org/2000/svg">` +
    `<title id="${esc(id)}-t">${esc(titulo)}</title>` +
    `<desc id="${esc(id)}-d">${esc(resumen)}</desc>` +
    (defs === '' ? '' : `<defs>${defs}</defs>`) +
    cuerpo +
    '</svg>'
  );
}

/**
 * Clase de una serie: la destacada va sólida y en navy; las demás alternan
 * patrón de trazo (`is-secundaria`, `is-trazo-2`, `is-trazo-3`) para que se
 * distingan entre sí sin depender del color.
 */
function claseSerie(base: string, destacada: boolean | undefined, indiceSecundaria: number): string {
  if (destacada) return `${base} is-destacada`;
  const n = indiceSecundaria % 3;
  return n === 0 ? `${base} is-secundaria` : `${base} is-secundaria is-trazo-${n + 1}`;
}

interface EntradaLeyenda {
  /** Clase del segmento de muestra (la misma serie que la curva o la recta). */
  clase: string;
  texto: string;
}

/** Ancho que ocupa una entrada de la leyenda, sin la separación que la sigue. */
function anchoEntrada(e: EntradaLeyenda): number {
  return LIENZO.leyendaTrazo + LIENZO.leyendaCanal + anchoTexto(e.texto, LIENZO.fuenteLeyenda);
}

/**
 * Leyenda en filas: las entradas fluyen de izquierda a derecha y saltan de fila
 * cuando no caben. Devuelve también el alto ocupado para que quien la dibuja
 * reparta el resto del lienzo.
 */
function leyendaSvg(
  entradas: EntradaLeyenda[],
  ancho: number,
  y0: number,
  claseTexto: string,
): { svg: string; alto: number } {
  const partes: string[] = [];
  let fila = 0;
  let x = 0;
  for (const e of entradas) {
    const w = anchoEntrada(e);
    if (x > 0 && x + w > ancho) {
      fila += 1;
      x = 0;
    }
    const cy = y0 + fila * LIENZO.leyendaAlto + LIENZO.leyendaAlto / 2;
    partes.push(
      `<line class="${e.clase}" x1="${co(x)}" y1="${co(cy)}" x2="${co(x + LIENZO.leyendaTrazo)}" y2="${co(cy)}" />`,
    );
    partes.push(
      `<text class="${claseTexto}" font-size="${LIENZO.fuenteLeyenda}"` +
        ` x="${co(x + LIENZO.leyendaTrazo + LIENZO.leyendaCanal)}" y="${co(cy)}" dominant-baseline="middle">` +
        `${esc(e.texto)}</text>`,
    );
    x += w + LIENZO.leyendaSep;
  }
  return { svg: partes.join(''), alto: entradas.length === 0 ? 0 : (fila + 1) * LIENZO.leyendaAlto };
}

// ---------------------------------------------------------------------------
// ic-forest
// ---------------------------------------------------------------------------

/**
 * Dominio efectivo de un panel: el declarado por la calculadora, AMPLIADO si
 * alguna estimación o algún extremo de intervalo se sale de él. Wald y
 * Agresti-Coull pueden salirse de [0, 1] y eso es justo lo que hay que ver.
 *
 * En escala logarítmica solo cuentan los valores positivos (un DOR infinito o
 * un LR de 0 no tienen logaritmo) y el dominio se redondea a décadas enteras,
 * que es donde caen las marcas del eje.
 */
function dominioPanel(p: PanelIC, tipo: EscalaTipo): [number, number] {
  let d0 = Number.POSITIVE_INFINITY;
  let d1 = Number.NEGATIVE_INFINITY;
  const considerar = (v: number | undefined): void => {
    if (dibujable(v, tipo)) {
      if (v < d0) d0 = v;
      if (v > d1) d1 = v;
    }
  };
  if (p.dominio) {
    considerar(p.dominio[0]);
    considerar(p.dominio[1]);
  }
  for (const f of p.filas) {
    considerar(f.valor);
    considerar(f.lo);
    considerar(f.hi);
  }
  considerar(p.referencia);
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) return tipo === 'log' ? [0.1, 10] : [0, 1];
  if (tipo === 'log') {
    const e0 = Math.floor(Math.log10(d0));
    const e1 = Math.ceil(Math.log10(d1));
    return [Math.pow(10, e0), Math.pow(10, e1 > e0 ? e1 : e0 + 1)];
  }
  if (d0 === d1) {
    const holgura = Math.abs(d0) || 1;
    return [d0 - holgura / 2, d1 + holgura / 2];
  }
  return [d0, d1];
}

/**
 * Reparte el lienzo entre las etiquetas y el trazado: las etiquetas se parten en
 * dos líneas si hace falta y la columna se queda con lo que de verdad ocupan,
 * nunca con más de `fraccionEtiquetas` del ancho.
 *
 * Se calcula con las filas de TODOS los paneles a la vez: una sola columna
 * compartida mantiene las áreas de trazado alineadas entre paneles.
 */
function columnaEtiquetas(filas: FilaIC[], ancho: number): { ancho: number; lineas: string[][] } {
  const presupuesto = ancho * LIENZO.fraccionEtiquetas;
  const maxCaracteres = Math.max(8, Math.floor(presupuesto / (LIENZO.fuenteEtiqueta * LIENZO.anchoCaracter)));
  const lineas = filas.map((f) => envolver(f.etiqueta, maxCaracteres));
  const necesario = Math.max(
    ...lineas.flat().map((linea) => anchoTexto(linea, LIENZO.fuenteEtiqueta)),
    ancho * 0.15,
  );
  return { ancho: Math.round(Math.min(presupuesto, necesario)), lineas };
}

/** Una fila: rótulo (una o dos líneas), barra del intervalo con topes y punto de la estimación. */
function filaSvg(f: FilaIC, lineas: string[], cy: number, x: Escala, xEtiqueta: number): string {
  const partes: string[] = [];
  const clase = f.destacada ? 'bio-svg__fila is-destacada' : 'bio-svg__fila';
  partes.push(`<g class="${clase}">`);
  const y0 = cy - ((lineas.length - 1) * LIENZO.lineaAlto) / 2;
  const tspans = lineas
    .map((linea, i) => `<tspan x="${co(xEtiqueta)}" y="${co(y0 + i * LIENZO.lineaAlto)}">${esc(linea)}</tspan>`)
    .join('');
  partes.push(
    `<text class="bio-svg__etiqueta" font-size="${LIENZO.fuenteEtiqueta}" text-anchor="end" dominant-baseline="middle">${tspans}</text>`,
  );
  const lo = dibujable(f.lo, x.tipo) ? f.lo : undefined;
  const hi = dibujable(f.hi, x.tipo) ? f.hi : undefined;
  if (lo !== undefined && hi !== undefined) {
    const xa = x.mapear(lo);
    const xb = x.mapear(hi);
    partes.push(`<line class="bio-svg__ic" x1="${co(xa)}" y1="${co(cy)}" x2="${co(xb)}" y2="${co(cy)}" />`);
    for (const xt of [xa, xb]) {
      partes.push(
        `<line class="bio-svg__tope" x1="${co(xt)}" y1="${co(cy - LIENZO.tope)}" x2="${co(xt)}" y2="${co(cy + LIENZO.tope)}" />`,
      );
    }
  }
  if (dibujable(f.valor, x.tipo)) {
    partes.push(`<circle class="bio-svg__punto" cx="${co(x.mapear(f.valor))}" cy="${co(cy)}" r="${LIENZO.punto}" />`);
  }
  partes.push('</g>');
  return partes.join('');
}

/** Eje inferior: línea, marcas y rótulos formateados con la pista de la calculadora. */
function ejeSvg(x: Escala, y: number, valores: number[], fmt: Formateador, pista: Pista | undefined): string {
  const partes: string[] = [
    `<line class="bio-svg__eje" x1="${co(x.rango[0])}" y1="${co(y)}" x2="${co(x.rango[1])}" y2="${co(y)}" />`,
  ];
  for (const v of valores) {
    const cx = x.mapear(v);
    partes.push(
      `<line class="bio-svg__tick" x1="${co(cx)}" y1="${co(y)}" x2="${co(cx)}" y2="${co(y + LIENZO.tickLargo)}" />`,
    );
    partes.push(
      `<text class="bio-svg__tick-texto" font-size="${LIENZO.fuenteTick}" x="${co(cx)}" y="${co(y + LIENZO.tickTexto)}" text-anchor="middle">${esc(fmt.num(v, pista))}</text>`,
    );
  }
  return partes.join('');
}

/**
 * Pista con la que se rotulan las marcas del eje. En escala logarítmica las
 * marcas son décadas y la pista `lr` las escribiría «1,000.00»: ahí se prefiere
 * `sig3` («1,000»). Los porcentajes se respetan siempre.
 */
function pistaEje(pista: Pista | undefined, tipo: EscalaTipo): Pista | undefined {
  if (tipo !== 'log') return pista;
  return pista !== undefined && pista.startsWith('pct') ? pista : 'sig3';
}

/**
 * Gráfica de bosque: una fila por medida o por método. `GraficaForest` es el
 * panel principal y puede traer más paneles debajo (`paneles`), cada uno con su
 * escala, su dominio, su referencia y su propio eje.
 *
 * El `rotulo` de un panel (distinto del `titulo`, que es el de la gráfica
 * entera) se dibuja sobre sus filas. La columna de etiquetas es única y se
 * calcula con las filas de todos los paneles, para que las áreas de trazado
 * queden alineadas y los ejes se puedan comparar de un vistazo.
 */
function forestIC(g: GraficaForest, op: OpcionesGrafica): string {
  const ancho = op.ancho ?? ANCHO_POR_DEFECTO;
  const id = op.id ?? 'bio-grafica';
  const paneles: PanelIC[] = [
    {
      rotulo: g.rotulo,
      filas: g.filas,
      dominio: g.dominio,
      escala: g.escala,
      referencia: g.referencia,
      pista: g.pista,
    },
    ...(g.paneles ?? []),
  ];
  const columna = columnaEtiquetas(paneles.flatMap((p) => p.filas), ancho);
  const x0 = columna.ancho + LIENZO.canal;
  const x1 = ancho - LIENZO.margenDer;

  const cuerpo: string[] = [];
  let y = LIENZO.margenSup;
  let desde = 0;
  paneles.forEach((p, ip) => {
    const lineas = columna.lineas.slice(desde, desde + p.filas.length);
    desde += p.filas.length;
    if (ip > 0) y += LIENZO.panelSep;
    if (p.rotulo) {
      cuerpo.push(
        `<text class="bio-svg__panel-titulo" font-size="${LIENZO.fuentePanel}" x="0" y="${co(y + LIENZO.fuentePanel)}">${esc(p.rotulo)}</text>`,
      );
      y += LIENZO.panelTituloAlto;
    }
    const tipo: EscalaTipo = p.escala === 'log' ? 'log' : 'lineal';
    const x = crearEscala(dominioPanel(p, tipo), [x0, x1], tipo);
    const filaAlto = lineas.some((l) => l.length > 1) ? LIENZO.filaAltoDoble : LIENZO.filaAlto;
    const arriba = y;
    const yEje = arriba + p.filas.length * filaAlto + LIENZO.ejeSep;
    if (dibujable(p.referencia, tipo)) {
      const cx = x.mapear(p.referencia);
      cuerpo.push(`<line class="bio-svg__ref" x1="${co(cx)}" y1="${co(arriba)}" x2="${co(cx)}" y2="${co(yEje)}" />`);
    }
    p.filas.forEach((f, i) => {
      cuerpo.push(filaSvg(f, lineas[i], arriba + i * filaAlto + filaAlto / 2, x, columna.ancho));
    });
    cuerpo.push(ejeSvg(x, yEje, ticks(x.dominio, x.tipo), op.fmt, pistaEje(p.pista, tipo)));
    y = yEje + LIENZO.ejeAlto;
  });

  return lienzoSvg(id, g.titulo, g.resumen, ancho, y, cuerpo.join(''));
}

// ---------------------------------------------------------------------------
// fagan
// ---------------------------------------------------------------------------

/** Marcas de los ejes exteriores, en proporción; simétricas en logit. */
const FAGAN_TICKS_P = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 0.98, 0.99, 0.995, 0.998, 0.999,
];

/** Marcas del eje central (razón de verosimilitud). */
const FAGAN_TICKS_LR = [0.001, 0.01, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100, 1000];

/** Rótulo de una probabilidad: «0.1 %» si tiene decimales, «50 %» si no. */
function rotuloProbabilidad(p: number, fmt: Formateador): string {
  const pc = p * 100;
  return fmt.num(p, Math.abs(pc - Math.round(pc)) < 1e-9 ? 'pct0' : 'pct1');
}

/**
 * Nomograma de Fagan (1975). Los ejes exteriores van en sentidos OPUESTOS: la
 * preprueba crece hacia abajo y la posprueba hacia arriba. Solo así la escala
 * central del LR es fija y la recta que une preprueba con posprueba corta el eje
 * central exactamente en el valor del LR:
 *
 *   yPre(p)  = T + ((log10(momios(p)) + 3) / 6) · H
 *   yPost(p) = T + ((3 − log10(momios(p))) / 6) · H
 *   yLr(v)   = T + ((6 − log10(v)) / 12) · H        ← punto medio de las dos
 *
 * Cada resultado se identifica en una LEYENDA bajo los ejes, no con un rótulo
 * junto al punto de posprueba: con dos o más rectas los rótulos chocan entre sí
 * y con las marcas de porcentaje del eje derecho (a 520 unidades de ancho no
 * caben «Resultado positivo: 87.9 %» y «99.5 %» en la misma banda), mientras que
 * la leyenda siempre cabe y además puede mostrar el LR, que de otro modo solo se
 * leería por dónde cruza la recta.
 */
function fagan(g: GraficaFagan, op: OpcionesGrafica): string {
  const ancho = op.ancho ?? ANCHO_POR_DEFECTO;
  const id = op.id ?? 'bio-grafica';
  const fmt = op.fmt;
  const T = LIENZO.faganSup;
  const H = LIENZO.faganAlto;
  const B = T + H;

  const rotulosP = FAGAN_TICKS_P.map((p) => rotuloProbabilidad(p, fmt));
  const anchoRotulo = Math.max(...rotulosP.map((t) => anchoTexto(t, LIENZO.fuenteFagan)));
  const xIzq = Math.round(anchoRotulo + LIENZO.faganCanal);
  const xDer = ancho - xIzq;
  const xCen = (xIzq + xDer) / 2;

  const momios = (p: number): number => p / (1 - p);
  // Sin recorte: la recta debe cortar el eje central exactamente en el LR, y
  // eso solo se cumple con los tres puntos en su sitio verdadero. Lo que se
  // sale de los ejes (preprueba o posprueba más allá de 0.1 %–99.9 %) se oculta
  // con un `clipPath`, no moviendo el extremo, que cambiaría la pendiente.
  const yPre = (p: number): number => T + ((Math.log10(momios(p)) + 3) / 6) * H;
  const yPost = (p: number): number => T + ((3 - Math.log10(momios(p))) / 6) * H;
  const yLr = (v: number): number => T + ((6 - Math.log10(v)) / 12) * H;

  const cuerpo: string[] = [];
  for (const x of [xIzq, xCen, xDer]) {
    cuerpo.push(`<line class="bio-svg__fagan-eje" x1="${co(x)}" y1="${co(T)}" x2="${co(x)}" y2="${co(B)}" />`);
  }
  FAGAN_TICKS_P.forEach((p, i) => {
    const rotulo = esc(rotulosP[i]);
    const y1 = yPre(p);
    const y2 = yPost(p);
    cuerpo.push(
      `<line class="bio-svg__fagan-tick" x1="${co(xIzq - LIENZO.faganTick)}" y1="${co(y1)}" x2="${co(xIzq)}" y2="${co(y1)}" />`,
      `<text class="bio-svg__fagan-tick-texto" font-size="${LIENZO.fuenteFagan}" x="${co(xIzq - LIENZO.faganTick - 4)}" y="${co(y1)}" text-anchor="end" dominant-baseline="middle">${rotulo}</text>`,
      `<line class="bio-svg__fagan-tick" x1="${co(xDer)}" y1="${co(y2)}" x2="${co(xDer + LIENZO.faganTick)}" y2="${co(y2)}" />`,
      `<text class="bio-svg__fagan-tick-texto" font-size="${LIENZO.fuenteFagan}" x="${co(xDer + LIENZO.faganTick + 4)}" y="${co(y2)}" dominant-baseline="middle">${rotulo}</text>`,
    );
  });
  // El eje central comprime doce décadas en medio lienzo, así que 0.1–10 caen
  // casi encima unas de otras: los rótulos se reparten alternando lado (el doble
  // de sitio para cada uno) y se omite el que aun así quedaría pegado al
  // anterior de su lado. La marca, en cambio, se dibuja siempre.
  // Los rótulos del eje central se acumulan aparte: se pintan al final, porque
  // las rectas cruzan justo por ahí y taparían los números.
  const rotulosLr: string[] = [];
  const ultimoRotulo = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  FAGAN_TICKS_LR.forEach((v, i) => {
    const y = yLr(v);
    cuerpo.push(
      `<line class="bio-svg__fagan-tick" x1="${co(xCen - LIENZO.faganTick)}" y1="${co(y)}" x2="${co(xCen + LIENZO.faganTick)}" y2="${co(y)}" />`,
    );
    const lado = i % 2;
    if (Math.abs(y - ultimoRotulo[lado]) < LIENZO.fuenteFagan) return;
    ultimoRotulo[lado] = y;
    const derecha = lado === 0;
    // Seis unidades de aire: el punto del LR (radio 4) cae sobre el eje y no debe
    // rozar el número.
    const x = derecha ? xCen + LIENZO.faganTick + 6 : xCen - LIENZO.faganTick - 6;
    rotulosLr.push(
      `<text class="bio-svg__fagan-tick-texto" font-size="${LIENZO.fuenteFagan}" x="${co(x)}" y="${co(y)}"${derecha ? '' : ' text-anchor="end"'} dominant-baseline="middle">${esc(fmt.num(v, 'sig3'))}</text>`,
    );
  });
  const titulos: Array<[number, string]> = [
    [xIzq, g.ejes.pre],
    [xCen, g.ejes.lr],
    [xDer, g.ejes.post],
  ];
  for (const [x, texto] of titulos) {
    cuerpo.push(
      `<text class="bio-svg__fagan-titulo" font-size="${LIENZO.fuenteTick}" x="${co(x)}" y="${co(T - 16)}" text-anchor="middle">${esc(texto)}</text>`,
    );
  }

  const preValida = Number.isFinite(g.pre) && g.pre > 0 && g.pre < 1;
  const entradas: EntradaLeyenda[] = [];
  const recorte = `${id}-fagan-rec`;
  const margenRec = LIENZO.faganPunto + 1;
  cuerpo.push(
    `<clipPath id="${esc(recorte)}"><rect x="0" y="${co(T - margenRec)}" width="${co(ancho)}" height="${co(H + 2 * margenRec)}" /></clipPath>`,
  );
  const rectas: string[] = [];
  let secundarias = 0;
  for (const l of g.lineas) {
    if (!preValida) break;
    if (!Number.isFinite(l.lr) || l.lr <= 0) continue;
    if (!Number.isFinite(l.post) || l.post <= 0 || l.post >= 1) continue;
    const indice = secundarias;
    const clase = claseSerie('bio-svg__fagan-linea', l.destacada, indice);
    const clasePunto = claseSerie('bio-svg__fagan-punto', l.destacada, indice);
    if (!l.destacada) secundarias += 1;
    const y1 = yPre(g.pre);
    const y2 = yLr(l.lr);
    const y3 = yPost(l.post);
    rectas.push(
      `<line class="${clase}" x1="${co(xIzq)}" y1="${co(y1)}" x2="${co(xDer)}" y2="${co(y3)}" />`,
      `<circle class="${clasePunto}" cx="${co(xIzq)}" cy="${co(y1)}" r="${LIENZO.faganPunto}" />`,
      `<circle class="${clasePunto}" cx="${co(xCen)}" cy="${co(y2)}" r="${LIENZO.faganPunto}" />`,
      `<circle class="${clasePunto}" cx="${co(xDer)}" cy="${co(y3)}" r="${LIENZO.faganPunto}" />`,
    );
    entradas.push({
      clase: claseSerie('bio-svg__leyenda', l.destacada, indice),
      texto: `${l.etiqueta}: LR ${fmt.num(l.lr, 'lr')} · ${fmt.num(l.post, 'pct1')}`,
    });
  }
  if (rectas.length > 0) cuerpo.push(`<g clip-path="url(#${esc(recorte)})">${rectas.join('')}</g>`);
  cuerpo.push(...rotulosLr);
  const leyenda = leyendaSvg(entradas, ancho, B + LIENZO.faganLeyendaSep, 'bio-svg__fagan-rotulo');
  cuerpo.push(leyenda.svg);
  const alto = B + LIENZO.faganLeyendaSep + leyenda.alto + 6;

  return lienzoSvg(id, g.titulo, g.resumen, ancho, alto, cuerpo.join(''));
}

// ---------------------------------------------------------------------------
// curvas
// ---------------------------------------------------------------------------

/** Dominio lineal declarado por un eje, saneado (ordenado y nunca degenerado). */
function dominioEje(e: EjeGrafica): [number, number] {
  const d0 = e.dominio && Number.isFinite(e.dominio[0]) ? e.dominio[0] : 0;
  const d1 = e.dominio && Number.isFinite(e.dominio[1]) ? e.dominio[1] : 1;
  if (d0 === d1) {
    const holgura = Math.abs(d0) || 1;
    return [d0 - holgura / 2, d1 + holgura / 2];
  }
  return d0 < d1 ? [d0, d1] : [d1, d0];
}

/**
 * Interpola linealmente la y de una curva en x. Devuelve `undefined` si x cae
 * fuera de la polilínea o si el tramo que la contiene no es finito.
 */
function interpolar(puntos: Array<[number, number]>, x: number): number | undefined {
  let previo: [number, number] | undefined;
  for (const punto of puntos) {
    if (!Number.isFinite(punto[0]) || !Number.isFinite(punto[1])) {
      previo = undefined;
      continue;
    }
    if (punto[0] === x) return punto[1];
    if (previo && ((previo[0] < x && x < punto[0]) || (punto[0] < x && x < previo[0]))) {
      const t = (x - previo[0]) / (punto[0] - previo[0]);
      return previo[1] + t * (punto[1] - previo[1]);
    }
    previo = punto;
  }
  return undefined;
}

/** Tramos de polilínea en coordenadas del lienzo; los puntos no finitos la parten. */
function tramos(c: Curva, ex: Escala, ey: Escala): string[] {
  const salida: string[][] = [];
  let actual: string[] = [];
  for (const punto of c.puntos ?? []) {
    if (!Number.isFinite(punto[0]) || !Number.isFinite(punto[1])) {
      if (actual.length > 1) salida.push(actual);
      actual = [];
      continue;
    }
    actual.push(`${co(ex.mapear(punto[0]))},${co(ey.mapear(punto[1]))}`);
  }
  if (actual.length > 1) salida.push(actual);
  return salida.map((t) => t.join(' '));
}

/**
 * Curvas frente a una variable continua (VPP y VPN frente a la prevalencia, por
 * ejemplo), con leyenda arriba y marcador vertical opcional.
 *
 * El título del eje y va arriba a la izquierda, en horizontal: un texto rotado
 * 90° es más difícil de leer y obligaría a reservar una columna entera.
 */
function curvas(g: GraficaCurvas, op: OpcionesGrafica): string {
  const ancho = op.ancho ?? ANCHO_POR_DEFECTO;
  const id = op.id ?? 'bio-grafica';
  const fmt = op.fmt;
  const dx = dominioEje(g.ejeX);
  const dy = dominioEje(g.ejeY);
  const marcasX = ticksLineales(dx[0], dx[1], 5);
  const marcasY = ticksLineales(dy[0], dy[1], 4);
  const rotulosY = marcasY.map((v) => fmt.num(v, g.ejeY.pista));
  const anchoY = Math.max(...rotulosY.map((t) => anchoTexto(t, LIENZO.fuenteTick)), 0);
  const x0 = Math.round(anchoY + LIENZO.canal);
  const x1 = ancho - LIENZO.margenDer;

  let secundarias = 0;
  const series = g.curvas.map((c) => {
    const clase = claseSerie('bio-svg__curva', c.destacada, secundarias);
    const claseLeyenda = claseSerie('bio-svg__leyenda', c.destacada, secundarias);
    const clasePunto = claseSerie('bio-svg__marcador-punto', c.destacada, secundarias);
    if (!c.destacada) secundarias += 1;
    return { curva: c, clase, claseLeyenda, clasePunto };
  });

  const yTitulo = LIENZO.fuenteTick + 2;
  const y0Leyenda = yTitulo + 6;
  const leyenda = leyendaSvg(
    series.map((s) => ({ clase: s.claseLeyenda, texto: s.curva.etiqueta })),
    ancho,
    y0Leyenda,
    'bio-svg__leyenda-texto',
  );
  // El rótulo del marcador vive en su propia banda, sobre el área de trazado:
  // dentro chocaría con la curva que pase cerca del techo.
  const m = g.marcador && Number.isFinite(g.marcador.x) ? g.marcador : undefined;
  const bandaMarcador = m && m.etiqueta ? LIENZO.marcadorAlto : 0;
  const arriba = y0Leyenda + leyenda.alto + 8 + bandaMarcador;
  const abajo = arriba + LIENZO.curvasAlto;
  const alto = abajo + LIENZO.ejeAlto + LIENZO.tituloEjeAlto;
  const ex = crearEscala(dx, [x0, x1]);
  const ey = crearEscala(dy, [abajo, arriba]);

  const cuerpo: string[] = [
    `<text class="bio-svg__eje-titulo" font-size="${LIENZO.fuenteTick}" x="0" y="${co(yTitulo)}">${esc(g.ejeY.etiqueta)}</text>`,
    leyenda.svg,
    `<line class="bio-svg__eje" x1="${co(x0)}" y1="${co(arriba)}" x2="${co(x0)}" y2="${co(abajo)}" />`,
    `<line class="bio-svg__eje" x1="${co(x0)}" y1="${co(abajo)}" x2="${co(x1)}" y2="${co(abajo)}" />`,
  ];
  marcasY.forEach((v, i) => {
    const cy = ey.mapear(v);
    cuerpo.push(
      `<line class="bio-svg__tick" x1="${co(x0 - LIENZO.tickLargo)}" y1="${co(cy)}" x2="${co(x0)}" y2="${co(cy)}" />`,
      `<text class="bio-svg__tick-texto" font-size="${LIENZO.fuenteTick}" x="${co(x0 - LIENZO.tickLargo - 4)}" y="${co(cy)}" text-anchor="end" dominant-baseline="middle">${esc(rotulosY[i])}</text>`,
    );
  });
  for (const v of marcasX) {
    const cx = ex.mapear(v);
    cuerpo.push(
      `<line class="bio-svg__tick" x1="${co(cx)}" y1="${co(abajo)}" x2="${co(cx)}" y2="${co(abajo + LIENZO.tickLargo)}" />`,
      `<text class="bio-svg__tick-texto" font-size="${LIENZO.fuenteTick}" x="${co(cx)}" y="${co(abajo + LIENZO.tickTexto)}" text-anchor="middle">${esc(fmt.num(v, g.ejeX.pista))}</text>`,
    );
  }
  cuerpo.push(
    `<text class="bio-svg__eje-titulo" font-size="${LIENZO.fuenteTick}" x="${co((x0 + x1) / 2)}" y="${co(alto - 4)}" text-anchor="middle">${esc(g.ejeX.etiqueta)}</text>`,
  );

  const recorte = `${id}-rec`;
  const defs =
    `<clipPath id="${esc(recorte)}"><rect x="${co(x0 - 5)}" y="${co(arriba - 5)}" width="${co(x1 - x0 + 10)}" height="${co(abajo - arriba + 10)}" /></clipPath>`;
  const dentro: string[] = [];
  for (const s of series) {
    for (const puntos of tramos(s.curva, ex, ey)) {
      dentro.push(`<polyline class="${s.clase}" points="${puntos}" />`);
    }
  }

  if (m) {
    const cx = ex.mapear(m.x);
    cuerpo.push(
      `<line class="bio-svg__marcador" x1="${co(cx)}" y1="${co(arriba)}" x2="${co(cx)}" y2="${co(abajo)}" />`,
    );
    if (m.etiqueta) {
      const derecha = cx > (x0 + x1) / 2;
      cuerpo.push(
        `<text class="bio-svg__marcador-texto" font-size="${LIENZO.fuenteTick}" x="${co(derecha ? cx - 5 : cx + 5)}" y="${co(arriba - 5)}"${derecha ? ' text-anchor="end"' : ''}>${esc(m.etiqueta)}</text>`,
      );
    }
    for (const s of series) {
      const declarado = m.valores ? m.valores[s.curva.id] : undefined;
      const y = typeof declarado === 'number' && Number.isFinite(declarado)
        ? declarado
        : interpolar(s.curva.puntos ?? [], m.x);
      if (y === undefined || !Number.isFinite(y)) continue;
      dentro.push(
        `<circle class="${s.clasePunto}" cx="${co(cx)}" cy="${co(ey.mapear(y))}" r="${LIENZO.punto}" />`,
      );
    }
  }
  cuerpo.push(`<g clip-path="url(#${esc(recorte)})">${dentro.join('')}</g>`);

  return lienzoSvg(id, g.titulo, g.resumen, ancho, alto, cuerpo.join(''), defs);
}

/** Convierte la descripción declarativa de una gráfica en SVG. */
export function renderGrafica(g: DatosGrafica, op: OpcionesGrafica): string {
  switch (g.tipo) {
    case 'ic-forest':
      return forestIC(g, op);
    case 'fagan':
      return fagan(g, op);
    case 'curvas':
      return curvas(g, op);
    default:
      throw new Error(`svg: tipo de gráfica no soportado «${String((g as { tipo: string }).tipo)}»`);
  }
}
