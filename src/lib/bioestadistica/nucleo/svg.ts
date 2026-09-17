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
 * Las primitivas de escala y de ejes son genéricas (lineal y logarítmica) para
 * las gráficas que faltan (fagan, barras, km, potencia); aquí solo se dibuja
 * `ic-forest`, la única que la especificación declara por ahora.
 */
import type { DatosGrafica, FilaIC, Formateador, Pista } from './tipos.ts';

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

/**
 * Dominio efectivo: el declarado por la calculadora, AMPLIADO si alguna
 * estimación o algún extremo de intervalo se sale de él. Wald y Agresti-Coull
 * pueden salirse de [0, 1] y eso es justo lo que hay que ver.
 */
function dominioEfectivo(g: DatosGrafica): [number, number] {
  let d0 = g.dominio ? g.dominio[0] : Number.POSITIVE_INFINITY;
  let d1 = g.dominio ? g.dominio[1] : Number.NEGATIVE_INFINITY;
  const considerar = (v: number | undefined): void => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v < d0) d0 = v;
      if (v > d1) d1 = v;
    }
  };
  for (const f of g.filas) {
    considerar(f.valor);
    considerar(f.lo);
    considerar(f.hi);
  }
  considerar(g.referencia);
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) return [0, 1];
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
  const lo = typeof f.lo === 'number' && Number.isFinite(f.lo) ? f.lo : undefined;
  const hi = typeof f.hi === 'number' && Number.isFinite(f.hi) ? f.hi : undefined;
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
  if (Number.isFinite(f.valor)) {
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

/** Gráfica de bosque: una fila por método, con su estimación y su intervalo. */
function forestIC(g: DatosGrafica, op: OpcionesGrafica): string {
  const ancho = op.ancho ?? ANCHO_POR_DEFECTO;
  const id = op.id ?? 'bio-grafica';
  const etiquetas = columnaEtiquetas(g.filas, ancho);
  const x0 = etiquetas.ancho + LIENZO.canal;
  const x1 = ancho - LIENZO.margenDer;
  const n = g.filas.length;
  const filaAlto = etiquetas.lineas.some((l) => l.length > 1) ? LIENZO.filaAltoDoble : LIENZO.filaAlto;
  const yEje = LIENZO.margenSup + n * filaAlto + LIENZO.ejeSep;
  const alto = yEje + LIENZO.ejeAlto;
  const x = crearEscala(dominioEfectivo(g), [x0, x1], g.escala === 'log' ? 'log' : 'lineal');

  const cuerpo: string[] = [];
  if (typeof g.referencia === 'number' && Number.isFinite(g.referencia)) {
    const cx = x.mapear(g.referencia);
    cuerpo.push(
      `<line class="bio-svg__ref" x1="${co(cx)}" y1="${co(LIENZO.margenSup)}" x2="${co(cx)}" y2="${co(yEje)}" />`,
    );
  }
  g.filas.forEach((f, i) => {
    const cy = LIENZO.margenSup + i * filaAlto + filaAlto / 2;
    cuerpo.push(filaSvg(f, etiquetas.lineas[i], cy, x, etiquetas.ancho));
  });
  cuerpo.push(ejeSvg(x, yEje, ticks(x.dominio, x.tipo), op.fmt, g.pista));

  return (
    `<svg class="bio-svg" role="img" aria-labelledby="${esc(id)}-t ${esc(id)}-d"` +
    ` viewBox="0 0 ${co(ancho)} ${co(alto)}" xmlns="http://www.w3.org/2000/svg">` +
    `<title id="${esc(id)}-t">${esc(g.titulo)}</title>` +
    `<desc id="${esc(id)}-d">${esc(g.resumen)}</desc>` +
    cuerpo.join('') +
    '</svg>'
  );
}

/** Convierte la descripción declarativa de una gráfica en SVG. */
export function renderGrafica(g: DatosGrafica, op: OpcionesGrafica): string {
  switch (g.tipo) {
    case 'ic-forest':
      return forestIC(g, op);
    default:
      throw new Error(`svg: tipo de gráfica no soportado «${String((g as { tipo: string }).tipo)}»`);
  }
}
