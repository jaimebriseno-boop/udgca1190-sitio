/**
 * Calculadora B1 · Medidas de asociación y efecto en una tabla 2×2
 * (RR, OR, RRA, RRR, NNT).
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/efecto-2x2.yml.
 */
import type {
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  Estimacion,
  FilaIC,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { direccionNnt, icCruzaNulo } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { DISENOS, METODOS_RRA, SALIDAS_EFECTO, efecto2x2, hayCeldaCero } from '../metodos/efecto.ts';
import type { Diseno, MetodoRra } from '../metodos/efecto.ts';
import { CORRECCIONES } from '../metodos/razones.ts';
import type { Correccion } from '../metodos/razones.ts';

export interface EntradasEfecto2x2 extends Entradas {
  a: number;
  b: number;
  c: number;
  d: number;
  /** Diseño del estudio (selector): solo cambia la lectura, no los cálculos. */
  diseno: string;
  /** Método del IC de la RRA (selector): 'newcombe' | 'wald'. */
  metodo_rra: string;
  /** 0 | 0.5 (Haldane-Anscombe), solo para RR y OR. */
  corr: number;
  nivel: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_EFECTO;
export const CELDAS = ['a', 'b', 'c', 'd'] as const;

/** Riesgos de cada grupo: celdas en %, IC de Wilson. */
const RIESGOS = ['p1', 'p0'] as const;
/** Razones (RR, OR): pista `lr`, IC logarítmico o «no definido». */
const RAZONES = ['rr', 'or'] as const;
/** Reducción relativa: se lee como porcentaje, igual que los riesgos. */
const RELATIVAS = ['rrr'] as const;
/** Medidas que un diseño de casos y controles no permite interpretar. */
const SOLO_CON_RIESGOS = ['rr', 'rra', 'rrr', 'nnt'] as const;

function esDiseno(v: unknown): v is Diseno {
  return typeof v === 'string' && (DISENOS as readonly string[]).includes(v);
}

function esMetodoRra(v: unknown): v is MetodoRra {
  return typeof v === 'string' && (METODOS_RRA as readonly string[]).includes(v);
}

function esCorreccion(c: unknown): c is Correccion {
  return typeof c === 'number' && (CORRECCIONES as readonly number[]).includes(c);
}

export function calcular(e: EntradasEfecto2x2, nivel: number): Resultado<'efecto-2x2'> {
  const { a, b, c, d } = e;
  const diseno: Diseno = esDiseno(e.diseno) ? e.diseno : 'cohorte';
  const metodoRra: MetodoRra = esMetodoRra(e.metodo_rra) ? e.metodo_rra : 'newcombe';
  const corr: Correccion = esCorreccion(e.corr) ? e.corr : 0;
  const v = efecto2x2(a, b, c, d, { nivel, metodoRra, corr });

  const n1 = a + b;
  const n0 = c + d;
  const avisos: Resultado['avisos'] = [];
  if (hayCeldaCero(a, b, c, d) && corr === 0) avisos.push({ codigo: 'celda_cero', severidad: 'aviso' });
  if (corr === 0.5) avisos.push({ codigo: 'haldane_aplicado', severidad: 'info' });
  if (v.p0.valor === 0) avisos.push({ codigo: 'p0_cero', severidad: 'aviso' });
  if (v.p0.valor > 0.1 && diseno !== 'casos_controles') {
    avisos.push({ codigo: 'or_no_aproxima_rr', severidad: 'info' });
  }
  if (n1 < 10 || n0 < 10) {
    avisos.push({ codigo: 'n_pequeno', severidad: 'aviso', params: { expuestos: n1, no_expuestos: n0 } });
  }
  if (diseno === 'casos_controles') avisos.push({ codigo: 'casos_controles', severidad: 'info' });
  if (icCruzaNulo(v.rra.ic, 0)) avisos.push({ codigo: 'rra_cruza_cero', severidad: 'info' });

  return {
    calculadora: 'efecto-2x2',
    version: 1,
    entradas: { a, b, c, d, diseno, metodo_rra: metodoRra, corr, nivel },
    valores: { ...v },
    bandas: {
      direccion: direccionNnt(v.rra.valor),
      nnt: icCruzaNulo(v.rra.ic, 0) ? 'cruza' : 'excluye',
      rr: icCruzaNulo(v.rr.ic, 1) ? 'cruza' : 'excluye',
      diseno,
    },
    avisos,
  };
}

/** ¿El intervalo existe y es finito? (las razones con celda 0 quedan sin intervalo). */
function icDefinido(est: Estimacion): est is Estimacion & { ic: [number, number] } {
  return est.ic !== undefined && Number.isFinite(est.ic[0]) && Number.isFinite(est.ic[1]);
}

export function presentar(s: Resultado, e: EntradasEfecto2x2, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const { a, b, c, d } = e;
  const nivel = s.valores.p1.nivel ?? ctx.nivel;
  const diseno: Diseno = esDiseno(e.diseno) ? e.diseno : 'cohorte';
  const metodoRra: MetodoRra = esMetodoRra(e.metodo_rra) ? e.metodo_rra : 'newcombe';
  const corr: Correccion = esCorreccion(e.corr) ? e.corr : 0;
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });
  const soloOr = diseno === 'casos_controles';

  /** «IC 95 %: 0.22 a 0.74» o «IC no definido». */
  const icRazon = (est: Estimacion, pista: 'lr' | 'pct1'): string =>
    icDefinido(est) ? `${icNivel}: ${fmt.ic(est.ic, pista)}` : ui.sin_ic;

  /** La diferencia absoluta se lee en puntos porcentuales: ×100 sin el signo %. */
  const puntos = (x: number): string => fmt.num(x * 100, 'dec1');
  const puntosIc = (ic: [number, number] | undefined): string =>
    ic ? fmt.ic([ic[0] * 100, ic[1] * 100], 'dec1') : ui.sin_ic;

  /**
   * Intervalo del NNT. Cuando el de la RRA cruza el 0, sus dos recíprocos no
   * son los extremos de un intervalo: son las ramas de la notación de Altman
   * (1998) «NNTB x a ∞ a NNTH y». El límite negativo de la RRA es el beneficio
   * y el positivo, el daño; los números almacenados no cambian.
   */
  const rraIc = s.valores.rra.ic as [number, number];
  const icNnt = (): string => {
    if (rraIc[0] < 0 && rraIc[1] > 0) {
      return rellenar(textos.etiquetas.nnt_altman, {
        nntb: `${textos.etiquetas.nntb} ${fmt.num(1 / Math.abs(rraIc[0]), 'dec2')}`,
        nnth: `${textos.etiquetas.nnth} ${fmt.num(1 / Math.abs(rraIc[1]), 'dec2')}`,
      });
    }
    return fmt.ic(s.valores.nnt.ic, 'dec2');
  };
  const nntIc = icNnt();

  const metodoRraFrase = rellenar(textos.interpretacion[`metodos_rra.${metodoRra}`], {}, ctx.refs);
  const vars: Record<string, string | number> = {
    a: fmt.entero(a),
    b: fmt.entero(b),
    c: fmt.entero(c),
    d: fmt.entero(d),
    n: fmt.entero(s.valores.n.valor),
    n1: fmt.entero(a + b),
    n0: fmt.entero(c + d),
    nivel: fmt.nivel(nivel),
    // NNT: entero hacia arriba en el titular, valor exacto en el detalle (§0).
    nnt: fmt.entero(Math.ceil(s.valores.nnt.valor)),
    nnt_exacto: fmt.num(s.valores.nnt.valor, 'dec2'),
    nnt_ic: nntIc,
    metodo_rra_frase: metodoRraFrase,
    nota_corr: corr === 0.5 ? ' ' + rellenar(textos.interpretacion.metodos_haldane, {}, ctx.refs) : '',
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  for (const k of [...RIESGOS, ...RELATIVAS] as const) {
    vars[k] = fmt.num(s.valores[k].valor, 'pct1');
  }
  for (const k of RIESGOS) vars[`${k}_ic`] = fmt.ic(s.valores[k].ic, 'pct1');
  // La RRA va en puntos porcentuales, no en %, para no confundirla con la RRR.
  vars.rra = puntos(s.valores.rra.valor);
  vars.rra_ic = puntosIc(s.valores.rra.ic);
  vars.rrr_ic = icRazon(s.valores.rrr, 'pct1');
  for (const k of RAZONES) {
    vars[k] = fmt.num(s.valores[k].valor, 'lr');
    vars[`${k}_ic`] = icRazon(s.valores[k], 'lr');
  }
  // El párrafo de Métodos enumera solo las medidas que el diseño permite estimar
  // y las nombra como corresponde (razón de prevalencias en un transversal).
  vars.frase_medidas = rellenar(textos.interpretacion[`metodos_diseno.${diseno}`], vars, ctx.refs);

  // ---------------------------------------------------------------------
  // Celdas
  // ---------------------------------------------------------------------
  const celdas: Presentacion['celdas'] = { n: { valor: fmt.entero(s.valores.n.valor) } };
  for (const k of RIESGOS) {
    celdas[k] = {
      valor: fmt.num(s.valores[k].valor, 'pct1'),
      ic: fmt.ic(s.valores[k].ic, 'pct1'),
      nota: `${icNivel} · ${textos.etiquetas.nota_wilson}`,
    };
  }
  for (const k of RAZONES) {
    const est = s.valores[k];
    const nota = `${icNivel} · ${textos.etiquetas[k === 'rr' ? 'nota_katz' : 'nota_woolf']}`;
    celdas[k] = icDefinido(est)
      ? { valor: fmt.num(est.valor, 'lr'), ic: fmt.ic(est.ic, 'lr'), nota }
      : { valor: fmt.num(est.valor, 'lr'), nota: ui.sin_ic };
  }
  celdas.or.clase = 'destacada';
  // En puntos porcentuales, igual que la interpretación: la unidad va en la etiqueta.
  celdas.rra = {
    valor: puntos(s.valores.rra.valor),
    ic: puntosIc(s.valores.rra.ic),
    nota: `${icNivel} · ${textos.etiquetas[`metodo_rra.${metodoRra}`]}`,
  };
  celdas.rrr = icDefinido(s.valores.rrr)
    ? {
        valor: fmt.num(s.valores.rrr.valor, 'pct1'),
        ic: fmt.ic(s.valores.rrr.ic, 'pct1'),
        nota: `${icNivel} · ${textos.etiquetas.nota_katz}`,
      }
    : { valor: fmt.num(s.valores.rrr.valor, 'pct1'), nota: ui.sin_ic };
  celdas.nnt = {
    valor: fmt.num(s.valores.nnt.valor, 'dec2'),
    ic: nntIc,
    nota: `${icNivel} · ${textos.etiquetas.nota_altman}`,
  };
  if (!soloOr) celdas.rr.clase = 'destacada';
  // En casos y controles el muestreo fija la proporción de casos: los riesgos no
  // se estiman y con ellos caen RR, RRA, RRR y NNT. Se muestran como «—».
  if (soloOr) {
    for (const k of SOLO_CON_RIESGOS) {
      celdas[k] = { valor: '—', nota: textos.etiquetas.no_aplica };
    }
  }

  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [
    textos.etiquetas[k],
    celdas[k].valor,
    celdas[k].ic ?? '',
  ]);

  // ---------------------------------------------------------------------
  // Interpretación
  // ---------------------------------------------------------------------
  const transversal = diseno === 'transversal';
  const interpretacion = [rellenar(textos.interpretacion[`resumen.${diseno}`], vars)];
  if (!soloOr) {
    // En un transversal el cociente es una razón de prevalencias y el recíproco
    // de la diferencia no se puede leer como «personas que hay que tratar».
    const claveRr = transversal ? `rr.transversal.${s.bandas.rr}` : `rr.${s.bandas.rr}`;
    interpretacion.push(rellenar(textos.interpretacion[claveRr], vars));
  }
  interpretacion.push(rellenar(textos.interpretacion.or, vars));
  if (!soloOr) {
    const claveNnt = transversal
      ? 'nnt.transversal'
      : s.bandas.direccion === 'nulo'
        ? 'nnt.nulo'
        : s.bandas.nnt === 'cruza'
          ? 'nnt.cruza'
          : `nnt.${s.bandas.direccion}.excluye`;
    interpretacion.push(rellenar(textos.interpretacion[claveNnt], vars));
  }

  return {
    celdas,
    interpretacion,
    avisos: s.avisos.map((av) => av.codigo),
    metodos: rellenar(textos.metodos, vars, ctx.refs),
    resumen,
    grafica: grafica(s, e, ctx) ?? undefined,
  };
}

