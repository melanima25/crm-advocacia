/**
 * Número único de processo (CNJ): NNNNNNN-DD.AAAA.J.TR.OOOO
 *   N = sequencial (7), DD = dígitos verificadores, A = ano, J = segmento da Justiça (1-9),
 *   TR = tribunal (2), O = unidade de origem (4).
 * Dígito verificador (módulo 97, base 98): DD = 98 − ((NNNNNNN AAAA J TR OOOO 00) mod 97).
 * Válido quando (NNNNNNN AAAA J TR OOOO DD) mod 97 = 1. BigInt evita estouro de precisão (20 dígitos).
 */
export const CNJ_REGEX = /^(\d{7})-(\d{2})\.(\d{4})\.([1-9])\.(\d{2})\.(\d{4})$/;

export const ANO_MIN_CNJ = 1900;
export const ANO_MAX_CNJ = 2099; // fictícios do projeto usam 2099

export type PartesCnj = {
  sequencial: string;
  dv: string;
  ano: string;
  justica: string;
  tribunal: string;
  origem: string;
};

export function parteCnj(numero: string): PartesCnj | null {
  const m = CNJ_REGEX.exec(numero);
  if (!m) return null;
  const [, sequencial, dv, ano, justica, tribunal, origem] = m as unknown as string[] as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return { sequencial, dv, ano, justica, tribunal, origem };
}

function dvCalculado(p: Omit<PartesCnj, 'dv'>): string {
  const base = BigInt(`${p.sequencial}${p.ano}${p.justica}${p.tribunal}${p.origem}00`);
  return String(98n - (base % 97n)).padStart(2, '0');
}

export function cnjValido(numero: string): boolean {
  const p = parteCnj(numero);
  if (!p) return false;
  const ano = Number(p.ano);
  if (ano < ANO_MIN_CNJ || ano > ANO_MAX_CNJ) return false;
  return dvCalculado(p) === p.dv;
}

/** Monta um número válido a partir das partes (usado no seed e nos testes). */
export function gerarCnj(p: Omit<PartesCnj, 'dv'>): string {
  return `${p.sequencial}-${dvCalculado(p)}.${p.ano}.${p.justica}.${p.tribunal}.${p.origem}`;
}
