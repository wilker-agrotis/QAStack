# QAStack

Ferramenta desktop (Windows) para gerenciar e executar os testes automatizados Playwright do repositório
`git@ssh.bitbucket.org:agrotis/web-erp-automatizados.git`.

**Stack:** Electron + React + TypeScript + Tailwind (electron-vite).
O app usa o **Node, o npm e o Playwright da máquina e do repositório clonado**, não versões embutidas.

## Rodar em desenvolvimento

Pré-requisitos: Node.js 20+ e Git for Windows.

```powershell
cd C:\QAStack
npm install
npm run dev
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run typecheck` | Checa os tipos do processo principal e da tela |
| `npm run build` | Typecheck + build de produção em `out/` |
| `npm run dist` | Gera o instalador Windows (NSIS) em `dist/` |

## Como funciona

```
src/
  shared/types.ts        contrato IPC (tipos + nomes dos canais) e montagem do comando Playwright
  main/                  processo principal (Node)
    index.ts             janela (contextIsolation ligado, nodeIntegration desligado)
    ipc.ts               registra os handlers
    services/
      env-check.ts       verificação do ambiente: git, node (engines do package.json), npm, chave SSH, navegadores, deps
      git.ts             clone (core.longpaths) / fetch + checkout + pull --ff-only, npm ci quando o lock muda
      discovery.ts       npx playwright test --list --reporter=json → suítes e casos; marca o que é NOVO
      runner.ts          executa/para o Playwright (taskkill /T no Windows), HTML Report, Codegen
      repo.ts            tenant (.env do repo), versão do Playwright, estado do repositório
      settings.ts        settings.json em %APPDATA%\QAStack
  preload/index.ts       expõe window.qastack (só as funções do contrato)
  renderer/src/          telas React (baseadas no protótipo aprovado)
resources/
  qastack-reporter.cjs   reporter do Playwright que manda o progresso em tempo real para o app
```

- **Repositório:** clonado em `C:\QASTACK\<nome-do-repo>` (caminho curto por causa do limite de 260 caracteres do Windows). Um repositório por vez.
- **Tenant:** lido do `.env` do repositório clonado (chaves `TENANT`, `QA_TENANT`, `ERP_TENANT` ou `TENANT_NAME`). Somente leitura.
- **Execução:** cada Play roda `npx playwright test <arquivo>` com `--reporter=list,html,<reporter do QAStack>`. Os cards são atualizados pelos eventos do reporter. **Parar** encerra a árvore de processos inteira.
- **Rodar Tudo** respeita a tag selecionada (vira `--grep=@tag`).

## Status do plano

- [x] Fase 1 · Fundação — Electron + React com as telas do protótipo, IPC tipado
- [~] Fase 2 · Ambiente — verificação real implementada; validar no Windows com a chave SSH do Bitbucket
- [~] Fase 3 · Descoberta — implementada; validar com o repositório real
- [~] Fase 4 · Execução — rodar, acompanhar e parar implementados; validar no Windows
- [ ] Fase 5 · Resultados (histórico, trace)
- [ ] Fase 7 · Distribuição (assinatura, atualização)

## Pontos a confirmar com o repositório real

- Nome da variável do tenant no `.env`.
- Se o `playwright.config.ts` define `retries` (sem retry, `--trace on-first-retry` não gera trace).
- Se o host SSH é mesmo `ssh.bitbucket.org` (a verificação de SSH usa o host da URL).
