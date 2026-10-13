import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PrazoResponseSchema,
  PrazosResponseSchema,
  ROTULO_STATUS_PRAZO,
  ROTULO_TIPO_PRAZO,
  STATUS_PRAZO,
  TIPOS_PRAZO,
  podeFazer,
  type Perfil,
  type Prazo,
} from '@crm/shared';
import { chamar } from '../api';
import { dataComDia } from '../datas';
import { PrazoForm } from './PrazoForm';

const POR_PAGINA = 10;
const select = 'rounded border border-borda bg-bg px-3 py-2';

/** Situação com texto + ícone (nunca só cor). */
export function Situacao({ p }: { p: Pick<Prazo, 'status' | 'vencido'> }) {
  if (p.vencido)
    return <span className="whitespace-nowrap font-medium text-red-300">⚠ Vencido</span>;
  if (p.status === 'cumprido')
    return <span className="whitespace-nowrap text-ouro">✓ Cumprido</span>;
  if (p.status === 'perdido')
    return <span className="whitespace-nowrap text-suave">✕ Perdido</span>;
  return <span className="whitespace-nowrap">● Pendente</span>;
}

export function Prazos({ perfil, usuarioId }: { perfil: Perfil; usuarioId: number }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [so, setSo] = useState<'todos' | 'meus' | 'vencidos'>('todos');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Prazo | 'novo' | null>(null);

  const lista = useQuery({
    queryKey: ['prazos', status, tipo, so, usuarioId, pagina],
    queryFn: () => {
      const p = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA) });
      if (status) p.set('status', status);
      if (tipo) p.set('tipo', tipo);
      if (so === 'meus') p.set('responsavelId', String(usuarioId));
      if (so === 'vencidos') p.set('vencidos', 'true');
      return chamar(`/api/prazos?${p}`, PrazosResponseSchema);
    },
    placeholderData: keepPreviousData,
  });

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Prazo['status'] }) =>
      chamar(`/api/prazos/${id}/status`, PrazoResponseSchema, {
        method: 'PATCH',
        corpo: { status },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['prazos'] });
      await qc.invalidateQueries({ queryKey: ['agenda'] });
    },
  });

  const podeCriar = podeFazer(perfil, 'prazo:criar');
  const podeEditar = podeFazer(perfil, 'prazo:editar');
  const podeCumprir = podeFazer(perfil, 'prazo:cumprir');
  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const reiniciar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPagina(1);
    };

  return (
    <section aria-labelledby="titulo-prazos">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-prazos" className="text-lg font-medium">
          Prazos e compromissos
        </h2>
        {podeCriar && editando === null && (
          <button
            type="button"
            onClick={() => setEditando('novo')}
            className="rounded bg-ouro px-3 py-1.5 text-sm font-medium text-bg"
          >
            Novo prazo
          </button>
        )}
      </div>

      {editando !== null && (
        <PrazoForm
          key={editando === 'novo' ? 'novo' : editando.id}
          prazo={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
        />
      )}

      <div role="search" className="mb-3 flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Mostrar
          <select
            value={so}
            onChange={(e) => reiniciar(setSo)(e.target.value as typeof so)}
            className={select}
          >
            <option value="todos">Todos</option>
            <option value="meus">Só os meus</option>
            <option value="vencidos">Só vencidos</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            value={status}
            onChange={(e) => reiniciar(setStatus)(e.target.value)}
            className={select}
          >
            <option value="">Todos</option>
            {STATUS_PRAZO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_PRAZO[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tipo
          <select
            value={tipo}
            onChange={(e) => reiniciar(setTipo)(e.target.value)}
            className={select}
          >
            <option value="">Todos</option>
            {TIPOS_PRAZO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_PRAZO[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lista.isPending && <p className="text-suave">Carregando…</p>}
      {lista.error && <p role="alert">{lista.error.message}</p>}
      {mudarStatus.error && (
        <p role="alert" className="mb-2 text-red-300">
          {mudarStatus.error.message}
        </p>
      )}

      {lista.data && (
        <>
          <p aria-live="polite" className="mb-2 text-sm text-suave">
            {total === 0 ? 'Nenhum prazo encontrado.' : total === 1 ? '1 item' : `${total} itens`}
          </p>
          {total > 0 && (
            <div className="relative overflow-x-auto rounded border border-borda">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Prazos e compromissos, do vencimento mais próximo ao mais distante
                </caption>
                <thead className="bg-surface text-suave">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Vencimento
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Tipo
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Processo / cliente
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Responsável
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Situação
                    </th>
                    {(podeEditar || podeCumprir) && (
                      <th scope="col" className="px-3 py-2">
                        <span className="sr-only">Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lista.data.itens.map((p) => (
                    <tr key={p.id} className="border-t border-borda align-top">
                      <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium">
                        {dataComDia(p.venceData)}
                        <span className="block text-xs font-normal text-suave">{p.venceHora}</span>
                      </th>
                      <td className="px-3 py-2">
                        {ROTULO_TIPO_PRAZO[p.tipo]}
                        {p.observacao && (
                          <span className="block text-xs text-suave">{p.observacao}</span>
                        )}
                        {p.diasUteis !== null && p.intimacaoEm && (
                          <span className="block text-xs text-suave">{p.diasUteis} dias úteis</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="whitespace-nowrap font-mono text-xs">
                          {p.processoNumero}
                        </span>
                        <span className="block text-xs text-suave">{p.clienteNome}</span>
                      </td>
                      <td className="px-3 py-2">{p.responsavelNome}</td>
                      <td className="px-3 py-2">
                        <Situacao p={p} />
                      </td>
                      {(podeEditar || podeCumprir) && (
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {podeEditar && (
                              <button
                                type="button"
                                onClick={() => setEditando(p)}
                                aria-label={`Editar prazo de ${p.processoNumero}`}
                                className="underline underline-offset-4 hover:text-ouro"
                              >
                                Editar
                              </button>
                            )}
                            {podeCumprir && p.status === 'pendente' && (
                              <>
                                <button
                                  type="button"
                                  disabled={mudarStatus.isPending}
                                  onClick={() =>
                                    mudarStatus.mutate({ id: p.id, status: 'cumprido' })
                                  }
                                  aria-label={`Marcar como cumprido: ${p.processoNumero}`}
                                  className="underline underline-offset-4 hover:text-ouro"
                                >
                                  Cumprir
                                </button>
                                <button
                                  type="button"
                                  disabled={mudarStatus.isPending}
                                  onClick={() =>
                                    mudarStatus.mutate({ id: p.id, status: 'perdido' })
                                  }
                                  aria-label={`Marcar como perdido: ${p.processoNumero}`}
                                  className="underline underline-offset-4 hover:text-red-300"
                                >
                                  Perdido
                                </button>
                              </>
                            )}
                            {podeCumprir && p.status !== 'pendente' && (
                              <button
                                type="button"
                                disabled={mudarStatus.isPending}
                                onClick={() => mudarStatus.mutate({ id: p.id, status: 'pendente' })}
                                aria-label={`Reabrir: ${p.processoNumero}`}
                                className="underline underline-offset-4"
                              >
                                Reabrir
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3 text-sm">
            <button
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
              className="rounded border border-borda px-3 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              Página {pagina} de {paginas}
            </span>
            <button
              type="button"
              disabled={pagina >= paginas}
              onClick={() => setPagina((p) => p + 1)}
              className="rounded border border-borda px-3 py-1 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </section>
  );
}
