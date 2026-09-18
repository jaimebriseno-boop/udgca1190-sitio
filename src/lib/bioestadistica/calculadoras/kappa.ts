/**
 * Calculadora D1 · Kappa de Cohen, simple y ponderada, sobre una tabla k×k.
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/kappa.yml.
 *
 * Es la primera calculadora cuya entrada principal es una tabla (`tipo: tabla`):
 * `x` llega como la lista plana de los k² conteos por filas, `derivar()` calcula
 * k con √(x.length) y el snippet de R la rearma con `matrix(x, nrow = k,
 * byrow = TRUE)`.
 */
import type {
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  FilaIC,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { bandaKappa } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import {
  KAPPA_PARADOJA,
  K_MAX,
  K_MIN,
  N_PEQUENO,
  PONDERACIONES,
  PO_PARADOJA,
  SALIDAS_KAPPA,
  categoriasVacias,
  comoMatriz,
  kappaCohen,
  ladoTabla,
  reducir,
} from '../metodos/kappa.ts';
import type { Ponderacion } from '../metodos/kappa.ts';

export interface EntradasKappa extends Entradas {
  /** Tabla k×k de conteos, por filas: filas = evaluador A, columnas = evaluador B. */
  x: number[];
  /** Lado de la tabla; lo pone `derivar()`, no el usuario. */
  k: number;
  ponderacion: Ponderacion;
  nivel: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_KAPPA;

/** Celda de una medida que no procede calcular (no es «no definido»: es que no aplica). */
const SIN_VALOR = '—';

export function calcular(e: EntradasKappa, nivel: number): Resultado<'kappa'> {
  const r = kappaCohen(e.x, { nivel, ponderacion: e.ponderacion });
  const v = r.valores;
  const n = v.n.valor;
  const po = v.po.valor;
  const kappa = v.kappa.valor;
  const dos = r.k === 2;

  // La paradoja de kappa: acuerdo observado alto y κ baja porque una categoría
  // concentra casi todos los casos y el acuerdo esperado por azar se dispara.
  const paradoja = po >= PO_PARADOJA && kappa < KAPPA_PARADOJA;

  const avisos: Resultado['avisos'] = [];
  if (r.vacias.length > 0) avisos.push({ codigo: 'categoria_vacia', severidad: 'aviso', params: { k: r.k } });
  // Sin parámetros a propósito. `Aviso.params` viaja desde `calcular()`, que no
  // conoce el idioma ni el formateador, así que una proporción cruda saldría
  // «0.85» donde la celda publica «85.0 %». Las cifras las da `paradoja.si` en
  // la interpretación, que sí pasa por `fmt`. Los otros avisos solo llevan
  // enteros (`k`, `n`), que se escriben igual por los dos caminos.
  if (paradoja) avisos.push({ codigo: 'paradoja', severidad: 'aviso' });
  if (e.ponderacion !== 'ninguna') avisos.push({ codigo: 'ponderada_ordinal', severidad: 'info' });
  if (n < N_PEQUENO) avisos.push({ codigo: 'n_pequeno', severidad: 'aviso', params: { n } });
  // Los cortes de Landis y Koch se citan siempre con su advertencia: son una
  // convención de 1977, no un umbral de validez.
  avisos.push({ codigo: 'cortes', severidad: 'info' });

  return {
    calculadora: 'kappa',
    version: 1,
    entradas: { x: e.x, k: e.k, ponderacion: e.ponderacion, nivel },
    valores: { ...v },
    bandas: {
      landis: bandaKappa(kappa),
      paradoja: paradoja ? 'si' : 'no',
      k2: dos ? 'si' : 'no',
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasKappa, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const v = s.valores;
  const nivel = v.kappa.nivel ?? ctx.nivel;
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });
  const dos = s.bandas.k2 === 'si';
  const ponderacion = e.ponderacion;
  // La tabla ya reducida: k efectiva (no la capturada) y, sobre todo, en
  // cuántos casos coincidieron EXACTAMENTE los evaluadores. Con ponderación,
  // `po` incluye el crédito parcial de las categorías vecinas, así que decir
  // «coincidieron en {po}» sería falso: el ejemplo da 86.5 % ponderado frente a
  // 76 de 100 exactos.
  const reducida = reducir(e.x);
  const k = reducida.k;
  const poDiagonal = reducida.exactos / reducida.n;

  const vars: Record<string, string | number> = {
    n: fmt.entero(v.n.valor),
    k: fmt.entero(k),
    nivel: fmt.nivel(nivel),
    po: fmt.num(v.po.valor, 'pct1'),
    po_diagonal: fmt.num(poDiagonal, 'pct1'),
    pe: fmt.num(v.pe.valor, 'pct1'),
    kappa: fmt.num(v.kappa.valor, 'dec2'),
    kappa_ic: fmt.ic(v.kappa.ic, 'dec2'),
    ee: fmt.num(v.ee.valor, 'dec4'),
    z_h0: fmt.num(v.z_h0.valor, 'dec2'),
    p_h0: fmt.num(v.p_h0.valor, 'p'),
    kappa_max: fmt.num(v.kappa_max.valor, 'dec2'),
    pabak: fmt.num(v.pabak.valor, 'dec2'),
    indice_prevalencia: fmt.num(v.indice_prevalencia.valor, 'dec2'),
    indice_sesgo: fmt.num(v.indice_sesgo.valor, 'dec2'),
    banda: textos.etiquetas[`banda_${s.bandas.landis}`] as string,
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  // Con `ctx.refs` porque la frase ponderada cita a Cohen 1968, que es de donde
  // salen los pesos: sin ponderar esa cita no viene a cuento y no se escribe.
  vars.ponderacion_frase = rellenar(
    textos.interpretacion[`metodos_ponderacion.${ponderacion}`] as string,
    vars,
    ctx.refs,
  );
  vars.frase_byrt = rellenar(textos.interpretacion[`metodos_byrt.${dos ? 'si' : 'no'}`] as string, vars, ctx.refs);

  const notaPonderacion = textos.etiquetas[`ponderacion.${ponderacion}`] as string;
  const soloDos = { valor: SIN_VALOR, nota: textos.etiquetas.nota_solo_k2 };
  const celdas: Presentacion['celdas'] = {
    n: { valor: fmt.entero(v.n.valor) },
    po: { valor: fmt.num(v.po.valor, 'pct1'), nota: notaPonderacion, clase: 'destacada' },
    pe: { valor: fmt.num(v.pe.valor, 'pct1'), nota: notaPonderacion },
    kappa: {
      valor: fmt.num(v.kappa.valor, 'dec2'),
      ic: fmt.ic(v.kappa.ic, 'dec2'),
      nota: `${icNivel} · ${textos.etiquetas.nota_fce}`,
      clase: 'destacada',
    },
    ee: { valor: fmt.num(v.ee.valor, 'dec4'), nota: textos.etiquetas.nota_fce },
    z_h0: { valor: fmt.num(v.z_h0.valor, 'dec2'), nota: textos.etiquetas.nota_k2 },
    p_h0: { valor: fmt.num(v.p_h0.valor, 'p'), nota: textos.etiquetas.nota_k2 },
    kappa_max: { valor: fmt.num(v.kappa_max.valor, 'dec2'), nota: textos.etiquetas.nota_marginales },
    pabak: dos ? { valor: fmt.num(v.pabak.valor, 'dec2'), nota: textos.etiquetas.nota_byrt, clase: 'destacada' } : soloDos,
    indice_prevalencia: dos
      ? { valor: fmt.num(v.indice_prevalencia.valor, 'dec2'), nota: textos.etiquetas.nota_byrt }
      : soloDos,
    indice_sesgo: dos ? { valor: fmt.num(v.indice_sesgo.valor, 'dec2'), nota: textos.etiquetas.nota_byrt } : soloDos,
  };
  const resumen: Presentacion['resumen'] = SALIDAS.map((clave) => [
    textos.etiquetas[clave] as string,
    (celdas[clave] as Presentacion['celdas'][string]).valor,
    (celdas[clave] as Presentacion['celdas'][string]).ic ?? '',
  ]);

  const interpretacion = [
    rellenar(textos.interpretacion[ponderacion === 'ninguna' ? 'resumen.simple' : 'resumen.ponderada'] as string, vars),
    rellenar(textos.interpretacion[`landis.${s.bandas.landis}`] as string, vars),
    rellenar(textos.interpretacion[`ponderacion.${ponderacion}`] as string, vars),
    rellenar(textos.interpretacion.h0 as string, vars),
    rellenar(textos.interpretacion.maximo as string, vars),
    rellenar(textos.interpretacion[`k2.${dos ? 'si' : 'no'}`] as string, vars),
    rellenar(textos.interpretacion[`paradoja.${s.bandas.paradoja}`] as string, vars),
  ];

  return {
    celdas,
    interpretacion,
    avisos: s.avisos.map((a) => a.codigo),
    metodos: rellenar(textos.metodos, vars, ctx.refs),
    resumen,
    grafica: grafica(s, e, ctx) ?? undefined,
  };
}

export function grafica(s: Resultado, _e: EntradasKappa, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const v = s.valores;
  const dos = s.bandas.k2 === 'si';

  const filas: FilaIC[] = [
    {
      id: 'kappa',
      etiqueta: textos.etiquetas.kappa as string,
      valor: v.kappa.valor,
      lo: v.kappa.ic?.[0],
      hi: v.kappa.ic?.[1],
      destacada: true,
    },
  ];
  // PABAK solo existe con dos categorías; se dibuja al lado de κ para que se
  // vea de un vistazo cuánto la empuja la prevalencia de las categorías.
  if (dos) filas.push({ id: 'pabak', etiqueta: textos.etiquetas.pabak as string, valor: v.pabak.valor });

  // κ vive en [−1, 1], pero con estimaciones positivas medio eje quedaría vacío:
  // el dominio arranca en −0.2 y `svg.ts` lo amplía si algún límite baja de ahí.
  const dibujados = filas.flatMap((f) => [f.valor, f.lo, f.hi].filter((q): q is number => typeof q === 'number'));
  const dominio: [number, number] = dibujados.every((q) => Number.isNaN(q) || q >= 0) ? [-0.2, 1] : [-1, 1];

  const resumen = [
    `${textos.etiquetas.kappa}: ${fmt.num(v.kappa.valor, 'dec2')} (${fmt.ic(v.kappa.ic, 'dec2')})`,
    `${textos.etiquetas.po}: ${fmt.num(v.po.valor, 'pct1')}`,
    `${textos.etiquetas.pe}: ${fmt.num(v.pe.valor, 'pct1')}`,
    ...(dos ? [`${textos.etiquetas.pabak}: ${fmt.num(v.pabak.valor, 'dec2')}`] : []),
  ].join('; ');

  return {
    tipo: 'ic-forest',
    titulo: textos.grafica_titulo ?? (textos.etiquetas.kappa as string),
    resumen,
    filas,
    dominio,
    escala: 'lineal',
    referencia: 0,
    pista: 'dec2',
  };
}

export const definicion: Definicion<EntradasKappa> = {
  id: 'kappa',
  motor: 'ts',
  claves: [
    'resumen.simple',
    'resumen.ponderada',
    'landis.pobre',
    'landis.leve',
    'landis.aceptable',
    'landis.moderado',
    'landis.sustancial',
    'landis.casi_perfecto',
    'h0',
    'maximo',
    'k2.si',
    'k2.no',
    'paradoja.si',
    'paradoja.no',
    'ponderacion.ninguna',
    'ponderacion.lineal',
    'ponderacion.cuadratica',
    'metodos_ponderacion.ninguna',
    'metodos_ponderacion.lineal',
    'metodos_ponderacion.cuadratica',
    'metodos_byrt.si',
    'metodos_byrt.no',
  ],
  avisos: ['categoria_vacia', 'paradoja', 'ponderada_ordinal', 'n_pequeno', 'cortes'],
  salidas: SALIDAS,
  derivar(e) {
    // El control pega la tabla como una lista plana; k es su lado. Si la lista
    // no es un cuadrado perfecto, `NaN` deja que `validar()` lo explique.
    return { k: Array.isArray(e.x) ? ladoTabla(e.x) : Number.NaN };
  },
  validar(e) {
    const err: Record<string, string> = {};
    const x = e.x;
    if (!Array.isArray(x) || !x.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 0)) {
      err.x = 'err_entero';
    } else {
      const k = ladoTabla(x);
      if (!Number.isFinite(k) || k < K_MIN || k > K_MAX) err.x = 'err_tabla_cuadrada';
      else if (x.reduce((suma: number, celda: number) => suma + celda, 0) < 1) err.x = 'err_rango';
      else if (k - categoriasVacias(comoMatriz(x, k)).length < K_MIN) err.x = 'err_rango';
    }
    if (!(PONDERACIONES as readonly string[]).includes(e.ponderacion)) err.ponderacion = 'err_opcion';
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
