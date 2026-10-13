import { useState } from 'react';
import { escalaLinear, marcasDeContagem } from './escala';
import { useLargura } from './useLargura';
import { Amostra, CINZA_TEXTO, Quadro, caminhoBarra } from './Quadro';

export type ItemBarra = { chave: string; rotulo: string; valor: number };

const LINHA = 38;
const ESPESSURA = 18; // fina (máx. 24px)
const M = { esq: 132, dir: 44, topo: 6, base: 26 };

/**
 * Comparação de categorias: barras horizontais, uma série só (sem legenda; o título diz o que é).
 * Um tom só: a cor não carrega informação além de "é a mesma medida".
 */
export function GraficoBarras({
  titulo,
  descricao,
  unidade,
  itens,
}: {
  titulo: string;
  descricao: string;
  unidade: string;
  itens: ItemBarra[];
}) {
  const { ref, largura } = useLargura();
  const [ativo, setAtivo] = useState<string | null>(null);
  const max = Math.max(0, ...itens.map((i) => i.valor));
  const marcas = marcasDeContagem(max);
  const x = escalaLinear(0, marcas[marcas.length - 1] as number, M.esq, largura - M.dir);
  const altura = M.topo + itens.length * LINHA + M.base;

  return (
    <Quadro
      titulo={titulo}
      descricao={descricao}
      colunas={['Categoria', unidade]}
      linhas={itens.map((i) => [i.rotulo, i.valor])}
    >
      <div
        ref={ref}
        className="relative overflow-hidden"
        role="group"
        aria-label={`Gráfico de barras: ${titulo}. Os mesmos dados estão na tabela abaixo.`}
      >
        <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} className="block">
          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={x(m)}
                x2={x(m)}
                y1={M.topo}
                y2={altura - M.base}
                stroke="var(--color-viz-grade)"
              />
              <text
                x={x(m)}
                y={altura - M.base + 16}
                textAnchor="middle"
                fontSize={11}
                fill={CINZA_TEXTO}
              >
                {m}
              </text>
            </g>
          ))}
          <line
            x1={x(0)}
            x2={x(0)}
            y1={M.topo}
            y2={altura - M.base}
            stroke="var(--color-viz-eixo)"
          />
          {itens.map((it, i) => {
            const meio = M.topo + i * LINHA + LINHA / 2;
            const fim = x(it.valor);
            return (
              <g
                key={it.chave}
                tabIndex={0}
                role="img"
                aria-label={`${it.rotulo}: ${it.valor} ${unidade}`}
                data-testid={`barra-${it.chave}`}
                onPointerEnter={() => setAtivo(it.chave)}
                onPointerLeave={() => setAtivo(null)}
                onFocus={() => setAtivo(it.chave)}
                onBlur={() => setAtivo(null)}
                style={{ outline: 'none' }}
              >
                <rect
                  x={0}
                  y={meio - LINHA / 2}
                  width={largura}
                  height={LINHA}
                  fill={ativo === it.chave ? 'var(--color-texto)' : 'transparent'}
                  opacity={ativo === it.chave ? 0.06 : 1}
                />
                <text
                  x={M.esq - 10}
                  y={meio}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={12}
                  fill="var(--color-texto)"
                >
                  {it.rotulo}
                </text>
                {it.valor > 0 && (
                  <path d={caminhoBarra(x(0), fim, meio, ESPESSURA)} fill="var(--color-viz-1)" />
                )}
                <text
                  x={fim + 8}
                  y={meio}
                  dy="0.32em"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--color-texto)"
                >
                  {it.valor}
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
            return (
              <div
                role="tooltip"
                className="pointer-events-none absolute right-0 z-10 w-44 rounded-md border border-borda bg-bg px-3 py-2 text-sm shadow-lg"
                style={{ top: Math.min(M.topo + (i + 1) * LINHA - 14, altura - 76) }}
              >
                <p className="text-xs text-suave">{it.rotulo}</p>
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
