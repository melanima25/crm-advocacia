import { describe, expect, it } from 'vitest';
import { escalaLinear, marcasDeContagem, marcasDoEixo } from './escala';

describe('marcasDoEixo', () => {
  it('usa números redondos que cobrem os dados', () => {
    expect(marcasDoEixo(0, 87)).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it('lida com intervalo vazio', () => {
    expect(marcasDoEixo(5, 5)).toEqual([5, 6]);
  });
});

describe('marcasDeContagem', () => {
  it('só inteiros, de 0 até cobrir o máximo', () => {
    for (const max of [0, 1, 2, 3, 5, 7, 12, 40]) {
      const m = marcasDeContagem(max);
      expect(m[0]).toBe(0);
      expect(m.every(Number.isInteger)).toBe(true);
      expect(m[m.length - 1]).toBeGreaterThanOrEqual(max);
      expect(m.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('máximo pequeno vira passo 1', () => {
    expect(marcasDeContagem(2)).toEqual([0, 1, 2]);
  });
});

describe('escalaLinear', () => {
  it('mapeia e inverte (eixo Y de tela)', () => {
    const y = escalaLinear(0, 100, 200, 0);
    expect(y(0)).toBe(200);
    expect(y(100)).toBe(0);
    expect(y(50)).toBe(100);
  });
  it('domínio de largura zero fica no meio', () => {
    expect(escalaLinear(3, 3, 0, 10)(3)).toBe(5);
  });
});