export function grafica(s: Resultado, _e: EntradasEfecto2x2, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  // El rótulo de `rr` en la tabla de resultados es largo a propósito (recuerda
  // la lectura como razón de prevalencias); en la columna de la gráfica se usa
  // la versión corta para que quepa en dos líneas.
  const fila = (k: string, destacada = false, etiqueta?: string): FilaIC => ({
    id: k,
    etiqueta: etiqueta ?? textos.etiquetas[k],
    valor: s.valores[k].valor,
    lo: s.valores[k].ic?.[0],
    hi: s.valores[k].ic?.[1],
    destacada,
  });
  return {
    tipo: 'ic-forest',
    titulo: textos.grafica_titulo ?? textos.etiquetas.rr,
    resumen: `${textos.etiquetas.p1}: ${fmt.num(s.valores.p1.valor, 'pct1')} (${fmt.ic(s.valores.p1.ic, 'pct1')}); ${textos.etiquetas.p0}: ${fmt.num(s.valores.p0.valor, 'pct1')} (${fmt.ic(s.valores.p0.ic, 'pct1')}); ${textos.etiquetas.rr}: ${fmt.num(s.valores.rr.valor, 'lr')}; ${textos.etiquetas.or}: ${fmt.num(s.valores.or.valor, 'lr')}; ${textos.etiquetas.rra}: ${fmt.num(s.valores.rra.valor, 'pct1')}`,
    filas: [fila('p1', true), fila('p0', true)],
    dominio: [0, 1],
    escala: 'lineal',
    pista: 'pct0',
    paneles: [
      {
        rotulo: textos.etiquetas.grafica_razones,
        filas: [fila('rr', true, textos.etiquetas.grafica_rr), fila('or')],
        escala: 'log',
        referencia: 1,
        pista: 'lr',
      },
      {
        rotulo: textos.etiquetas.grafica_diferencia,
        filas: [fila('rra', true, textos.etiquetas.grafica_rra)],
        escala: 'lineal',
        referencia: 0,
        pista: 'pct0',
      },
    ],
  };
}

