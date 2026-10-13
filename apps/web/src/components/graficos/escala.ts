/** Matemática dos gráficos, sem React: escalas e marcas de eixo. Testada em escala.test.ts. */

/** Marcas "redondas" (1, 2, 5 × 10^n) cobrindo [min, max]. */
export function marcasDoEixo(min: number, max: number, alvo = 5): number[] {
  if (!(max > min)) {
    const base = Number.isFinite(min) ? min : 0;
    return [base, base + 1];
  }
  const bruto = (max - min) / Math.max(1, alvo - 1);
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / potencia;
  const passo = (f <= 1.5 ? 1 : f <= 3 ? 2 : f <= 7 ? 5 : 10) * potencia;
  const inicio = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const marcas: number[] = [];
  for (let v = inicio; v <= fim + passo / 1e6; v += passo) marcas.push(Number(v.toPrecision(12)));
  return marcas;
}

/** Mapeia [d0, d1] -> [r0, r1]. Domínio de largura zero cai no meio. */
export function escalaLinear(d0: number, d1: number, r0: number, r1: number) {
  return (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
}

/** Marcas para contagens: sempre inteiras, começam em 0 (barra tem base no zero) e cobrem o máximo. */
export function marcasDeContagem(max: number, alvo = 4): number[] {
  const topo = Math.max(1, Math.ceil(max));
  const marcas = marcasDoEixo(0, topo, alvo).filter((m) => Number.isInteger(m));
  if (marcas.length >= 2) return marcas;
  return Array.from({ length: topo + 1 }, (_, i) => i);
}
