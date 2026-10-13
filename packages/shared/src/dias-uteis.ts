/**
 * Contagem de prazos em DIAS ÚTEIS (regras do projeto fictício; não é consultoria jurídica).
 * Trabalha só com datas "YYYY-MM-DD" (sem horário, sem fuso), então não há erro de virada de dia.
 *
 * Regras:
 *  - O dia da intimação NÃO conta; o dia 1 é o primeiro dia útil depois dela.
 *  - Sábado, domingo e feriados cadastrados não contam.
 *  - O vencimento é, por construção, sempre um dia útil (se o "último dia" cairia num dia não útil,
 *    a contagem simplesmente segue até o próximo útil = prorrogação).
 */

export type DataIso = string; // 'YYYY-MM-DD'

const MS_DIA = 24 * 60 * 60 * 1000;

function paraUtc(iso: DataIso): number {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, d);
}
function deUtc(ms: number): DataIso {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dataIsoValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return deUtc(paraUtc(iso)) === iso;
}

export function somarDias(iso: DataIso, dias: number): DataIso {
  return deUtc(paraUtc(iso) + dias * MS_DIA);
}

/** 0 = domingo … 6 = sábado */
export function diaDaSemana(iso: DataIso): number {
  return new Date(paraUtc(iso)).getUTCDay();
}

export function fimDeSemana(iso: DataIso): boolean {
  const d = diaDaSemana(iso);
  return d === 0 || d === 6;
}

export function ehDiaUtil(iso: DataIso, feriados: ReadonlySet<DataIso>): boolean {
  return !fimDeSemana(iso) && !feriados.has(iso);
}

/** Próximo dia útil igual ou posterior a `iso` (prorrogação). */
export function proximoDiaUtil(iso: DataIso, feriados: ReadonlySet<DataIso>): DataIso {
  let d = iso;
  while (!ehDiaUtil(d, feriados)) d = somarDias(d, 1);
  return d;
}

export type MotivoPulo = 'sabado' | 'domingo' | 'feriado';
export type ResultadoPrazo = {
  venceEm: DataIso;
  /** Os dias úteis contados, na ordem (n = 1…dias). */
  contagem: { n: number; data: DataIso }[];
  /** Dias não úteis que a contagem atravessou (para explicar o cálculo ao usuário). */
  pulados: { data: DataIso; motivo: MotivoPulo }[];
};

export const MAX_DIAS_UTEIS = 365;

/** Soma `dias` dias úteis a partir de `intimacao` (exclusive). `dias` precisa ser ≥ 1. */
export function calcularVencimento(
  intimacao: DataIso,
  dias: number,
  feriados: ReadonlySet<DataIso>,
): ResultadoPrazo {
  if (!dataIsoValida(intimacao)) throw new RangeError('Data de intimação inválida');
  if (!Number.isInteger(dias) || dias < 1 || dias > MAX_DIAS_UTEIS)
    throw new RangeError(`Dias úteis deve ser um inteiro entre 1 e ${MAX_DIAS_UTEIS}`);
  const contagem: ResultadoPrazo['contagem'] = [];
  const pulados: ResultadoPrazo['pulados'] = [];
  let atual = intimacao;
  while (contagem.length < dias) {
    atual = somarDias(atual, 1);
    if (ehDiaUtil(atual, feriados)) contagem.push({ n: contagem.length + 1, data: atual });
    else {
      const dow = diaDaSemana(atual);
      pulados.push({
        data: atual,
        motivo: dow === 6 ? 'sabado' : dow === 0 ? 'domingo' : 'feriado',
      });
    }
  }
  return { venceEm: atual, contagem, pulados };
}

// ---------- fuso America/Sao_Paulo (UTC−3 fixo; sem horário de verão desde 2019) ----------

/** Fim do dia (23:59:59) em Brasília para a data dada, como instante UTC. */
export function fimDoDiaBrasilia(iso: DataIso): Date {
  return new Date(`${iso}T23:59:59-03:00`);
}

/** 'YYYY-MM-DDTHH:mm' (relógio de Brasília) → instante UTC. */
export function localBrasiliaParaDate(local: string): Date {
  return new Date(`${local}:00-03:00`);
}

/** Instante → data e hora no relógio de Brasília. */
export function dateParaBrasilia(d: Date): { data: DataIso; hora: string } {
  const b = new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString();
  return { data: b.slice(0, 10), hora: b.slice(11, 16) };
}

export function hojeEmBrasilia(agora: Date): DataIso {
  return dateParaBrasilia(agora).data;
}

/** Prazo vencido = ainda pendente e o instante de vencimento já passou. */
export function estaVencido(venceEm: Date, agora: Date, status: string): boolean {
  return status === 'pendente' && venceEm.getTime() < agora.getTime();
}

// ---------- feriados nacionais ----------

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): DataIso {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Feriados NACIONAIS (lei) de um ano: os fixos + Sexta-feira Santa.
 * Não inclui feriados estaduais/municipais nem pontos facultativos (Carnaval, Corpus Christi): o admin cadastra.
 */
export function feriadosNacionais(ano: number): { data: DataIso; nome: string }[] {
  const f = (mm: string, dd: string, nome: string) => ({ data: `${ano}-${mm}-${dd}`, nome });
  return [
    f('01', '01', 'Confraternização Universal'),
    { data: somarDias(pascoa(ano), -2), nome: 'Sexta-feira Santa' },
    f('04', '21', 'Tiradentes'),
    f('05', '01', 'Dia do Trabalho'),
    f('09', '07', 'Independência do Brasil'),
    f('10', '12', 'Nossa Senhora Aparecida'),
    f('11', '02', 'Finados'),
    f('11', '15', 'Proclamação da República'),
    f('11', '20', 'Consciência Negra'),
    f('12', '25', 'Natal'),
  ].sort((x, y) => x.data.localeCompare(y.data));
}
