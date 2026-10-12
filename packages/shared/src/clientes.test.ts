import { describe, expect, it } from 'vitest';
import { ClienteBodySchema, ClientesQuerySchema, diffCampos } from './clientes';

describe('ClienteBodySchema', () => {
  it('normaliza: apara espaços, e-mail em minúsculas, vazios viram null', () => {
    const r = ClienteBodySchema.parse({
      tipo: 'PF',
      nome: '  Maria Exemplo  ',
      email: ' MARIA@Exemplo.COM ',
      documento: '',
      telefone: '  ',
    });
    expect(r).toEqual({
      tipo: 'PF',
      nome: 'Maria Exemplo',
      email: 'maria@exemplo.com',
      documento: null,
      telefone: null,
    });
  });
  it('só exige tipo e nome', () => {
    expect(ClienteBodySchema.safeParse({ tipo: 'PJ', nome: 'Empresa Exemplo' }).success).toBe(true);
  });
  it.each([
    [{ tipo: 'XX', nome: 'Fulano' }],
    [{ tipo: 'PF', nome: 'A' }],
    [{ tipo: 'PF', nome: 'Fulano', email: 'sem-arroba' }],
    [{ tipo: 'PF', nome: 'Fulano', documento: '<script>' }],
    [{ tipo: 'PF', nome: 'x'.repeat(121) }],
  ])('recusa %j', (corpo) => {
    expect(ClienteBodySchema.safeParse(corpo).success).toBe(false);
  });
});

describe('ClientesQuerySchema', () => {
  it('aplica padrões e limita porPagina a 100', () => {
    expect(ClientesQuerySchema.parse({})).toEqual({ pagina: 1, porPagina: 10 });
    expect(ClientesQuerySchema.safeParse({ porPagina: '101' }).success).toBe(false);
    expect(ClientesQuerySchema.safeParse({ pagina: '0' }).success).toBe(false);
  });
});

describe('diffCampos', () => {
  it('lista só o que mudou', () => {
    expect(diffCampos({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', c: null })).toEqual({
      b: { de: 'x', para: 'y' },
    });
  });
  it('vazio quando nada mudou', () => {
    expect(diffCampos({ a: 1 }, { a: 1 })).toEqual({});
  });
});
