/**
 * Reexporta los perfiles de tolerancia desde la biblioteca pura. Desde H4 viven
 * en `src/lib/bioestadistica/nucleo/tolerancias.ts` porque también los usa el
 * panel «Verificar con R» del navegador; las pruebas siguen importándolos de
 * aquí para no tocar un archivo por calculadora.
 */
export * from '../../src/lib/bioestadistica/nucleo/tolerancias.ts';
