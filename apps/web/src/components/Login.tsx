import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MeResponseSchema } from '@crm/shared';
import { chamar } from '../api';

const DEMO = [
  { rotulo: 'Administrador', email: 'admin@demo.crm' },
  { rotulo: 'Advogado', email: 'advogado@demo.crm' },
  { rotulo: 'Assistente', email: 'assistente@demo.crm' },
];

export function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const entrar = useMutation({
    mutationFn: () =>
      chamar('/api/auth/login', MeResponseSchema, { method: 'POST', corpo: { email, senha } }),
    onSuccess: (dados) => qc.setQueryData(['me'], dados),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    entrar.mutate();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-ouro">CRM Advocacia</h1>
        <p className="mt-1 text-sm text-suave">
          Projeto de demonstração: todos os dados são fictícios.
        </p>
      </header>
      <form
        onSubmit={enviar}
        className="flex flex-col gap-4 rounded-lg border border-borda bg-surface p-5"
      >
        <label className="flex flex-col gap-1 text-sm">
          E-mail
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-borda bg-bg px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Senha
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="rounded border border-borda bg-bg px-3 py-2"
          />
        </label>
        {entrar.error && (
          <p role="alert" className="text-sm text-red-300">
            {entrar.error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={entrar.isPending}
          className="rounded bg-ouro px-4 py-2 font-medium text-bg disabled:opacity-60"
        >
          {entrar.isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <section aria-labelledby="demo" className="rounded-lg border border-borda p-4 text-sm">
        <h2 id="demo" className="mb-2 font-medium">
          Contas de demonstração
        </h2>
        <p className="mb-3 text-suave">Senha de todas: demo1234</p>
        <ul className="flex flex-col gap-2">
          {DEMO.map((d) => (
            <li key={d.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setSenha('demo1234');
                }}
                className="text-left underline decoration-borda underline-offset-4 hover:text-ouro"
              >
                {d.rotulo} — {d.email}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
