import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ROTULO_STATUS_TAREFA,
  STATUS_TAREFA,
  TarefaResponseSchema,
  TarefasResponseSchema,
  podeFazer,
  type Perfil,
  type Tarefa,
} from '@crm/shared';
import { chamar } from '../api';
import { dataBr } from '../datas';
import { TarefaForm } from './TarefaForm';

type Status = Tarefa['status'];
const ANTERIOR: Record<Status, Status | null> = {
  a_fazer: null,
  fazendo: 'a_fazer',
  feito: 'fazendo',
};
const PROXIMO: Record<Status, Status | null> = {
  a_fazer: 'fazendo',
  fazendo: 'feito',
  feito: null,
};

export function Tarefas({ perfil, usuarioId }: { perfil: Perfil; usuarioId: number }) {
  const qc = useQueryClient();
  const [so, setSo] = useState<'todas' | 'minhas' | 'vencidas'>('todas');
  const [editando, setEditando] = useState<Tarefa | 'nova' | null>(null);
  const equipe = podeFazer(perfil, 'tarefa:atribuir-outros');

  const lista = useQuery({
    queryKey: ['tarefas', so, usuarioId],
    queryFn: () => {
      const p = new URLSearchParams({ porPagina: '100' });
      if (so === 'minhas') p.set('responsavelId', String(usuarioId));
      if (so === 'vencidas') p.set('vencidas', 'true');
      return chamar(`/api/tarefas?${p}`, TarefasResponseSchema);
    },
  });

  const mover = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Status }) =>
      chamar(`/api/tarefas/${id}/status`, TarefaResponseSchema, {
        method: 'PATCH',
        corpo: { status },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tarefas'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const itens = lista.data?.itens ?? [];
  const podeMexer = (t: Tarefa) => equipe || t.responsavelId === usuarioId;

  return (
    <section aria-labelledby="titulo-tarefas">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-tarefas" className="text-lg font-medium">
          Tarefas
        </h2>
        {editando === null && (
          <button
            type="button"
            onClick={() => setEditando('nova')}
            className="rounded bg-ouro px-3 py-1.5 text-sm font-medium text-bg"
          >
            Nova tarefa
          </button>
        )}
      </div>

      {editando !== null && (
        <TarefaForm
          key={editando === 'nova' ? 'nova' : editando.id}
          tarefa={editando === 'nova' ? null : editando}
          perfil={perfil}
          usuarioId={usuarioId}
          onFechar={() => setEditando(null)}
        />
      )}

      <div role="search" className="mb-3">
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          Mostrar
          <select
            value={so}
            onChange={(e) => setSo(e.target.value as typeof so)}
            className="rounded border border-borda bg-bg px-3 py-2"
          >
            <option value="todas">Todas</option>
            <option value="minhas">Só as minhas</option>
            <option value="vencidas">Só atrasadas</option>
          </select>
        </label>
      </div>

      {lista.isPending && <p className="text-suave">Carregando…</p>}
      {lista.error && (
        <p role="alert" className="text-red-300">
          {lista.error.message}
        </p>
      )}
      {mover.error && (
        <p role="alert" className="mb-2 text-red-300">
          {mover.error.message}
        </p>
      )}

      {lista.data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STATUS_TAREFA.map((status) => {
            const coluna = itens.filter((t) => t.status === status);
            return (
              <section
                key={status}
                aria-labelledby={`col-${status}`}
                className="min-w-0 rounded-lg border border-borda bg-surface p-3"
              >
                <h3 id={`col-${status}`} className="mb-2 text-sm font-semibold">
                  {ROTULO_STATUS_TAREFA[status]}{' '}
                  <span className="font-normal text-suave">({coluna.length})</span>
                </h3>
                {coluna.length === 0 && <p className="text-sm text-suave">Nenhuma tarefa.</p>}
                <ul className="flex flex-col gap-2">
                  {coluna.map((t) => (
                    <li key={t.id} className="rounded border border-borda bg-bg p-3 text-sm">
                      <p className="font-medium">{t.titulo}</p>
                      <p className="mt-1 text-suave">{t.responsavelNome}</p>
                      {t.processoNumero && (
                        <p className="whitespace-nowrap text-xs text-suave">{t.processoNumero}</p>
                      )}
                      {t.venceEm && (
                        <p
                          className={
                            t.vencida ? 'mt-1 font-medium text-red-300' : 'mt-1 text-suave'
                          }
                        >
                          {t.vencida ? '⚠ Atrasada · ' : 'Vence '}
                          {dataBr(t.venceEm)}
                        </p>
                      )}
                      {podeMexer(t) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {ANTERIOR[t.status] && (
                            <button
                              type="button"
                              disabled={mover.isPending}
                              onClick={() =>
                                mover.mutate({ id: t.id, status: ANTERIOR[t.status]! })
                              }
                              aria-label={`Voltar "${t.titulo}" para ${ROTULO_STATUS_TAREFA[ANTERIOR[t.status]!]}`}
                              className="rounded border border-borda px-2 py-1 hover:border-ouro"
                            >
                              ← {ROTULO_STATUS_TAREFA[ANTERIOR[t.status]!]}
                            </button>
                          )}
                          {PROXIMO[t.status] && (
                            <button
                              type="button"
                              disabled={mover.isPending}
                              onClick={() => mover.mutate({ id: t.id, status: PROXIMO[t.status]! })}
                              aria-label={`Mover "${t.titulo}" para ${ROTULO_STATUS_TAREFA[PROXIMO[t.status]!]}`}
                              className="rounded border border-borda px-2 py-1 hover:border-ouro"
                            >
                              {ROTULO_STATUS_TAREFA[PROXIMO[t.status]!]} →
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditando(t)}
                            aria-label={`Editar "${t.titulo}"`}
                            className="rounded px-2 py-1 text-suave hover:text-ouro"
                          >
                            Editar
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
