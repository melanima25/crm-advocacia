import type { ReactNode } from 'react';

/** Moldura comum: título, descrição, gráfico e a tabela equivalente (os mesmos dados, em texto). */
export function Quadro({
  titulo,
  descricao,
  colunas,
  linhas,
  children,
}: {
  titulo: string;
  descricao: string;
  colunas: string[];
  linhas: (string | number)[][];
  children: ReactNode;
}) {
  return (
    <figure className="min-w-0 rounded-lg border border-borda bg-surface p-4">
      <figcaption className="mb-3">
        <h3 className="text-base font-semibold">{titulo}</h3>
        <p className="text-sm text-suave">{descricao}</p>
      </figcaption>
      {children}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-suave hover:text-texto">
          Ver dados do gráfico em tabela
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">
            {titulo}: {descricao}
          </caption>
          <thead>
            <tr className="text-suave">
              {colunas.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`py-1 font-medium ${i === 0 ? 'pr-4' : 'pl-2 text-right'}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={String(l[0])} className="border-t border-borda">
                {l.map((v, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="py-1 pr-4 font-normal">
                      {v}
                    </th>
                  ) : (
                    <td key={i} className="py-1 pl-2 text-right tabular-nums">
                      {v}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Quadradinho de cor ao lado do texto: a cor identifica, o texto continua na cor de texto. */
export function Amostra({ cor }: { cor: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-3 shrink-0 rounded-sm"
      style={{ background: cor }}
    />
  );
}

export const CINZA_TEXTO = 'var(--color-suave)';

/** Barra horizontal: base reta no zero, ponta de 4px arredondada. */
export function caminhoBarra(x0: number, x1: number, meio: number, espessura: number): string {
  const c = Math.max(0, x1 - x0);
  const r = Math.min(4, c / 2);
  const t = meio - espessura / 2;
  const b = meio + espessura / 2;
  return `M${x0},${t} H${x1 - r} Q${x1},${t} ${x1},${t + r} V${b - r} Q${x1},${b} ${x1 - r},${b} H${x0} Z`;
}
