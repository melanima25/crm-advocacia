import { useQuery } from '@tanstack/react-query';
import { MeResponseSchema } from '@crm/shared';
import { chamar, ErroApi } from './api';
import { Login } from './components/Login';
import { Shell } from './components/Shell';

export function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => chamar('/api/me', MeResponseSchema),
  });

  if (me.isPending) return <p className="p-8 text-suave">Carregando…</p>;
  if (me.error && !(me.error instanceof ErroApi && me.error.status === 401))
    return (
      <p role="alert" className="p-8">
        Não foi possível falar com o servidor.
      </p>
    );
  if (!me.data) return <Login />;
  return <Shell usuario={me.data.usuario} />;
}
