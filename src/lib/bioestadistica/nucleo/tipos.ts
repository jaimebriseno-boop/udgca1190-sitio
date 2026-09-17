/**
 * Tipos públicos de «Bioestadística abierta»: contrato entre la biblioteca
 * numérica (pura), el contenido bilingüe de cada calculadora (YAML validado con
 * Zod en src/content.config.ts), la página Astro y el controlador del navegador.
 *
 * Solo tipos: este módulo no tiene código en tiempo de ejecución. Se comparte
 * entre build (SSR), navegador y `node --test`.
 */

export type Lang = 'es' | 'en';

/**
 * Identificador del método estadístico que produjo una estimación. Cada detalle
 * en el que TypeScript reproduce a R (corrección de continuidad, tipo de IC,
 * cuantil) es un `MetodoId` distinto con su propio caso de fixture.
 */
export type MetodoId =
  | 'puntual'
  // Proporciones
  | 'wilson'
  | 'wilson-cc'
  | 'clopper-pearson'
  | 'agresti-coull'
  | 'jeffreys'
  | 'wald'
  // Razones y diferencias
  | 'log-wald'
  | 'katz'
  | 'woolf'
  | 'simel-log'
  | 'newcombe-hibrido'
  | 'agresti-min'
  | 'logit-mercaldo'
  | 'logit-mercaldo-ajustado'
  | 'delta'
  | 'altman'
  // Pruebas 2×2 y pareadas
  | 'sin-correccion'
  | 'yates'
  | 'n-menos-1'
  | 'fisher-exacto'
  | 'fisher-condicional'
  | 'mcnemar-exacto'
  | 'binomial-exacto'
  | 'edwards'
  // Medias, varianzas y descriptivos
  | 't'
  | 'chi2-varianza'
  | 'cuantil-7'
  | 'joanes-gill'
  | 'shapiro-wilk'
  // Supervivencia y acuerdo
  | 'greenwood-log'
  | 'greenwood-log-log'
  | 'fleiss-cohen-everitt'
  // Tamaño de muestra
  | 'normal'
  | 'fleiss'
  | 'fleiss-cc'
  | 't-no-central'
  | 'buderer'
  | 'fisher-z'
  // Media y DE desde resúmenes
  | 'luo-2018'
  | 'wan-2014'
  | 'hozo-2005';

/** Estimación puntual con intervalo opcional. Nunca redondeada; `Infinity`/`NaN` = «no definido». */
export interface Estimacion {
  valor: number;
  ic?: [number, number];
  nivel?: number;
  metodo: MetodoId;
}

/** Valores de entrada que admite una calculadora (números, cadenas de selector, banderas, columnas). */
export type ValorEntrada = number | string | boolean | number[];
export type Entradas = Record<string, ValorEntrada>;

export interface Aviso {
  /** Clave de `avisos` en el YAML de la calculadora (p. ej. 'wald_invalido'). */
  codigo: string;
  severidad: 'info' | 'aviso' | 'error';
  /** La interfaz los interpola en el texto localizado con {param}. */
  params?: Record<string, number | string>;
}

/**
 * Resultado de una calculadora. Las claves de `valores` son idénticas a las del
 * JSON que imprime el snippet de R y a las de `esperado` en los fixtures: un
 * vector `[est, lo, hi]` en R equivale a `{ valor, ic }` aquí; un escalar en R,
 * a `{ valor }` sin `ic`.
 */
export interface Resultado<C extends string = string> {
  calculadora: C;
  /** Versión del contrato de campos. */
  version: 1;
  entradas: Entradas;
  valores: Record<string, Estimacion>;
  /** Bandas categóricas que eligen la variante de interpretación (p. ej. 'lr_pos' → 'grande'). */
  bandas: Record<string, string>;
  avisos: Aviso[];
}

// ---------------------------------------------------------------------------
// Contenido bilingüe de una calculadora (espejo del esquema Zod de la colección)
// ---------------------------------------------------------------------------

export interface EcuacionTexto {
  id: string;
  /** LaTeX (KaTeX) por idioma, porque las siglas cambian (VPP/PPV). */
  tex: string;
  simbolos: { s: string; def: string }[];
  nota?: string;
}

