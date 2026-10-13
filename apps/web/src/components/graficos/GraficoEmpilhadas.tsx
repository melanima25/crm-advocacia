import { useState } from 'react';
import { escalaLinear, marcasDeContagem } from './escala';
import { useLargura } from './useLargura';
import { Amostra, CINZA_TEXTO, Quadro, caminhoBarra } from './Quadro';

export type ItemPilha = { chave: string; rotulo: string; a: number; b: number; extra?: string };

const LINHA = 44;
const ESPESSURA = 20;
const FOLGA = 2; // respiro entre os segmentos
const M = { esq: 132, dir: 44, topo: 6, base: 26 };
const COR_A = 'var(--color-viz-1)';
const COR_B = 'var(--color-viz-2)';

/** Duas medidas somadas por pessoa (barra empilhada): legenda sempre presente, 2px de respiro entre as cores. */
export function GraficoEmpilhadas({
  titulo,
  descricao,
  nomeA,
  nomeB,
  itens,
}: {
  titulo: string;
  descricao: string;
  nomeA: string;
  nomeB: string;
  itens: ItemPilha[];
}) {
  const { ref, largura } = useLargura();
  const [ativo, setAtivo] = useState<string | null>(null);
  const max = Math.max(0, ...itens.map((i) => i.a + i.b));
  const marcas = marcasDeContagem(max);
  const x = escalaLinear(0, marcas[marcas.length - 1] as number, M.esq, largura - M.dir);
  const altura = M.topo + Math.max(1, itens.length) * LINHA + M.base;

  return (
    <Quadro
      titulo={titulo}
      descricao={descricao}
      colunas={['Pessoa', nomeA, nomeB, 'Total']}
      linhas={itens.map((i) => [i.rotulo, i.a, i.b, i.a + i.b])}
    >
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legenda">
        <li className="flex items-center gap-2">
          <Amostra cor={COR_A} />
          {nomeA}
        </li>
        <li className="flex items-center gap-2">
          <Amostra cor={COR_B} />
          {nomeB}
        </li>
      </ul>
      <div
        ref={ref}
        className="relative overflow-hidden"
        role="group"
        aria-label={`Gráfico de barras empilhadas: ${titulo}. Os mesmos dados estão na tabela abaixo.`}
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
            const t = meio - ESPESSURA / 2;
            const fimA = x(it.a);
            const fimTotal = x(it.a + it.b);
            // 1ª cor: base reta no zero, lado de dentro reto; 2ª cor: ponta externa arredondada
            const iniB = it.a > 0 ? fimA + FOLGA : x(0);
            const rB = Math.min(4, (fimTotal - iniB) / 2);
            return (
              <g
                key={it.chave}
                tabIndex={0}
                role="img"
                aria-label={`${it.rotulo}: ${it.a} ${nomeA}, ${it.b} ${nomeB}`}
                data-testid={`pilha-${it.chave}`}
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
                {it.a > 0 &&
                  (it.b > 0 ? (
                    <rect
                      x={x(0)}
                      y={t}
                      width={Math.max(0, fimA - x(0))}
                      height={ESPESSURA}
                      fill={COR_A}
                    />
                  ) : (
                    <path d={caminhoBarra(x(0), fimA, meio, ESPESSURA)} fill={COR_A} />
                  ))}
                {it.b > 0 && (
                  <path
                    d={`M${iniB},${t} H${fimTotal - rB} Q${fimTotal},${t} ${fimTotal},${t + rB} V${t + ESPESSURA - rB} Q${fimTotal},${t + ESPESSURA} ${fimTotal - rB},${t + ESPESSURA} H${iniB} Z`}
                    fill={COR_B}
                  />
                )}
                <text
                  x={fimTotal + 8}
                  y={meio}
                  dy="0.32em"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--color-texto)"
                >
                  {it.a + it.b}
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
                className="pointer-events-none absolute right-0 z-10 w-52 rounded-md border border-borda bg-bg px-3 py-2 text-sm shadow-lg"
                style={{ top: Math.min(M.topo + (i + 1) * LINHA - 12, altura - 100) }}
              >
                <p className="text-xs text-suave">{it.rotulo}</p>
                <p className="flex items-center gap-2">
                  <Amostra cor={COR_A} />
                  {nomeA}: <strong>{it.a}</strong>
                </p>
                <p className="flex items-center gap-2">
                  <Amostra cor={COR_B} />
                  {nomeB}: <strong>{it.b}</strong>
                </p>
                {it.extra && <p className="text-xs text-suave">{it.extra}</p>}
              </div>
            );
          })()}
      </div>
    </Quadro>
  );
}
