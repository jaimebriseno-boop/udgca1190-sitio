"""Regresiones de cálculos, atribución y correspondencia signo/desenlace.

Ejecutar: python3 -m unittest discover -s scripts -p 'test_propedeutica.py'
No requiere acceso al vault ni red.
"""
import json
import unittest
from collections import defaultdict
from pathlib import Path

from propedeutica_evidencia import Evidencia, completar_lr, normalizar
from propedeutica_generar_signos import vp_escenarios, veredicto

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/herramientas/propedeutica-basada-en-evidencia/app/data/signos.json'


class Calculos(unittest.TestCase):
    def test_lr_de_tabla_dos_por_dos(self):
        # 80 VP, 20 FN, 10 FP y 90 VN.
        r = {'sn': 80, 'sp': 90}
        completar_lr(r)
        self.assertEqual(r['lp'], 8)
        self.assertAlmostEqual(r['ln'], .222)
        self.assertEqual(r['derivadas'], ['LR+', 'LR−'])

    def test_no_promediar_rangos_ni_invertir_lr(self):
        r = {'sn': [50, 90], 'sp': [60, 95]}
        completar_lr(r)
        self.assertNotIn('lp', r)
        self.assertIsNone(vp_escenarios(r['sn'], r['sp'], None, None))
        r = {'lp': 8, 'ln': .2}
        completar_lr(r)
        self.assertNotIn('sn', r)

    def test_estimaciones_publicadas_tienen_prioridad(self):
        r = {'sn': 80, 'sp': 90, 'lp': 7.5, 'ln': .25}
        completar_lr(r)
        self.assertNotIn('derivadas', r)
        self.assertEqual(vp_escenarios(**r)[1], [20, 65.2, 94.1])

    def test_cero_infinito_e_indeterminacion(self):
        r = {'sn': 100, 'sp': 100}
        completar_lr(r)
        self.assertEqual((r['lp'], r['ln']), ('Infinity', 0))
        self.assertEqual(vp_escenarios(**{k: r[k] for k in ('sn','sp','lp','ln')})[1], [20, 100, 100])
        json.dumps(r, allow_nan=False)
        r = {'sn': 0, 'sp': 100}
        completar_lr(r)
        self.assertNotIn('lp', r)  # 0/0 no es LR cero ni infinita.

    def test_escenarios_con_rangos_y_orden_del_vpn(self):
        self.assertEqual(vp_escenarios(None, None, [2, 4], [.1, .3])[2],
                         [50, [66.7, 80.0], [76.9, 90.9]])

    def test_no_significativo_no_equivale_a_lr_uno(self):
        self.assertEqual(veredicto(2.9, 1, True, True), 'nulo')
        self.assertEqual(veredicto('Infinity', 0, False, False), 'confirma')
        self.assertEqual(veredicto([3, 9], None, False, False), 'ajusta')


class Correspondencia(unittest.TestCase):
    def setUp(self):
        self.e = Evidencia.__new__(Evidencia)
        self.e.revisados = {}
        self.e.por_numero = {}
        self.e.por_texto = {}
        self.e.ap_repetidos = defaultdict(int)
        self.m = {'celda_id': 'test', 'capitulo_mcgee': 1, 'caja_id': 'box',
                  'forma': 'sn_sp_lrp_lrn', 'signo_en': 'Target sign'}

    def test_rechaza_apendice_parecido_o_ambiguo(self):
        self.e.apendice = {'test': {'etiqueta_apendice': 'Different target sign',
                                   'lr_pos_apendice': 12, 'lr_pos_ic95': '4–30'}}
        r = {'lpic': '4–30'}
        self.e.completar_maestra(self.m, r)
        self.assertNotIn('lpic', r)
        self.assertNotIn('lp', r)
        self.e.apendice['test']['etiqueta_apendice'] = 'Target sign'
        self.e.ap_repetidos[('box', normalizar('Target sign'))] = 2
        self.e.completar_maestra(self.m, r)
        self.assertNotIn('lp', r)

    def test_rechaza_conflicto_con_lr_existente(self):
        self.e.apendice = {'test': {'etiqueta_apendice': 'Target sign',
                                   'lr_pos_apendice': 12, 'lr_neg_apendice': .2}}
        self.e.ap_repetidos[('box', normalizar('Target sign'))] = 1
        r = {'lp': 3}
        self.e.completar_maestra(self.m, r)
        self.assertEqual(r['lp'], 3)
        self.assertNotIn('ln', r)

    def test_no_cita_libros_ni_fuentes_sin_identificar(self):
        self.assertIsNone(self.e.referencia({'tipo_crossref': 'book', 'cita_vancouver': 'Book'}))
        self.assertIsNone(self.e.referencia(None))
        self.assertIsNone(self.e.referencia({'estado_cita': 'duplicada', 'texto_mcgee': 'unresolved'}))


