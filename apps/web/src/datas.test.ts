import { describe, expect, it } from 'vitest';
import { dataBr, dataComDia, limitesDoMes, semanasDoMes } from './datas';

describe('datas', () => {
  it('formata dd/mm/aaaa e dia da semana', () => {
    expect(dataBr('2026-10-12')).toBe('12/10/2026');
    expect(dataComDia('2026-10-12')).toBe('seg 12/10/2026');
  });
  it('limites do mês, inclusive fevereiro bissexto e dezembro', () => {
    expect(limitesDoMes(2028, 2)).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
    expect(limitesDoMes(2026, 12)).toEqual({ de: '2026-12-01', ate: '2026-12-31' });
  });
  it('grade do mês: semanas de 7, começa no domingo, contém todos os dias uma vez', () => {
    const semanas = semanasDoMes(2026, 10); // 01/10/2026 é quinta
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanas[0]!.slice(0, 4)).toEqual([null, null, null, null]);
    expect(semanas[0]![4]).toBe('2026-10-01');
    const dias = semanas.flat().filter(Boolean);
    expect(dias).toHaveLength(31);
    expect(new Set(dias).size).toBe(31);
  });
});
