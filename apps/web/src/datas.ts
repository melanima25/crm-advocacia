import { diaDaSemana, somarDias } from '@crm/shared';

export const dataBr = (iso: string) => iso.split('-').reverse().join('/');
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const nomeDia = (iso: string) => DIAS[diaDaSemana(iso)]!;
export const dataComDia = (iso: string) => `${nomeDia(iso)} ${dataBr(iso)}`;
export const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Primeiro e último dia do mês 'AAAA-MM'. */
export function limitesDoMes(ano: number, mes: number): { de: string; ate: string } {
  const de = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const prox = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
  return { de, ate: somarDias(prox, -1) };
}

/** Semanas (começando no domingo) que cobrem o mês; células fora do mês vêm como null. */
export function semanasDoMes(ano: number, mes: number): (string | null)[][] {
  const { de, ate } = limitesDoMes(ano, mes);
  const celulas: (string | null)[] = Array(diaDaSemana(de)).fill(null);
  for (let d = de; d <= ate; d = somarDias(d, 1)) celulas.push(d);
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}
