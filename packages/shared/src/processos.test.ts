import { describe, expect, it } from 'vitest';
import { gerarCnj } from './cnj';
import { ProcessoBodySchema } from './processos';

const numero = gerarCnj({
  sequencial: '0000001',
  ano: '2099',
  justica: '8',
  tribunal: '26',
  origem: '0100',
});
const ok = {
  numeroCnj: numero,
  clienteId: 1,
  area: 'civel',
  vara: '1ª Vara Cível Fictícia',
  responsavelId: 2,
  abertoEm: '2099-01-15',
};

describe('ProcessoBodySchema', () => {
  it('aceita um processo válido e usa status padrão', () => {
    expect(ProcessoBodySchema.parse(ok).status).toBe('em_andamento');
  });
  it.each([
    ['CNJ com DV errado', { numeroCnj: '0000001-99.2099.8.26.0100' }],
    ['data inexistente', { abertoEm: '2099-02-30' }],
    ['data em outro formato', { abertoEm: '15/01/2099' }],
    ['área desconhecida', { area: 'militar' }],
    ['vara curta', { vara: 'a' }],
    ['clienteId inválido', { clienteId: 0 }],
  ])('recusa %s', (_n, parte) => {
    expect(ProcessoBodySchema.safeParse({ ...ok, ...parte }).success).toBe(false);
  });
});
