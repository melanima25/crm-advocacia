import { useState } from 'react';
import { escalaLinear, marcasDeContagem } from './escala';
import { useLargura } from './useLargura';
import { Amostra, CINZA_TEXTO, Quadro } from './Quadro';

export type ItemColuna = { chave: string; rotulo: string; detalhe: string; valor: number };

const M = { esq: 30, dir: 8, topo: 20, base: 40 };
const ALTURA = 210;
const LARGURA_MAX = 24;

/** Contagem por dia: colunas finas com base no zero e topo arredondado (4px). Uma série, sem legenda. */
export function GraficoColunas({
  titulo,
  descricao,
  unidade,
  itens,
}: {
  titulo: string;
  descricao: string;
  unidade: string;
  itens: ItemColuna[];
}) {
  const { ref, largura } = useLargura();
  const [ativo, setAtivo] = useState<string | null>(null);
  const max = Math.max(0, ...itens.map((i) => i.valor));
  const marcas = marcasDeContagem(max);
  const y = escalaLinear(0, marcas[marcas.length - 1] as number, ALTURA - M.base, M.topo);
  const passo = (largura - M.esq - M.dir) / itens.length;
  const larg = Math.min(LARGURA_MAX, passo * 0.5);
  const centro = (i: number) => M.esq + passo * i + passo / 2;

  return (
    <Quadro
      titulo={titulo}
      descricao={descricao}
      colunas={['Dia', unidade]}
      linhas={itens.map((i) => [`${i.rotulo} ${i.detalhe}`, i.valor])}
    >
      <div
        ref={ref}
        className="relative overflow-hidden"
        role="group"
        aria-label={`Gráfico de colunas: ${titulo}. Os mesmos dados estão na tabela abaixo.`}
      >
        <svg width={largura} height={ALTURA} viewBox={`0 0 ${largura} ${ALTURA}`} className="block">
          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={M.esq}
                x2={largura - M.dir}
                y1={y(m)}
                y2={y(m)}
                stroke={m === 0 ? 'var(--color-viz-eixo)' : 'var(--color-viz-grade)'}
              />
              <text
                x={M.esq - 8}
                y={y(m)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill={CINZA_TEXTO}
              >
                {m}
              </text>
            </g>
          ))}
          {itens.map((it, i) => {
            const cx = centro(i);
            const topo = y(it.valor);
            const base = y(0);
            const r = Math.min(4, larg / 2, base - topo);
            return (
              <g
                key={it.chave}
                tabIndex={0}
                role="img"
                aria-label={`${it.rotulo} ${it.detalhe}: ${it.valor} ${unidade}`}
                data-testid={`coluna-${it.chave}`}
                onPointerEnter={() => setAtivo(it.chave)}
                onPointerLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(it.chave)}
                onBlur={() => setAtivo(null)}
                style={{ outline: 'none' }}
              >
                <rect
                  x={cx - passo / 2}
                  y={M.topo - 8}
                  width={passo}
                  height={ALTURA - M.base - M.topo + 8}
                  fill={ativo === it.chave ? 'var(--color-texto)' : 'transparent'}
                  opacity={ativo === it.chave ? 0.06 : 1}
                />
                {it.valor > 0 && (
                  <>
                    <path
                      d={`M${cx - larg / 2},${base} V${topo + r} Q${cx - larg / 2},${topo} ${cx - larg / 2 + r},${topo} H${cx + larg / 2 - r} Q${cx + larg / 2},${topo} ${cx + larg / 2},${topo + r} V${base} Z`}
                      fill="var(--color-viz-1)"
                    />
                    <text
                      x={cx}
                      y={topo - 6}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight={600}
                      fill="var(--color-texto)"
                    >
                      {it.valor}
                    </text>
                  </>
                )}
                <text
                  x={cx}
                  y={ALTURA - M.base + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-texto)"
                >
                  {it.rotulo}
                </text>
                <text
                  x={cx}
                  y={ALTURA - M.base + 30}
                  textAnchor="middle"
                  fontSize={11}
                  fill={CINZA_TEXTO}
                >
                  {it.detalhe}
                </text>
              </g>
            );
          })}
        </svg>
        {ativo !== null &&
          (() => {
            const i = itens.findIndex((it) => it.chave === ativo);
            const it = itens[i];
            if (!it) return null;
            const esquerda = Math.min(Math.max(centro(i) - 80, 0), largura - 160);
            return (
              <div
                role="tooltip"
                className="pointer-events-none absolute z-10 w-40 rounded-md border border-borda bg-bg px-3 py-2 text-sm shadow-lg"
                style={{ left: esquerda, top: 0 }}
              >
                <p className="text-xs text-suave">
                  {it.rotulo} {it.detalhe}
                </p>
                <p className="flex items-center gap-2 font-semibold">
                  <Amostra cor="var(--color-viz-1)" />
                  {it.valor} {unidade}
                </p>
              </div>
            );
          })()}
      </div>
    </Quadro>
  );
}
