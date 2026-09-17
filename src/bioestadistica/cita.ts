/**
 * Copia de la cita en las páginas de la sección que no montan una calculadora
 * (el índice). En las páginas de calculadora esto lo atiende el controlador, que
 * ya escucha los botones «Copiar» de toda la página.
 *
 * Re-entrante por el mismo motivo que `montar.ts`: con el `ClientRouter` de la
 * sección los `<script>` se ejecutan una sola vez por documento.
 */
import { $, avisarEnBoton, copiarAlPortapapeles } from './dom.ts';

let vigente: AbortController | null = null;

/** Conecta el botón «Copiar» del aside de cita, si esta página lo tiene. */
export function montarCita(): void {
  const boton = $<HTMLElement>('[data-accion="copiar"][data-copiar="cita"]');
  const texto = $<HTMLElement>('[data-cita-texto]');
  if (!boton || !texto || boton.dataset.bioMontado === '1') return;

  vigente?.abort();
  const control = new AbortController();
  vigente = control;
  boton.dataset.bioMontado = '1';

  boton.addEventListener(
    'click',
    (ev) => {
      ev.preventDefault();
      void (async () => {
        const ok = await copiarAlPortapapeles(texto.textContent?.trim() ?? '');
        const aviso = boton.dataset.copiado;
        if (ok && aviso) avisarEnBoton(boton, aviso);
      })();
    },
    { signal: control.signal },
  );
}

document.addEventListener('astro:page-load', montarCita);
