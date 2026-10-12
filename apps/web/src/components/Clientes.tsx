import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ClientesResponseSchema,
  ROTULO_TIPO_CLIENTE,
  TIPOS_CLIENTE,
  podeFazer,
  type Cliente,
  type Perfil,
} from '@crm/shared';
import { chamar } from '../api';
import { ClienteForm } from './ClienteForm';

const POR_PAGINA = 10;

/** Espera o usuário parar de digitar antes de consultar o servidor. */
function useAtrasado<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function Clientes({ perfil }: { perfil: Perfil }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<'' | Cliente['tipo']>('');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Cliente | 'novo' | null>(null);
  const q = useAtrasado(busca.trim());

  const lista = useQuery({
    queryKey: ['clientes', q, tipo, pagina],
    queryFn: () => {
      const p = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA) });
      if (q) p.set('q', q);
      if (tipo) p.set('tipo', tipo);
      return chamar(`/api/clientes?${p}`, ClientesResponseSchema);
    },
    placeholderData: keepPreviousData,
  });

  const excluir = useMutation({
    mutationFn: (c: Cliente) =>
      chamar(`/api/clientes/${c.id}`, z.object({ ok: z.boolean() }), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });

  const podeCriar = podeFazer(perfil, 'cliente:criar');
  const podeEditar = podeFazer(perfil, 'cliente:editar');
  const podeExcluir = podeFazer(perfil, 'cliente:excluir');
  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section aria-labelledby="titulo-clientes">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-clientes" className="text-lg font-medium">
          Clientes
        </h2>
        {podeCriar && editando === null && (
          <button
            type="button"
            onClick={() => setEditando('novo')}
            className="rounded bg-ouro px-3 py-1.5 text-sm font-medium text-bg"
          >
            Novo cliente
          </button>
        )}
      </div>

      {editando !== null && (
        <ClienteForm
          key={editando === 'novo' ? 'novo' : editando.id}
          cliente={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
        />
      )}

      <div role="search" className="mb-3 flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Buscar
          <input
            type="search"
            value={busca}
            placeholder="Nome, e-mail ou documento"
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
            className="w-64 rounded border border-borda bg-bg px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tipo
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as '' | Cliente['tipo']);
              setPagina(1);
            }}
            className="rounded border border-borda bg-bg px-3 py-2"
          >
            <option value="">Todos</option>
            {TIPOS_CLIENTE.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_CLIENTE[t]}
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
            {total === 0 ? 'Nenhum cliente encontrado.' : `${total} cliente${total > 1 ? 's' : ''}`}
          </p>
          {total > 0 && (
            <div className="relative overflow-x-auto rounded border border-borda">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Lista de clientes</caption>
                <thead className="bg-surface text-suave">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Nome
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Tipo
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Documento
                    </th>
                    <th scope="col" className="px-3 py-2">
                      E-mail
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Telefone
                    </th>
                    {(podeEditar || podeExcluir) && (
                      <th scope="col" className="px-3 py-2">
                        <span className="sr-only">Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lista.data.itens.map((c) => (
                    <tr key={c.id} className="border-t border-borda">
                      <th scope="row" className="px-3 py-2 font-medium">
                        {c.nome}
                      </th>
                      <td className="px-3 py-2">{c.tipo}</td>
                      <td className="px-3 py-2">{c.documento ?? '—'}</td>
                      <td className="px-3 py-2">{c.email ?? '—'}</td>
                      <td className="px-3 py-2">{c.telefone ?? '—'}</td>
                      {(podeEditar || podeExcluir) && (
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            {podeEditar && (
                              <button
                                type="button"
                                onClick={() => setEditando(c)}
                                aria-label={`Editar ${c.nome}`}
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
                                  if (window.confirm(`Excluir o cliente "${c.nome}"?`))
                                    excluir.mutate(c);
                                }}
                                aria-label={`Excluir ${c.nome}`}
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
