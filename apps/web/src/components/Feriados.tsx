import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { FeriadoSchema, FeriadosResponseSchema } from '@crm/shared';
import { chamar } from '../api';
import { dataComDia } from '../datas';

export function Feriados() {
  const qc = useQueryClient();
  const [data, setData] = useState('');
  const [nome, setNome] = useState('');
  const lista = useQuery({
    queryKey: ['feriados'],
    queryFn: () => chamar('/api/feriados', FeriadosResponseSchema),
  });
  const invalidar = () => qc.invalidateQueries({ queryKey: ['feriados'] });
  const adicionar = useMutation({
    mutationFn: () =>
      chamar('/api/feriados', FeriadoSchema, { method: 'POST', corpo: { data, nome } }),
    onSuccess: async () => {
      setData('');
      setNome('');
      await invalidar();
    },
  });
  const remover = useMutation({
    mutationFn: (d: string) =>
      chamar(`/api/feriados/${d}`, z.object({ ok: z.boolean() }), { method: 'DELETE' }),
    onSuccess: invalidar,
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    adicionar.mutate();
  }

  const anos = [...new Set(lista.data?.feriados.map((f) => f.data.slice(0, 4)))];

  return (
    <section aria-labelledby="titulo-feriados">
      <h2 id="titulo-feriados" className="text-lg font-medium">
        Feriados
      </h2>
      <p className="mb-3 text-sm text-suave">
        Entram na contagem dos prazos em dias úteis. Prazos já gravados não são recalculados ao
        mudar esta lista; só ao serem editados.
      </p>
      <form
        onSubmit={enviar}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-borda bg-surface p-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          Data
          <input
            required
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded border border-borda bg-bg px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Nome
          <input
            required
            minLength={2}
            maxLength={80}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-64 rounded border border-borda bg-bg px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={adicionar.isPending}
          className="rounded bg-ouro px-4 py-2 font-medium text-bg disabled:opacity-60"
        >
          Adicionar
        </button>
        {adicionar.error && (
          <p role="alert" className="w-full text-sm text-red-300">
            {adicionar.error.message}
          </p>
        )}
      </form>
      {remover.error && (
        <p role="alert" className="mb-2 text-red-300">
          {remover.error.message}
        </p>
      )}
      {lista.isPending && <p className="text-suave">Carregando…</p>}
      {anos.map((ano) => (
        <div key={ano} className="mb-4">
          <h3 className="mb-1 font-medium">{ano}</h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {lista.data?.feriados
              .filter((f) => f.data.startsWith(ano))
              .map((f) => (
                <li
                  key={f.data}
                  className="flex items-center justify-between rounded border border-borda bg-surface px-3 py-1.5 text-sm"
                >
                  <span>
                    {dataComDia(f.data)} — {f.nome}
                  </span>
                  <button
                    type="button"
                    disabled={remover.isPending}
                    onClick={() => {
                      if (window.confirm(`Remover o feriado "${f.nome}"?`)) remover.mutate(f.data);
                    }}
                    aria-label={`Remover ${f.nome} de ${dataComDia(f.data)}`}
                    className="underline underline-offset-4 hover:text-red-300"
                  >
                    Remover
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