class Catalogo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATA.read_text(), parse_constant=lambda value: cls.fail(value))
        cls.rows = cls.data['r']
        cls.by_uid = {r['uid']: r for r in cls.rows}

    def test_identificadores_y_cobertura_coherentes(self):
        self.assertEqual([r['i'] for r in self.rows], list(range(len(self.rows))))
        self.assertEqual(len(self.by_uid), len(self.rows))
        self.assertEqual(self.rows[695]['base'], 'sintesis')
        self.assertEqual(self.rows[696]['base'], 'articulo')
        self.assertEqual(self.data['meta']['n'], len(self.rows))
        for k, n in self.data['meta']['faltantes'].items():
            self.assertEqual(n, sum(r.get(k) is None for r in self.rows))

    def test_porcentajes_lr_y_referencias_validos(self):
        for r in self.rows:
            for k in ('sn', 'sp', 'vpp', 'vpn', 'lp', 'ln'):
                v = r.get(k)
                if v is None:
                    continue
                vals = v if isinstance(v, list) else [v]
                self.assertEqual(vals, sorted(vals), (r['uid'], k))
                for v in vals:
                    if v == 'Infinity':
                        self.assertIn(k, ('lp', 'ln'))
                    else:
                        self.assertGreaterEqual(v, 0, (r['uid'], k))
                        if k not in ('lp', 'ln'):
                            self.assertLessEqual(v, 100, (r['uid'], k))
            for ref in r.get('refs', []):
                self.assertTrue(ref['cita'])
                self.assertRegex(ref['cita'], r'\b(?:19|20)\d\d\b', r['uid'])
                self.assertNotIn('Evidence-Based Physical Diagnosis', ref['cita'])

    def test_soplos_separan_tres_desencadenantes(self):
        for uid in ('C00437', 'C00438', 'C00439', 'C00440', 'C00441',
                    'C00442', 'C00443', 'C00444', 'C00445', 'C00446'):
            group = [self.by_uid[uid + suffix] for suffix in ('', ':1', ':2')]
            self.assertEqual(len({r['c'] for r in group}), 3)
            self.assertTrue(all(r.get('lp') is not None and r.get('ln') is not None for r in group))

    def test_maniobras_corregidas(self):
        self.assertIn('P2', self.by_uid['C00411']['s'])
        self.assertIn('funcional', self.by_uid['C00424']['s'].lower())
        for uid in ('C00485', 'C00486', 'C00487'):
            self.assertEqual(self.by_uid[uid]['ep'], 'Hill')

    def test_escalas_no_fabrican_sensibilidad_o_vpn(self):
        for uid in ('C00345', 'C00346', 'C00347', 'C00348', 'C00349'):
            r = self.by_uid[uid]
            self.assertTrue(r['ordinal'])
            self.assertIn('vpp', r)
            self.assertNotIn('ln', r)
            self.assertNotIn('vpn', r)
            self.assertNotIn('sn', r)
        for r in self.rows:
            if r.get('ordinal'):
                self.assertNotIn('LR−', r.get('derivadas', []))

    def test_rendimiento_biopsia_no_es_sensibilidad_del_signo(self):
        for i in (1103, 1110, 1111):
            r = self.rows[i]
            self.assertNotIn('sn', r)
            self.assertNotIn('vpp', r)
            self.assertNotIn('vps', r)

    def test_rangos_no_se_etiquetan_como_intervalos(self):
        for r in self.rows:
            for k in ('snic','spic','lpic','lnic'):
                self.assertNotIn('rango', str(r.get(k, '')).lower(), r['uid'])


if __name__ == '__main__':
    unittest.main()