export interface ContenidoLang {
  titulo: string;
  titulo_corto: string;
  meta: string;
  intro: string;
  explicacion: string[];
  ecuaciones: EcuacionTexto[];
  /** id de entrada/salida → rótulo. */
  etiquetas: Record<string, string>;
  ayudas: Record<string, string>;
  /** clave → plantilla con {var}; las variantes por banda usan `clave.banda`. */
  interpretacion: Record<string, string>;
  /** código de aviso → texto. */
  avisos: Record<string, string>;
  /** Plantilla del párrafo de Métodos para manuscrito ({var} y {ref:key}). */
  metodos: string;
  ejemplo_descripcion: string;
  grafica_titulo?: string;
}

export type TipoEntrada = 'entero' | 'decimal' | 'proporcion' | 'porcentaje' | 'columna' | 'tabla' | 'opcion';

export interface EntradaDef {
  id: string;
  tipo: TipoEntrada;
  min?: number;
  max?: number;
  paso?: number;
  /** Valores admitidos cuando `tipo === 'opcion'`. */
  opciones?: string[];
  requerido: boolean;
  /** Se calcula a partir de otras entradas (totales, prevalencia). */
  derivado: boolean;
}

export type Grupo = 'diagnostico' | 'asociacion' | 'muestra' | 'acuerdo' | 'modelos';
export type Motor = 'ts' | 'webr';
export type TipoGrafica = 'ninguna' | 'ic-forest' | 'fagan' | 'curvas' | 'barras' | 'histograma-boxplot' | 'km' | 'potencia';

// ---------------------------------------------------------------------------
// Formato y presentación
// ---------------------------------------------------------------------------

/**
 * Pistas de formato: `int`, `decN` (N decimales), `sigN` (N cifras
 * significativas), `pctN` (×100, N decimales y signo %), `p` (valor p: tres
 * decimales o «< 0.001»), `lr` (tres cifras significativas; ∞ y «no definido»),
 * `x` (razón con «×»).
 */
export type Pista =
  | 'int'
  | 'dec1' | 'dec2' | 'dec3' | 'dec4'
  | 'sig2' | 'sig3' | 'sig4'
  | 'pct0' | 'pct1' | 'pct2'
  | 'p'
  | 'lr'
  | 'x';

/** Formateador por idioma (Intl es-MX / en-US). Lo crea `nucleo/formato.ts`. */
export interface Formateador {
  lang: Lang;
  /** Número con pista de formato; NaN → «no definido»; ±Infinity → «∞». */
  num(x: number, pista?: Pista): string;
  /** Intervalo «lo a hi» (es) / «lo to hi» (en); sin IC → cadena vacía. */
  ic(ic: [number, number] | undefined, pista?: Pista): string;
  /** Nivel de confianza como porcentaje: 0.95 → «95 %» (es) / «95%» (en). */
  nivel(nivel: number): string;
  /** Entero con separador de miles. */
  entero(x: number): string;
}

export interface Celda {
  valor: string;
  ic?: string;
  /** Nota corta bajo la celda (método, aviso puntual). */
  nota?: string;
  /** Clase semántica opcional: 'destacada' | 'invalida'. */
  clase?: 'destacada' | 'invalida';
}

/** Fila de una gráfica de estimaciones con intervalo. */
export interface FilaIC {
  id: string;
  etiqueta: string;
  valor: number;
  lo?: number;
  hi?: number;
  destacada?: boolean;
}

/**
 * Un panel de bosque: filas con su escala, dominio, referencia y pista de
 * formato. `GraficaForest` es un panel (el principal) que puede llevar otros
 * debajo (`paneles`), p. ej. las proporciones en escala lineal y las razones
 * en escala logarítmica con la referencia en 1.
 */
export interface PanelIC {
  /** Rótulo corto del panel, dibujado sobre sus filas (`titulo` es el de la gráfica entera). */
  rotulo?: string;
  filas: FilaIC[];
  dominio?: [number, number];
  escala?: 'lineal' | 'log';
  /** Valor nulo de referencia (p. ej. 1 para razones); se dibuja como línea. */
  referencia?: number;
  pista?: Pista;
}

