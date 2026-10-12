import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuditoriaResponseSchema } from '@crm/shared';
import { chamar } from '../api';

const POR_PAGINA = 10;

export function Auditoria() {
  const [pagina, setPagina] = useState(1);
  const q = useQuery({
    queryKey: ['auditoria', pagina],
    queryFn: () =>
      chamar(`/api/auditoria?pagina=${pagina}&porPagina=${POR_PAGINA}`, AuditoriaResponseSchema),
  });
  if (q.isPending) return <p className="text-suave">Carregando…</p>;
  if (q.error) return <p role="alert">{q.error.message}</p>;
  const { itens, total } = q.data;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <section aria-labelledby="titulo-aud">
      <h2 id="titulo-aud" className="mb-3 text-lg font-medium">
        Trilha de auditoria
      </h2>
      <div className="relative overflow-x-auto rounded border border-borda">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Registros de auditoria, do mais recente ao mais antigo
          </caption>
          <thead className="bg-surface text-suave">
            <tr>
              <th scope="col" className="px-3 py-2">
                Quando
              </th>
              <th scope="col" className="px-3 py-2">
                Quem
              </th>
              <th scope="col" className="px-3 py-2">
                Entidade
              </th>
              <th scope="col" className="px-3 py-2">
                Ação
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-t border-borda">
                <td className="px-3 py-2 whitespace-nowrap">
                  {new Date(i.criadoEm).toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2">{i.usuarioNome ?? '—'}</td>
                <td className="px-3 py-2">
                  {i.entidade}
                  {i.entidadeId ? ` #${i.entidadeId}` : ''}
                </td>
                <td className="px-3 py-2">{i.acao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    </section>
  );
}
