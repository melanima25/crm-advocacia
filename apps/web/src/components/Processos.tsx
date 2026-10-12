import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  AREAS,
  ProcessosResponseSchema,
  ROTULO_AREA,
  ROTULO_STATUS_PROCESSO,
  STATUS_PROCESSO,
  podeFazer,
  type Perfil,
  type Processo,
} from '@crm/shared';
import { chamar } from '../api';
import { ProcessoForm } from './ProcessoForm';

const POR_PAGINA = 10;

function useAtrasado<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

const dataBr = (iso: string) => iso.split('-').reverse().join('/');
const select = 'rounded border border-borda bg-bg px-3 py-2';

export function Processos({ perfil }: { perfil: Perfil }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Processo | 'novo' | null>(null);
  const q = useAtrasado(busca.trim());

  const lista = useQuery({
    queryKey: ['processos', q, status, area, pagina],
    queryFn: () => {
      const p = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA) });
      if (q) p.set('q', q);
      if (status) p.set('status', status);
      if (area) p.set('area', area);
      return chamar(`/api/processos?${p}`, ProcessosResponseSchema);
    },
    placeholderData: keepPreviousData,
  });

  const excluir = useMutation({
    mutationFn: (p: Processo) =>
      chamar(`/api/processos/${p.id}`, z.object({ ok: z.boolean() }), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processos'] }),
  });

  const podeCriar = podeFazer(perfil, 'processo:criar');
  const podeEditar = podeFazer(perfil, 'processo:editar');
  const podeExcluir = podeFazer(perfil, 'processo:excluir');
  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const reiniciar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPagina(1);
    };

  return (
    <section aria-labelledby="titulo-processos">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-processos" className="text-lg font-medium">
          Processos
        </h2>
        {podeCriar && editando === null && (
          <button
            type="button"
            onClick={() => setEditando('novo')}
            className="rounded bg-ouro px-3 py-1.5 text-sm font-medium text-bg"
          >
            Novo processo
          </button>
        )}
      </div>
      {!podeCriar && <p className="mb-3 text-sm text-suave">Seu perfil só visualiza processos.</p>}

      {editando !== null && (
        <ProcessoForm
          key={editando === 'novo' ? 'novo' : editando.id}
          processo={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
        />
      )}

      <div role="search" className="mb-3 flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Buscar
          <input
            type="search"
            value={busca}
            placeholder="Número, cliente ou vara"
            onChange={(e) => reiniciar(setBusca)(e.target.value)}
            className="w-64 rounded border border-borda bg-bg px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            value={status}
            onChange={(e) => reiniciar(setStatus)(e.target.value)}
            className={select}
          >
            <option value="">Todos</option>
            {STATUS_PROCESSO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_PROCESSO[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Área
          <select
            value={area}
            onChange={(e) => reiniciar(setArea)(e.target.value)}
            className={select}
          >
            <option value="">Todas</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {ROTULO_AREA[a]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lista.isPending && <p className="text-suave">Carregando…</p>}
      {lista.error && <p role="alert">{lista.error.message}</p>}
      {excluir.error && (
        <p role="alert" className="mb-2 text-red-300">
          {excluir.error.message}
        </p>
      )}

      {lista.data && (
        <>
          <p aria-live="polite" className="mb-2 text-sm text-suave">
            {total === 0
              ? 'Nenhum processo encontrado.'
              : `${total} processo${total > 1 ? 's' : ''}`}
          </p>
          {total > 0 && (
            <div className="relative overflow-x-auto rounded border border-borda">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Lista de processos</caption>
                <thead className="bg-surface text-suave">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Número CNJ
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Cliente
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Área
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Responsável
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Aberto em
                    </th>
                    {(podeEditar || podeExcluir) && (
                      <th scope="col" className="px-3 py-2">
                        <span className="sr-only">Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lista.data.itens.map((p) => (
                    <tr key={p.id} className="border-t border-borda">
                      <th
                        scope="row"
                        className="whitespace-nowrap px-3 py-2 font-mono text-xs font-medium"
                      >
                        {p.numeroCnj}
                      </th>
                      <td className="px-3 py-2">{p.clienteNome}</td>
                      <td className="px-3 py-2">{ROTULO_AREA[p.area]}</td>
                      <td className="px-3 py-2">{ROTULO_STATUS_PROCESSO[p.status]}</td>
                      <td className="px-3 py-2">{p.responsavelNome}</td>
                      <td className="whitespace-nowrap px-3 py-2">{dataBr(p.abertoEm)}</td>
                      {(podeEditar || podeExcluir) && (
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            {podeEditar && (
                              <button
                                type="button"
                                onClick={() => setEditando(p)}
                                aria-label={`Editar ${p.numeroCnj}`}
                                className="underline underline-offset-4 hover:text-ouro"
                              >
                                Editar
                              </button>
                            )}
                            {podeExcluir && (
                              <button
                                type="button"
                                disabled={excluir.isPending}
                                onClick={() => {
                                  if (window.confirm(`Excluir o processo ${p.numeroCnj}?`))
                                    excluir.mutate(p);
                                }}
                                aria-label={`Excluir ${p.numeroCnj}`}
                                className="underline underline-offset-4 hover:text-red-300"
                              >
                                Excluir
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