interface GraficaBase {
  titulo: string;
  /** Texto alternativo para lectores de pantalla. */
  resumen: string;
}

/** Bosque de estimaciones con intervalo (una fila por medida o por método). */
export interface GraficaForest extends GraficaBase, PanelIC {
  tipo: 'ic-forest';
  /** Paneles adicionales, dibujados debajo del principal, cada uno con su eje. */
  paneles?: PanelIC[];
}

/** Una recta del nomograma de Fagan: preprueba → LR → posprueba. */
export interface LineaFagan {
  id: string;
  etiqueta: string;
  /** Razón de verosimilitud (> 0). */
  lr: number;
  /** Probabilidad posprueba (0–1). */
  post: number;
  destacada?: boolean;
}

/**
 * Nomograma de Fagan (1975): tres ejes verticales (preprueba en escala logit
 * creciente hacia abajo, LR en escala log, posprueba en logit creciente hacia
 * arriba) y una recta por resultado de la prueba.
 */
export interface GraficaFagan extends GraficaBase {
  tipo: 'fagan';
  /** Probabilidad preprueba (0–1). */
  pre: number;
  lineas: LineaFagan[];
  /** Rótulos de los tres ejes en el idioma de la página. */
  ejes: { pre: string; lr: string; post: string };
}

/** Una curva (polilínea) en coordenadas de datos. */
export interface Curva {
  id: string;
  etiqueta: string;
  puntos: Array<[number, number]>;
  destacada?: boolean;
}

export interface EjeGrafica {
  etiqueta: string;
  dominio: [number, number];
  pista?: Pista;
}

/** Curvas frente a una variable continua (p. ej. VPP y VPN frente a la prevalencia), con marcador opcional en x. */
export interface GraficaCurvas extends GraficaBase {
  tipo: 'curvas';
  curvas: Curva[];
  ejeX: EjeGrafica;
  ejeY: EjeGrafica;
  /**
   * Línea vertical en x (p. ej. la prevalencia capturada) con un punto sobre
   * cada curva; `valores` da la y exacta por id de curva (si falta, se
   * interpola sobre la polilínea).
   */
  marcador?: { x: number; etiqueta?: string; valores?: Record<string, number> };
}

/** Una serie de la gráfica de barras (p. ej. «observado» y «esperado»). */
export interface SerieBarras {
  id: string;
  etiqueta: string;
  /** La serie destacada se rellena en navy sólido; las demás, con trama gris (legibles en blanco y negro). */
  destacada?: boolean;
}

/** Una categoría del eje horizontal con un valor por serie, en el orden de `series`. */
export interface CategoriaBarras {
  id: string;
  etiqueta: string;
  valores: number[];
}

/**
 * Barras agrupadas: una categoría por celda o por grupo y una barra por serie
 * dentro de cada categoría (p. ej. frecuencias observadas frente a esperadas
 * en las cuatro celdas de una tabla 2×2, o los pares discordantes b y c).
 */
export interface GraficaBarras extends GraficaBase {
  tipo: 'barras';
  series: SerieBarras[];
  categorias: CategoriaBarras[];
  /** Eje de frecuencias; el dominio declarado se amplía si algún valor lo supera. */
  ejeY: EjeGrafica;
  /** Línea horizontal de referencia (p. ej. el valor esperado bajo H0) con rótulo opcional. */
  referencia?: { valor: number; etiqueta?: string };
}

/** Una clase del histograma: intervalo [desde, hasta) y su frecuencia. */
export interface BinHistograma {
  desde: number;
  hasta: number;
  n: number;
}

/** Resumen de cinco números con bigotes de Tukey y atípicos, en unidades de la variable. */
export interface CajaResumen {
  min: number;
  q1: number;
  mediana: number;
  q3: number;
  max: number;
  /** Extremos de los bigotes (el dato más extremo dentro de las cercas de Tukey; sin datos, min y max). */
  bigoteInf: number;
  bigoteSup: number;
  /** Valores fuera de las cercas, dibujados como puntos. */
  atipicos: number[];
}

/** Marcador vertical sobre el eje x (p. ej. la media, o la media estimada por cada método). */
export interface MarcadorX {
  id: string;
  etiqueta: string;
  x: number;
  destacada?: boolean;
}

