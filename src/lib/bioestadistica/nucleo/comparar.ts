/**
 * Comparador de un `Resultado` de TypeScript contra el JSON que imprimió el
 * snippet de R (el oráculo). Lo usan las pruebas `node --test` con los fixtures
 * commiteados y el panel «Verificar con R» de la interfaz con la salida de webR.
 *
 * Convención del JSON de R, idéntica en ambos casos: un vector de longitud 3 es
 * `[estimación, inferior, superior]` y corresponde a una `Estimacion` con `ic`;
 * un escalar corresponde a una `Estimacion` sin `ic`.
 *
 * Puro: sin DOM, sin `Intl`, sin acceso al sistema de archivos.
 */
import type { Estimacion, Resultado } from './tipos.ts';

/** Tolerancia de una comparación: `|a − b| ≤ abs + rel · max(|a|, |b|)`. */
export interface Tolerancia {
  rel: number;
  abs: number;
}

/** Tolerancias de una calculadora: una por defecto y, si hace falta, una por campo. */
export interface PerfilTolerancia {
  defecto: Tolerancia;
  campos?: Record<string, Tolerancia>;
}

/** Componente comparado de una estimación. */
export type Componente = 'valor' | 'lo' | 'hi';

/** Un valor del oráculo: número, `null` (NA de R) o ausente/mal formado. */
export type ValorR = number | null;

export interface Fila {
  /** Clave de `Resultado.valores` y del JSON de R. */
  campo: string;
  componente: Componente;
  /** Valor de TypeScript. */
  ts: number;
  /** Valor de R ya normalizado; `null` si R devolvió NA o si no había valor. */
  r: ValorR;
  /** |ts − r| / max(|ts|, |r|); `NaN` cuando alguno no es un número finito comparable. */
  difRel: number;
  coincide: boolean;
  /** Motivo cuando el desacuerdo no es numérico (campo ausente, forma incorrecta). */
  nota?: string;
}

export interface Informe {
  coincide: boolean;
  filas: Fila[];
  discrepancias: Fila[];
  /** «Coincide en k/m campos». */
  resumen: string;
}

/** `true` si el valor representa «no definido»: `NaN` de JavaScript o `NA` de R. */
function indefinido(v: ValorR): boolean {
  return v === null || Number.isNaN(v);
}

/**
 * Igualdad numérica del motor.
 *
 * - Ambos indefinidos (`NaN` de TS, `NaN` o `NA` de R) → iguales. `NA` y `NaN`
 *   se consideran el mismo estado porque la biblioteca representa «no definido»
 *   con `NaN` y jsonlite emite `null` para `NA`.
 * - Infinitos del mismo signo → iguales; `+Infinity` y `−Infinity` → distintos.
 * - Un infinito frente a un número finito → distintos.
 * - En el resto: `|a − b| ≤ abs + rel · max(|a|, |b|)`.
 */
export function iguales(a: ValorR, b: ValorR, tol: Tolerancia): boolean {
  if (indefinido(a) && indefinido(b)) return true;
  if (indefinido(a) || indefinido(b)) return false;
  const x = a as number;
  const y = b as number;
  if (x === y) return true;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x - y) <= tol.abs + tol.rel * Math.max(Math.abs(x), Math.abs(y));
}

/** Diferencia relativa entre dos valores; `NaN` cuando la comparación no es numérica. */
export function difRelativa(a: ValorR, b: ValorR): number {
  if (a === null || b === null) return a === b ? 0 : Number.NaN;
  if (Number.isNaN(a) && Number.isNaN(b)) return 0;
  if (a === b) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  const m = Math.max(Math.abs(a), Math.abs(b));
  return m === 0 ? 0 : Math.abs(a - b) / m;
}

/** Texto de una fila, pensado para el mensaje de una aserción fallida. */
export function describir(f: Fila): string {
  const donde = f.componente === 'valor' ? f.campo : `${f.campo}.${f.componente}`;
  if (f.nota) return Number.isNaN(f.ts) ? `${donde}: ${f.nota}` : `${donde}: ${f.nota} · TS ${f.ts}`;
  return `${donde}: TS ${f.ts} vs R ${f.r === null ? 'NA' : f.r} (dif. rel. ${f.difRel})`;
}

function tolerancia(perfil: PerfilTolerancia, campo: string): Tolerancia {
  return perfil.campos?.[campo] ?? perfil.defecto;
}

/** Convierte un valor crudo del JSON de R en `ValorR`; `undefined` si no es comparable. */
function comoValorR(v: unknown): ValorR | undefined {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  return undefined;
}

function fila(campo: string, componente: Componente, ts: number, crudo: unknown, tol: Tolerancia): Fila {
  const r = comoValorR(crudo);
  if (r === undefined) {
    return {
      campo,
      componente,
      ts,
      r: null,
      difRel: Number.NaN,
      coincide: false,
      nota: crudo === undefined ? 'ausente en la salida de R' : `R devolvió ${JSON.stringify(crudo)}, que no es un número`,
    };
  }
  return { campo, componente, ts, r, difRel: difRelativa(ts, r), coincide: iguales(ts, r, tol) };
}

function filasDeEstimacion(campo: string, est: Estimacion, crudo: unknown, tol: Tolerancia): Fila[] {
  if (!est.ic) return [fila(campo, 'valor', est.valor, crudo, tol)];
  const componentes: Componente[] = ['valor', 'lo', 'hi'];
  const valoresTs = [est.valor, est.ic[0], est.ic[1]];
  if (!Array.isArray(crudo) || crudo.length !== 3) {
    const nota =
      crudo === undefined
        ? 'ausente en la salida de R'
        : `se esperaba un vector [est, lo, hi] y R devolvió ${JSON.stringify(crudo)}`;
    return componentes.map((componente, i) => ({
      campo,
      componente,
      ts: valoresTs[i] as number,
      r: null,
      difRel: Number.NaN,
      coincide: false,
      nota,
    }));
  }
  return componentes.map((componente, i) => fila(campo, componente, valoresTs[i] as number, crudo[i], tol));
}

/**
 * Compara todos los campos de `resultado.valores` contra el JSON de R ya
 * normalizado (`normalizarR` de `codigoR.ts`), campo por campo y componente por
 * componente. Un campo presente en R y ausente en TypeScript también se reporta
 * como discrepancia: delata una salida olvidada en la implementación.
 */
export function comparar(
  resultado: Resultado,
  esperadoR: Record<string, unknown>,
  tol: PerfilTolerancia,
): Informe {
  const filas: Fila[] = [];
  const campos = Object.keys(resultado.valores);
  for (const campo of campos) {
    const est = resultado.valores[campo] as Estimacion;
    filas.push(...filasDeEstimacion(campo, est, esperadoR[campo], tolerancia(tol, campo)));
  }
  for (const campo of Object.keys(esperadoR)) {
    if (campos.includes(campo)) continue;
    filas.push({
      campo,
      componente: 'valor',
      ts: Number.NaN,
      r: comoValorR(esperadoR[campo]) ?? null,
      difRel: Number.NaN,
      coincide: false,
      nota: `campo ${JSON.stringify(esperadoR[campo])} presente en la salida de R y ausente en el resultado de TypeScript`,
    });
  }
  const discrepancias = filas.filter((f) => !f.coincide);
  const fallados = new Set(discrepancias.map((f) => f.campo));
  const total = new Set(filas.map((f) => f.campo)).size;
  return {
    coincide: discrepancias.length === 0,
    filas,
    discrepancias,
    resumen: `Coincide en ${total - fallados.size}/${total} campos`,
  };
}
