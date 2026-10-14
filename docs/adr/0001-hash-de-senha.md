# ADR 0001 — Hash de senha com PBKDF2 (Web Crypto)

**Status:** aceita (spike da semana 7). **Data:** 11/10/2026.

## Contexto

A API roda em Node (Docker/local/CI) e, em produção, em Cloudflare Workers. Bibliotecas nativas
(bcrypt, argon2) não rodam em Workers. A Web Crypto (`crypto.subtle`) existe nos dois ambientes.

## Decisão

PBKDF2-HMAC-SHA256 via Web Crypto, formato `pbkdf2$sha256$<iterações>$<sal>$<hash>`. O número de
iterações fica dentro do hash guardado, então pode ser aumentado depois sem invalidar senhas antigas.
Padrão 600.000 (recomendação OWASP); configurável no seed por `HASH_ITERACOES`.

## Medição (Node 22, sandbox de 2 vCPU, mediana de 5)

| Iterações | Tempo por verificação |
| --------- | --------------------- |
| 100.000   | ~15 ms                |
| 210.000   | ~34 ms                |
| 600.000   | ~88 ms                |

## Riscos em Workers (tratados no [ADR 0002](0002-deploy-cloudflare-neon.md))

- Um artigo de 2024 observa que `crypto.subtle` no Workers aceita no máximo 100.000 iterações
  ([lord.technology](https://lord.technology/2024/02/21/hashing-passwords-on-cloudflare-workers.html)).
  Não é documentação oficial: **[não verificado]** — confirmar com o deploy real.
- O limite de CPU do plano gratuito é baixo (~10 ms, **[não verificado]**); 100k iterações medem ~15 ms
  em Node. Se estourar: plano pago de Workers ou hospedar a API em Node.
- Plano original: 100.000 em produção. **Atualizado no ADR 0002:** 10.000 no plano gratuito (CPU de 10 ms).

## Consequências

Mesmo código em Node e Workers; segurança de hash menor em produção demo (aceitável: dados 100% fictícios).
