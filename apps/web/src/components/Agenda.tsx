import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FeriadosResponseSchema,
  PrazosResponseSchema,
  ROTULO_TIPO_PRAZO,
  hojeEmBrasilia,
  somarDias,
  type Prazo,
} from '@crm/shared';
import { chamar } from '../api';
import { MESES, dataComDia, limitesDoMes, semanasDoMes } from '../datas';
import { Situacao } from './Prazos';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function Agenda() {
  const hoje = hojeEmBrasilia(new Date());
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const proximos = useQuery({
    queryKey: ['agenda', 'proximos', hoje],
    queryFn: () =>
      chamar(
        `/api/prazos?status=pendente&de=${hoje}&ate=${somarDias(hoje, 7)}&porPagina=100`,
        PrazosResponseSchema,
      ),
  });
  const vencidos = useQuery({
    queryKey: ['agenda', 'vencidos'],
    queryFn: () => chamar('/api/prazos?vencidos=true&porPagina=100', PrazosResponseSchema),
  });
  const { de, ate } = limitesDoMes(ano, mes);
  const doMes = useQuery({
    queryKey: ['agenda', 'mes', ano, mes],
    queryFn: () => chamar(`/api/prazos?de=${de}&ate=${ate}&porPagina=100`, PrazosResponseSchema),
  });
  const feriados = useQuery({
    queryKey: ['feriados'],
    queryFn: () => chamar('/api/feriados', FeriadosResponseSchema),
  });
  const nomeFeriado = new Map(feriados.data?.feriados.map((f) => [f.data, f.nome]));

  const porDia = new Map<string, Prazo[]>();
  for (const p of doMes.data?.itens ?? [])
    porDia.set(p.venceData, [...(porDia.get(p.venceData) ?? []), p]);

  function mover(delta: number) {
    const idx = ano * 12 + (mes - 1) + delta;
    setAno(Math.floor(idx / 12));
    setMes((idx % 12) + 1);
    setDiaSel(null);
  }

  const lista = (itens: Prazo[]) => (
    <ul className="flex flex-col gap-2">
      {itens.map((p) => (
        <li key={p.id} className="rounded border border-borda bg-surface px-3 py-2 text-sm">
          <span className="font-medium">
            {dataComDia(p.venceData)} · {p.venceHora}
          </span>{' '}
          — {ROTULO_TIPO_PRAZO[p.tipo]}
          {p.observacao ? `: ${p.observacao}` : ''}
          <span className="block text-xs text-suave">
            <span className="font-mono">{p.processoNumero}</span> · {p.clienteNome} ·{' '}
            {p.responsavelNome} · <Situacao p={p} />
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="titulo-agenda" className="flex flex-col gap-6">
      <h2 id="titulo-agenda" className="text-lg font-medium">
        Agenda
      </h2>

      {vencidos.data && vencidos.data.total > 0 && (
        <div>
          <h3 className="mb-2 font-medium text-red-300">⚠ Vencidos ({vencidos.data.total})</h3>
          {lista(vencidos.data.itens)}
        </div>
      )}

      <div>
        <h3 className="mb-2 font-medium">Próximos 7 dias</h3>
        {proximos.isPending && <p className="text-suave">Carregando…</p>}
        {proximos.data &&
          (proximos.data.total === 0 ? (
            <p className="text-sm text-suave">Nada pendente nos próximos 7 dias.</p>
          ) : (
            lista(proximos.data.itens)
          ))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => mover(-1)}
            aria-label="Mês anterior"
            className="rounded border border-borda px-3 py-1"
          >
            ‹
          </button>
          <h3 className="min-w-40 text-center font-medium" aria-live="polite">
            {MESES[mes - 1]} {ano}
          </h3>
          <button
            type="button"
            onClick={() => mover(1)}
            aria-label="Próximo mês"
            className="rounded border border-borda px-3 py-1"
          >
            ›
          </button>
        </div>
        <div className="relative overflow-x-auto rounded border border-borda">
          <table className="w-full table-fixed text-sm" style={{ minWidth: 560 }}>
            <caption className="sr-only">
              Calendário de {MESES[mes - 1]} de {ano}
            </caption>
            <thead className="bg-surface text-suave">
              <tr>
                {SEMANA.map((d) => (
                  <th key={d} scope="col" className="px-2 py-1 text-left font-normal">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanasDoMes(ano, mes).map((semana, i) => (
                <tr key={i} className="border-t border-borda align-top">
                  {semana.map((dia, j) => {
                    if (!dia) return <td key={j} className="bg-bg/40" />;
                    const itens = porDia.get(dia) ?? [];
                    const feriado = nomeFeriado.get(dia);
                    return (
                      <td key={dia} className={`h-20 p-1 ${dia === hoje ? 'bg-surface' : ''}`}>
                        <button
                          type="button"
                          onClick={() => setDiaSel(dia === diaSel ? null : dia)}
                          aria-pressed={dia === diaSel}
                          aria-label={`${dataComDia(dia)}${feriado ? `, feriado: ${feriado}` : ''}, ${itens.length} compromisso${itens.length === 1 ? '' : 's'}`}
                          className="flex h-full w-full flex-col items-start rounded p-1 text-left hover:bg-surface aria-pressed:outline aria-pressed:outline-1 aria-pressed:outline-ouro"
                        >
                          <span className={dia === hoje ? 'font-bold text-ouro' : ''}>
                            {Number(dia.slice(8))}
                          </span>
                          {feriado && (
                            <span className="truncate text-[10px] text-suave">★ {feriado}</span>
                          )}
                          {itens.length > 0 && (
                            <span className="text-[11px] text-ouro">● {itens.length}</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {diaSel && (
          <div className="mt-3" aria-live="polite">
            <h4 className="mb-2 text-sm font-medium">{dataComDia(diaSel)}</h4>
            {(porDia.get(diaSel) ?? []).length === 0 ? (
              <p className="text-sm text-suave">Nenhum compromisso neste dia.</p>
            ) : (
              lista(porDia.get(diaSel)!)
            )}
          </div>
        )}
      </div>
    </section>
  );
}
