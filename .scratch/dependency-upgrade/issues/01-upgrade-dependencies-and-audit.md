# 01: Atualização de dependências e `npm audit`

**Status:** done
**Branch:** `chore/upgrade-deps`

**What to build:** todas as dependências na versão mais nova compatível com o Node 22 de produção, com o código ajustado aos breaking changes e o `npm audit` zerado. Referência de decisões: tickets 216, 217 e 218 do InventPilot (`D:\_DEV\InventPilot`, `PLANO_ATUALIZACAO_DEPENDENCIAS.md`). Diferença de contexto: o InventPilot usa Drizzle com PostgreSQL; aqui o Drizzle usa SQLite via `@libsql/client`.

## Decisões

| Item | Decisão | Motivo |
|---|---|---|
| Node | `.node-version` 22 e `engines` `>=22.13` | Produção roda Node 22. O mínimo real vem do jsdom 29 e do ESLint 10 (`^22.13.0`) |
| `@types/node` | `^22` | Tipos alinhados ao Node de produção; o 24/26 descreveria APIs que o 22 não tem |
| TypeScript | `^6.0.3` com `"types": ["node"]` no tsconfig | O `typescript-eslint` aceita só `<6.1.0`. Gatilho para o 7: `typescript-eslint` com suporte ao TypeScript 7.1 |
| ESLint | `^10` com `eslint.config.mjs` no formato da doc do Next | A config antiga só lintava 3 arquivos e nenhum `.ts`/`.tsx`. Três avisos de peer esperados (`eslint-plugin-react`, `-import`, `-jsx-a11y`) |
| jsdom | `^29.1.1` | O 30 exige Node `^22.22.2` / `^24.15.0`; a máquina local roda 24.11.1. Subir quando o Node local e o de produção atenderem |
| esbuild | override `^0.28.2` (era `^0.25.0`) | Fecha o GHSA-67mh-4wv8-2f99 do `@esbuild-kit` trazido pelo `drizzle-kit`. Testado com SQLite: `drizzle-kit up`, `generate` e `migrate` funcionam |
| Versões com `^` | mantido | O lockfile garante a reprodutibilidade com `npm ci` |

## Mudanças

- Majors: Vitest 5, jsdom 29, jest-dom 7, lucide-react 1.x, tailwind-merge 3, `@libsql/client` 0.18, TypeScript 6, ESLint 10.
- Minors: Next 16.4.3, React 19.3.1, drizzle-orm 0.45.4, drizzle-kit 0.31.11, zod 4.6.7 e rotina.
- Código: três ícones do lucide com os nomes canônicos (`CircleCheckBig`, `TriangleAlert`, `CircleX`) e `flex-shrink-0` para `shrink-0` em `components/status-card.tsx`.
- `tailwindcss-animate` trocado por `tw-animate-css` em `app/globals.css`.
- Removidos por falta de uso: `better-sqlite3`, `@types/better-sqlite3`, `vite-tsconfig-paths` (o Vite 8 tem `resolve.tsconfigPaths`), `@eslint/eslintrc` e `@vitejs/plugin-react` (o Vite 8 transforma JSX sozinho).
- `.gitignore` com `/.vitest`; badges do `README.md` atualizados.

## Verificação

- [x] `npm ci` limpo a partir do lockfile (só os três avisos de peer e os deprecated do `@esbuild-kit`)
- [x] `npx tsc --noEmit` limpo
- [x] `npm test`: 7 arquivos / 78 testes
- [x] `npx next build` limpo
- [x] `npm audit`: 0 vulnerabilidades (eram 12: 2 críticas, 5 altas, 5 moderadas)
- [x] Prova do ESLint 10: `react/jsx-key`, `jsx-a11y/alt-text`, `import/no-anonymous-default-export` e `@next/next/no-img-element` acusados num arquivo temporário (apagado)
- [x] Smoke com `next start`: `/` responde 200 e renderiza os cards dos 7 provedores
- [ ] Conferência visual no navegador dos ícones e animações (pendente do usuário)
- [ ] Commit da branch (pendente do usuário)

## Fica para a fase 2 (review)

`npm run lint` agora acusa 39 problemas que já existiam e eram invisíveis: 26 `no-explicit-any` (a maioria nos fetchers), 12 imports sem uso e um `react-hooks/purity` por `Date.now()` durante o render em `components/status-card.tsx`.