export const definicion: Definicion<EntradasEfecto2x2> = {
  id: 'efecto-2x2',
  motor: 'ts',
  claves: [
    'resumen.cohorte',
    'resumen.transversal',
    'resumen.casos_controles',
    'rr.excluye',
    'rr.cruza',
    'rr.transversal.excluye',
    'rr.transversal.cruza',
    'or',
    'nnt.beneficio.excluye',
    'nnt.dano.excluye',
    'nnt.cruza',
    'nnt.nulo',
    'nnt.transversal',
    'metodos_rra.newcombe',
    'metodos_rra.wald',
    'metodos_diseno.cohorte',
    'metodos_diseno.transversal',
    'metodos_diseno.casos_controles',
    'metodos_haldane',
  ],
  avisos: [
    'celda_cero',
    'haldane_aplicado',
    'p0_cero',
    'or_no_aproxima_rr',
    'n_pequeno',
    'casos_controles',
    'rra_cruza_cero',
  ],
  salidas: SALIDAS,
  validar(e) {
    const err: Record<string, string> = {};
    for (const k of CELDAS) {
      if (!Number.isInteger(e[k]) || e[k] < 0) err[k] = 'err_entero';
    }
    if (Object.keys(err).length === 0) {
      // Sin denominador no hay riesgo: cada fila (expuestos, no expuestos) debe
      // tener al menos una observación. Una columna vacía sí se admite.
      if (e.a + e.b === 0) err.a = err.b = 'err_fila_vacia';
      if (e.c + e.d === 0) err.c = err.d = 'err_fila_vacia';
    }
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    if (!esDiseno(e.diseno)) err.diseno = 'err_opcion';
    if (!esMetodoRra(e.metodo_rra)) err.metodo_rra = 'err_opcion';
    if (!esCorreccion(e.corr)) err.corr = 'err_opcion';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
