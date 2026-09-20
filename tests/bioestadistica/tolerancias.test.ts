/**
 * Perfiles de tolerancia (`src/lib/bioestadistica/nucleo/tolerancias.ts`):
 * toda calculadora publicada tiene perfil, todo `tol` de los casos existe y la
 * regla `perfilPara()` que usa «Verificar con R» reproduce exactamente el
 * perfil que cada caso del fixture declara.
 *
 *   node --test tests/bioestadistica/tolerancias.test.ts
 */
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { TOL, cerrado, cuantil, perfilPara } from './tolerancias.ts';
import { leerCasos } from './util.ts';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

const SLUGS = readdirSync(join(RAIZ, 'data/bioestadistica/calculadoras'))
  .filter((n) => n.endsWith('.yml'))
  .map((n) => n.replace(/\.yml$/, ''))
  .sort();

test('toda calculadora publicada tiene un perfil de tolerancia', () => {
  const sinPerfil = SLUGS.filter((slug) => !TOL[slug]);
  assert.deepEqual(sinPerfil, [], `calculadoras sin perfil en TOL: ${sinPerfil.join(', ')}`);
});

test('todo perfil `tol` de los casos existe en TOL', () => {
  for (const slug of SLUGS) {
    for (const caso of leerCasos(slug).casos) {
      if (caso.tol) assert.ok(TOL[caso.tol], `${slug}/${caso.id}: tol «${caso.tol}» no existe en TOL`);
    }
  }
});

test('perfilPara reproduce el perfil declarado por cada caso del fixture', () => {
  for (const slug of SLUGS) {
    for (const caso of leerCasos(slug).casos) {
      const esperado = TOL[caso.tol ?? slug];
      assert.equal(
        perfilPara(slug, caso.entradas),
        esperado,
        `${slug}/${caso.id}: perfilPara eligió otro perfil que el caso (tol = ${caso.tol ?? slug})`,
      );
    }
  }
});

test('perfilPara: Clopper-Pearson y Jeffreys llevan las proporciones 2×2 a cuantil', () => {
  const base = { vp: 68, fp: 6, fn: 12, vn: 114, nivel: 0.95, corr: 0 };
  assert.equal(perfilPara('prueba-diagnostica-2x2', { ...base, metodo: 'wilson' }), TOL['prueba-diagnostica-2x2']);
  const beta = perfilPara('prueba-diagnostica-2x2', { ...base, metodo: 'jeffreys' });
  assert.equal(beta, TOL['prueba-diagnostica-2x2-beta']);
  assert.equal(beta.campos?.sn, cuantil);
  assert.equal(beta.defecto, cerrado);
});

test('perfilPara falla con claridad para una calculadora sin perfil', () => {
  assert.throws(() => perfilPara('no-existe', {}), /no tiene perfil/);
});
