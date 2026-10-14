/**
 * Hash de senha com PBKDF2-SHA256 via Web Crypto. Escolha deliberada: a Web Crypto existe no Node
 * e no Cloudflare Workers, então o mesmo código roda nos dois (bcrypt/argon2 nativos não rodam em Workers).
 * Formato guardado: pbkdf2$sha256$<iterações>$<salt base64>$<hash base64>.
 * O número de iterações vai junto do hash, então dá para aumentá-lo no futuro sem invalidar senhas antigas.
 */
const ITERACOES_PADRAO = 600_000; // recomendação OWASP para PBKDF2-HMAC-SHA256
const BYTES_HASH = 32;
const BYTES_SALT = 16;

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const deB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

async function derivar(senha: string, salt: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(senha),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as unknown as ArrayBuffer,
      iterations: iteracoes,
    },
    chave,
    BYTES_HASH * 8,
  );
  return new Uint8Array(bits);
}

/** Comparação em tempo constante (não vaza em qual byte a diferença aparece). */
function iguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

export async function gerarHash(senha: string, iteracoes = ITERACOES_PADRAO): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(BYTES_SALT));
  const hash = await derivar(senha, salt, iteracoes);
  return `pbkdf2$sha256$${iteracoes}$${b64(salt)}$${b64(hash)}`;
}

export async function verificarSenha(senha: string, guardado: string): Promise<boolean> {
  const [esquema, algoritmo, iter, salt, hash] = guardado.split('$');
  const iteracoes = Number(iter);
  if (esquema !== 'pbkdf2' || algoritmo !== 'sha256' || !salt || !hash) return false;
  if (!Number.isInteger(iteracoes) || iteracoes < 1) return false;
  const calculado = await derivar(senha, deB64(salt), iteracoes);
  return iguais(calculado, deB64(hash));
}

/**
 * Hash "de mentira" para gastar o mesmo tempo quando o e-mail não existe. Sem isso, a resposta
 * mais rápida revelaria quais e-mails têm conta. As iterações devem ser as mesmas dos hashes reais
 * (e, no Cloudflare Workers, nunca acima de 100.000: acima disso o runtime lança erro).
 */
export const hashFalso = (iteracoes = ITERACOES_PADRAO) =>
  `pbkdf2$sha256$${iteracoes}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;
export const HASH_FALSO = hashFalso();
