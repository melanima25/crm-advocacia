import { gerarHash, verificarSenha } from '../src/auth/senha';

/** Spike: quanto custa o PBKDF2 por nº de iterações (rode: npm run medir-hash -w @crm/api). */
for (const it of [100_000, 210_000, 600_000]) {
  const h = await gerarHash('senha-de-teste', it);
  const tempos: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await verificarSenha('senha-de-teste', h);
    tempos.push(performance.now() - t);
  }
  tempos.sort((a, b) => a - b);
  console.log(
    `${String(it).padStart(8)} iterações: mediana ${tempos[2]?.toFixed(1)} ms (min ${tempos[0]?.toFixed(1)}, max ${tempos[4]?.toFixed(1)})`,
  );
}
