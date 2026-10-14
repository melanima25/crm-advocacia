import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATABASE_URL } from './playwright.config';

/** Antes de tudo: aplica as migrações e recria os dados fictícios (hash rápido: 1000 iterações). */
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL, HASH_ITERACOES: '1000' };
  const opcoes = {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env,
    stdio: 'inherit' as const,
  };
  execSync('npm run db:migrate -w @crm/api', opcoes);
  execSync('npm run seed -w @crm/api', opcoes);
}
