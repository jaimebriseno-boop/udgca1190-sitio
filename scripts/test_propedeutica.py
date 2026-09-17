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
from propedeutica_inventario import inventario

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

    def test_conteos_exactos_y_porcentajes_observados(self):
        r = {'sn': 77, 'sp': 68,
             'tabla2x2': {'vp': 27, 'fp': 35, 'fn': 8, 'vn': 73}}
        completar_lr(r)
        self.assertEqual((r['sn'], r['sp']), (77, 68))
        self.assertEqual((r['vpp'], r['vpn']), (43.5, 90.1))
        self.assertEqual((r['lp'], r['ln']), (2.38, .338))
        self.assertEqual(r['porcentajes_calculados'], ['vpp', 'vpn'])

    def test_tablas_invalidas_o_sin_denominador(self):
        for n in (-1, 1.5):
            with self.assertRaises(ValueError):
                completar_lr({'tabla2x2': {'vp': n, 'fp': 0, 'fn': 0, 'vn': 2}})
        r = {'tabla2x2': {'vp': 0, 'fp': 0, 'fn': 0, 'vn': 0}}
        completar_lr(r)
        self.assertFalse(any(k in r for k in ('sn', 'sp', 'lp', 'ln', 'vpp', 'vpn')))

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

    def test_lr_de_efecto_minimo_no_oculta_la_otra(self):
        self.assertEqual(veredicto(2.309, .624, False, False), 'ajusta')
        self.assertEqual(veredicto(.624, 2.309, False, False), 'ajusta')
        self.assertEqual(veredicto(1.5, .8, False, False), 'debil')
        self.assertEqual(veredicto(None, .8, False, False), 'debil')


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

    def test_maniobras_y_desenlaces_del_texto_completo(self):
        self.assertEqual(self.rows[1160]['tabla2x2'], {'vp': 27, 'fp': 35, 'fn': 8, 'vn': 73})
        self.assertIn('empty can', self.rows[1160]['s'])
        self.assertEqual((self.rows[1050]['sn'], self.rows[1050]['sp']), (83.3, 50.8))
        self.assertEqual((self.rows[1051]['sn'], self.rows[1051]['sp']), (87.5, 42.6))
        self.assertIn('A2', self.rows[1171]['s'])
        self.assertNotIn('paradójico', self.rows[1171]['s'])
        self.assertEqual(self.rows[1013]['c'], 'Hipernatremia')

    def test_polaridad_y_categorias_revisadas(self):
        self.assertIn('≥5', self.rows[886]['s'])
        self.assertIn('anormal', self.rows[830]['s'])
        self.assertNotIn('ln', self.rows[826])  # Color normal no equivale a no-rojo.
        for i in (879, 880, 881, 882, 883):
            self.assertTrue(self.rows[i]['ordinal'])
            self.assertNotIn('ln', self.rows[i])
        self.assertEqual((self.rows[1091]['lp'], self.rows[1092]['lp']), (.7, .3))

    def test_procedencia_de_cada_correccion_de_texto(self):
        revision = json.loads((ROOT / 'scripts/propedeutica_sustitucion/revision_textos_wiki.json').read_text())
        self.assertEqual(len(revision['revisiones']), len({r['uid'] for r in revision['revisiones']}))
        for item in revision['revisiones']:
            r = self.by_uid[item['uid']]
            self.assertEqual(r['pmid'], item['pmid'])
            self.assertRegex(item['sha256'], r'^[a-f0-9]{64}$')
            self.assertGreaterEqual(item['lineas'][1], item['lineas'][0])
            self.assertEqual(item['sha256'], revision['textos_revisados'][item['texto']]['sha256'])

    def test_hipoperfusion_umbrales_binarios_y_complemento(self):
        ninguno, alguno, todos = (self.rows[i] for i in (683, 684, 685))
        self.assertEqual((ninguno['sn'], ninguno['sp']), (48.5, 22.3))
        self.assertEqual((ninguno['vpp'], ninguno['vpn']), (5.2, 83.0))
        self.assertEqual((alguno['sn'], alguno['sp'], alguno['vpp'], alguno['vpn']),
                         (52, 78, 17, 95))
        self.assertEqual((todos['vpp'], todos['vpn']), (40, 93))
        self.assertAlmostEqual(ninguno['lp'], alguno['ln'])
        self.assertAlmostEqual(ninguno['ln'], alguno['lp'])
        self.assertIn('Al menos uno', alguno['s'])
        for a, b in ((516, 683), (517, 684), (518, 685)):
            for key in ('sn', 'sp', 'lp', 'ln', 'vpp', 'vpn', 'tabla2x2'):
                self.assertEqual(self.rows[a][key], self.rows[b][key])
            self.assertFalse(self.rows[a].get('ordinal'))
            self.assertEqual(sum(self.rows[a]['tabla2x2'].values()), 405)
            self.assertEqual(self.rows[a]['refs'][0]['pmid'], '19885995')

    def test_elevacion_de_piernas_no_es_variacion_respiratoria(self):
        r = self.rows[686]
        self.assertIn('elevar pasivamente', r['s'])
        self.assertEqual((r['sn'], r['sp']), (60, 85))
        self.assertEqual((r['lp'], r['ln']), (4, .471))
        self.assertEqual(r['refs'][0]['pmid'], '16540963')
        self.assertNotIn('ciclo respiratorio', r['mn'])

    def test_citas_uci_y_valores_predictivos_pupilares(self):
        self.assertEqual({r['pmid'] for r in self.rows[681]['refs']},
                         {'19540542', '19033494', '19220521', '18843068'})
        self.assertEqual(self.rows[681]['lp'], 3.7)  # No transferir la síntesis posterior de 4,7.
        self.assertTrue(all(self.rows[i].get('refs') for i in range(682, 692)))
        self.assertEqual((self.rows[690]['vpp'], self.rows[690]['vpn']), (86, 70))
        self.assertEqual((self.rows[116]['vpp'], self.rows[116]['vpn']), (70, 87))
        for i in (115, 116, 690):
            self.assertEqual(sum(self.rows[i]['tabla2x2'].values()), 115)
        self.assertIn('espiración', self.rows[687]['mn'])
        self.assertEqual([r['pmid'] for r in self.rows[515]['refs']], ['11303155'])

    def test_continuacion_trazable_y_aplicada_al_uid_correcto(self):
        review = json.loads((ROOT / 'scripts/propedeutica_sustitucion/revision_continuacion.json').read_text())
        self.assertEqual(len(review['revisiones']), len({r['uid'] for r in review['revisiones']}))
        for item in review['revisiones']:
            self.assertEqual(self.by_uid[item['uid']]['i'], item['i'])
            self.assertRegex(item['sha256'], r'^[a-f0-9]{64}$')
            self.assertTrue(item['url'].startswith('https://'))
            self.assertTrue(item['localizador'])
        e = Evidencia.__new__(Evidencia)
        e.continuacion = {'x': {'i': 5, 'valores': {'sn': 20}}}
        with self.assertRaises(ValueError):
            e.completar_revision({'uid': 'x', 'i': 6})

    def test_codo_y_soplos_conservan_denominadores_evaluables(self):
        for i, n in ((365, 367), (366, 367), (912, 1736), (913, 778)):
            self.assertEqual(sum(self.rows[i]['tabla2x2'].values()), n)
        self.assertEqual((self.rows[913]['vpp'], self.rows[913]['vpn']), (42.8, 95.8))
        self.assertAlmostEqual(self.rows[912]['ln'], .06)

    def test_celulitis_no_mezcla_tablas_ni_poblaciones(self):
        r = self.rows[979]
        self.assertEqual((r['sn'], r['sp'], r['n']), (93.5, 38.4, 204))
        self.assertAlmostEqual(r['ln'], .169)
        self.assertEqual((self.rows[978]['n'], self.rows[981]['n']), (175, 175))
        self.assertEqual((self.rows[981]['vpp'], self.rows[981]['vpn']), (64.7, 87.5))

    def test_categorias_park_y_predictivos_observados(self):
        for i, ppv in ((558, 92.6), (559, 73.6), (560, 38.3)):
            r = self.rows[i]
            self.assertIn('brazo caído', r['s'])
            self.assertTrue(r['ordinal'])
            self.assertEqual(r['vpp'], ppv)
            self.assertNotIn('ln', r)
            self.assertNotIn('vpn', r)
        self.assertEqual((self.rows[1044]['sn'], self.rows[1044]['sp']), (79, 50))
        self.assertNotIn('vpp', self.rows[1044])  # 61/70 de la revisión usan prevalencia supuesta.
        self.assertNotIn('vpn', self.rows[1044])

    def test_polaridad_apendicitis_y_arbol_neumonia(self):
        self.assertIn('>6750', self.rows[892]['s'])
        self.assertEqual((self.rows[892]['sn'], self.rows[892]['sp']), (97, 51))
        r = self.rows[960]
        self.assertEqual(r['tabla2x2'], {'vp': 15, 'fp': 330, 'fn': 1, 'vn': 3635})
        self.assertEqual(sum(r['tabla2x2'].values()), 3981)
        self.assertEqual(r['ln'], .07)
        self.assertEqual(r['vpn'], 100)  # Redondeado; existe un falso negativo.

    def test_palidez_complemento_y_umbral_original(self):
        presente, ausente = self.rows[1011], self.rows[1012]
        self.assertEqual((presente['sn'], presente['sp']), (50, 92))
        self.assertEqual((ausente['sn'], ausente['sp']), (50, 8))
        self.assertAlmostEqual(presente['lp'], ausente['ln'])
        self.assertAlmostEqual(presente['ln'], ausente['lp'])
        self.assertIn('7', presente['c'])

    def test_patito_feo_consenso_y_monofilamento_desenlace(self):
        r = self.rows[970]
        self.assertIn('2/3', r['s'])
        self.assertEqual(r['tabla2x2'], {'vp': 5, 'fp': 3, 'fn': 0, 'vn': 137})
        self.assertEqual((r['sn'], r['vpp']), (100, 62.5))
        r = self.rows[1082]
        self.assertEqual((r['sn'], r['sp']), (80, 86))
        self.assertIn('insensible', r['c'])
        self.assertNotIn('úlcera', r['c'])

    def test_inventario_no_confunde_cero_y_datos_ausentes(self):
        entries = {r['i']: r for r in inventario(self.rows)}
        for r in self.rows:
            missing = [k for k in ('sn', 'sp', 'lp', 'ln', 'vpp', 'vpn') if r.get(k) is None]
            if missing:
                self.assertEqual(entries[r['i']]['metricas_no_recuperadas'], ';'.join(missing))
            else:
                self.assertNotIn(r['i'], entries)
        self.assertNotIn(970, entries)
        self.assertEqual(entries[558]['tipo'], 'ordinal')


if __name__ == '__main__':
    unittest.main()
