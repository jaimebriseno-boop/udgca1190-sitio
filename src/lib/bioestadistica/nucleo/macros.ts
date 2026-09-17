/**
 * Macros de KaTeX compartidas por todas las ecuaciones de la sección. Las siglas
 * que cambian de idioma (VPP/PPV, VPN/NPV) se escriben en el `tex` de cada
 * bloque de idioma del YAML, no aquí.
 */
export const MACROS: Record<string, string> = {
  '\\Sn': '\\mathrm{Sn}',
  '\\Sp': '\\mathrm{Sp}',
  '\\LRp': '\\mathrm{LR}^{+}',
  '\\LRn': '\\mathrm{LR}^{-}',
  '\\DOR': '\\mathrm{DOR}',
  '\\RR': '\\mathrm{RR}',
  '\\OR': '\\mathrm{OR}',
  '\\RRA': '\\mathrm{RRA}',
  '\\RRR': '\\mathrm{RRR}',
  '\\NNT': '\\mathrm{NNT}',
  '\\IC': '\\mathrm{IC}',
  '\\CI': '\\mathrm{CI}',
  '\\logit': '\\operatorname{logit}',
  '\\expit': '\\operatorname{expit}',
  '\\var': '\\operatorname{Var}',
  '\\se': '\\operatorname{SE}',
};
