/**
 * Arranque de una página de calculadora: lee los datos que Astro dejó en
 * `#bio-datos`, resuelve el módulo puro de la calculadora y arranca el
 * controlador genérico.
 *
 * `montar()` es re-entrante desde el primer día. Cuando la sección incorpore el
 * `ClientRouter` (hito H4), los `<script>` se ejecutan una sola vez por
 * documento y cada navegación intercambia el DOM: por eso se monta también en
 * `astro:page-load`, con una guarda en `#calculadora` para no montar dos veces
 * en la carga inicial y un `AbortController` por montaje que retira de golpe los
 * oyentes del anterior.
 */
import { iniciar } from './controlador.ts';
import type { DatosPagina } from './controlador.ts';
import { cargarDefinicion } from './registro.ts';

/** Montaje vigente; se aborta en cuanto otro ocupa su lugar. */
let vigente: AbortController | null = null;

/** Lee y valida lo mínimo del JSON de la página. */
function leerDatos(): DatosPagina | null {
  const script = document.getElementById('bio-datos');
  if (!script || !script.textContent) return null;
  const datos = JSON.parse(script.textContent) as DatosPagina;
  if (typeof datos.slug !== 'string' || !Array.isArray(datos.entradas)) return null;
  return datos;
}

/** Monta la calculadora de la página actual, si la hay. */
export async function montar(): Promise<void> {
  const raiz = document.getElementById('calculadora');
  if (!raiz || raiz.dataset.bioMontado === '1') return;
  const datos = leerDatos();
  if (!datos) return;

  vigente?.abort();
  const control = new AbortController();
  vigente = control;
  raiz.dataset.bioMontado = '1';

  const definicion = await cargarDefinicion(datos.slug);
  // Si mientras se cargaba el módulo llegó otra navegación, este montaje ya no
  // corresponde a lo que está en pantalla.
  if (control.signal.aborted) return;
  iniciar(definicion, datos, control.signal);
}

document.addEventListener('astro:page-load', () => {
  void montar();
});
