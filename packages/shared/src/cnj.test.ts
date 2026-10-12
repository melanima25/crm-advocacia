import { describe, expect, it } from 'vitest';
import { cnjValido, gerarCnj, parteCnj } from './cnj';

/** Implementação independente, em etapas (Anexo VIII, V da Res. CNJ 65/2008), para cruzar com a principal. */
function dvEmEtapas(seq: string, ano: string, j: string, tr: string, o: string): string {
  const r1 = Number(seq) % 97;
  const r2 = Number(`${r1}${ano}${j}${tr}`) % 97;
  const r3 = Number(`${r2}${o}00`) % 97;
  return String(98 - r3).padStart(2, '0');
}

describe('gerarCnj / cnjValido', () => {
  const casos = [
    ['0000001', '2099', '8', '26', '0100'],
    ['1234567', '2099', '5', '02', '0001'],
    ['0000100', '2008', '1', '00', '0000'],
    ['9999999', '1999', '4', '99', '9999'],
    ['0000000', '2050', '3', '01', '0000'],
  ] as const;
  it.each(casos)(
    'o DV gerado bate com o cálculo em etapas (%s %s %s %s %s)',
    (seq, ano, j, tr, o) => {
      const numero = gerarCnj({ sequencial: seq, ano, justica: j, tribunal: tr, origem: o });
      expect(parteCnj(numero)?.dv).toBe(dvEmEtapas(seq, ano, j, tr, o));
      expect(cnjValido(numero)).toBe(true);
    },
  );

  it('número completo (com DD) dá resto 1 na divisão por 97', () => {
    const n = gerarCnj({
      sequencial: '0000001',
      ano: '2099',
      justica: '8',
      tribunal: '26',
      origem: '0100',
    });
    const p = parteCnj(n)!;
    expect(BigInt(`${p.sequencial}${p.ano}${p.justica}${p.tribunal}${p.origem}${p.dv}`) % 97n).toBe(
      1n,
    );
  });

  it('recusa dígito verificador errado (qualquer troca de 1 dígito do DD)', () => {
    const n = gerarCnj({
      sequencial: '0000001',
      ano: '2099',
      justica: '8',
      tribunal: '26',
      origem: '0100',
    });
    const dv = parteCnj(n)!.dv;
    for (let d = 0; d < 100; d++) {
      const outro = String(d).padStart(2, '0');
      expect(cnjValido(n.replace(`-${dv}.`, `-${outro}.`))).toBe(outro === dv);
    }
  });

  it('recusa alteração em qualquer outro campo', () => {
    const n = '0000001-11.2099.8.26.0100';
    expect(cnjValido(n)).toBe(true);
    for (const outro of [
      '0000002-11.2099.8.26.0100',
      '0000001-11.2098.8.26.0100',
      '0000001-11.2099.7.26.0100',
      '0000001-11.2099.8.27.0100',
      '0000001-11.2099.8.26.0101',
    ])
      expect(cnjValido(outro)).toBe(false);
  });

  it.each([
    '',
    '123',
    '0000001-11.2099.8.26.010',
    '0000001112099826 0100',
    '0000001-11.2099.0.26.0100',
    'abcdefg-11.2099.8.26.0100',
    ' 0000001-11.2099.8.26.0100',
  ])('recusa formato inválido: %j', (n) => expect(cnjValido(n)).toBe(false));

  it('recusa ano fora de 1900–2099', () => {
    expect(
      cnjValido(
        gerarCnj({
          sequencial: '0000001',
          ano: '1899',
          justica: '8',
          tribunal: '26',
          origem: '0100',
        }),
      ),
    ).toBe(false);
    expect(
      cnjValido(
        gerarCnj({
          sequencial: '0000001',
          ano: '2100',
          justica: '8',
          tribunal: '26',
          origem: '0100',
        }),
      ),
    ).toBe(false);
  });
});