/**
 * Histograma con curva normal superpuesta y diagrama de caja debajo, ambos
 * sobre el mismo eje x. Sin `bins` solo se dibujan la caja, la curva normal
 * implícita y los marcadores (p. ej. media y DE estimadas desde la mediana).
 */
export interface GraficaHistogramaBoxplot extends GraficaBase {
  tipo: 'histograma-boxplot';
  /** Eje de la variable: rótulo, dominio (se amplía a los datos) y pista de formato. */
  ejeX: EjeGrafica;
  bins?: BinHistograma[];
  /** Rótulo del eje de frecuencias (solo con `bins`). */
  etiquetaFrecuencia?: string;
  caja: CajaResumen;
  /** Curva normal N(media, de²) escalada a las frecuencias del histograma (o sola, sin histograma). */
  normal?: { media: number; de: number; etiqueta: string };
  marcadores?: MarcadorX[];
}

/** Descripción declarativa de la gráfica; `nucleo/svg.ts` la convierte en SVG (cadena, sin DOM). */
export type DatosGrafica = GraficaForest | GraficaFagan | GraficaCurvas | GraficaBarras | GraficaHistogramaBoxplot;

/**
 * Contexto que la página entrega a `presentar()`. El código R relleno NO forma
 * parte de la presentación: lo produce la capa genérica con `nucleo/codigoR.ts`
 * a partir de `r.codigo` del YAML (o de `Definicion.rScript`).
 */
export interface Contexto {
  lang: Lang;
  nivel: number;
  textos: ContenidoLang;
  fmt: Formateador;
  /** clave bib → número en la lista de referencias (para {ref:key}). */
  refs: Record<string, number>;
  /** URL canónica de la calculadora (sin estado). */
  url: string;
  /** Cadenas `bio.ui.*` del idioma. */
  ui: Record<string, string>;
}

export interface Presentacion {
  /** id de salida → celda formateada, en el orden de `Definicion.salidas`. */
  celdas: Record<string, Celda>;
  /** Párrafos de interpretación ya rellenos. */
  interpretacion: string[];
  /** Códigos de aviso activos (claves de `textos.avisos`). */
  avisos: string[];
  /** Párrafo de Métodos relleno, con [n] de referencias. */
  metodos: string;
  /** Filas [medida, estimación, IC] para Markdown y CSV. */
  resumen: Array<[string, string, string]>;
  grafica?: DatosGrafica;
}

// ---------------------------------------------------------------------------
// Contrato de una calculadora
// ---------------------------------------------------------------------------

/**
 * Una calculadora = un YAML de contenido + un módulo puro que exporta
 * `definicion`. El controlador genérico monta cualquier `Definicion` con el
 * ciclo leer → derivar → validar → calcular → presentar → pintar → URL.
 */
export interface Definicion<E extends Entradas = Entradas, S extends Resultado = Resultado> {
  /** Igual al nombre del YAML (slug de la URL). */
  id: string;
  motor: Motor;
  /** Claves de `interpretacion` que el YAML debe traer (paridad probada en contenido.test.ts). */
  claves: readonly string[];
  /** Códigos de `avisos` que la calculadora puede activar. */
  avisos: readonly string[];
  /** Ids de las celdas de salida en orden de presentación = etiquetas de salida = claves de `esperado` del fixture. */
  salidas: readonly string[];
  /** Entradas derivadas (totales, prevalencia…). */
  derivar?(e: E): Partial<E>;
  /** Errores por campo (id → código `bio.ui.err_*`) o `null` si todo es válido. */
  validar(e: E): Record<string, string> | null;
  /** Motor ts: cálculo instantáneo en forma cerrada. */
  calcular?(e: E, nivel: number): S;
  /** Snippet R programático (anula `r.codigo` del YAML) cuando hace falta lógica. */
  rScript?(e: E, nivel: number): string;
  /** JSON emitido por R → resultado (motor webr). */
  parsearR?(json: unknown): S;
  presentar(s: S, e: E, ctx: Contexto): Presentacion;
  grafica?(s: S, e: E, ctx: Contexto): DatosGrafica | null;
}
