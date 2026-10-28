# KURIO — Marketplace de NFTs

Marketplace implementado para o [desafio frontend da Jungle Gaming](https://github.com/junglegaming/frontend-challenge), com React e TypeScript. Autenticação, APIs, carteiras, pagamentos e transações são simulados no navegador; não há integração com blockchain ou gateways reais.

## Executar

Requisitos: Node.js 24+, npm 11+ e Google Chrome instalado para testes/auditorias.

```sh
npm ci
npm run dev
```

Abra [http://127.0.0.1:5173](http://127.0.0.1:5173). O MSW inicia antes da aplicação e do Socket.IO. Os mocks ficam ativos por padrão também no build. A variável `VITE_ENABLE_MOCKS=true` está documentada em `.env.example`; desativá-la exige uma API compatível, não fornecida neste projeto.

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Desenvolvimento com mocks |
| `npm run build` | Verificar tipos e gerar `dist` |
| `npm run preview` | Servir o build na porta 4173 |
| `npm run typecheck` | Verificar TypeScript |
| `npm run lint` | Verificar código |
| `npm run test:unit` | Testar cálculos monetários |
| `npm run test:e2e` | Playwright em desenvolvimento |
| `npm run test:preview` | Playwright no build; executar build antes |
| `npm run audit` | 12 medições Lighthouse no build |

## Credenciais fictícias

| E-mail | Senha |
| --- | --- |
| colecionador@kurio.demo | Kurio123! |
| nova@kurio.demo | Kurio123! |

Cada conta tem perfil, favoritos, carrinho e carteiras próprios. Novas contas começam sem carteira. Não use dados pessoais nem senhas reais: o armazenamento local e a autenticação são apenas demonstrativos.

## Rotas e compra

| Rota | Tela |
| --- | --- |
| `/` | Descoberta e catálogo |
| `/nft/nft-1` | Exemplo de detalhe por URL direta |
| `/cart` | Carrinho e cupom |
| `/login`, `/register` | Autenticação e cadastro |
| `/checkout` | Dados, carteira, revisão e compra |
| `/orders/:id` | Pedido pendente, recusado ou recibo confirmado |
| `/profile`, `/wallets`, `/favorites` | Conta protegida |

Busca, filtros, ordenação, aba e paginação compõem a URL. O carrinho persiste após refresh e é mesclado no login, limitado pela disponibilidade de cada edição.

Cupom válido: **KURIO10**, com desconto de 10%. **EXPIRED** demonstra cupom expirado; outros códigos são inválidos. Valores ETH trafegam como strings e são calculados em wei com BigInt.

O checkout usa carteiras cadastradas, conexão simulada e revisão explícita. Mudanças de preço, estoque ou taxa exigem outra confirmação. A tentativa de compra tem chave de idempotência persistida, permitindo recuperação após timeout ou refresh. O recibo só aparece após confirmação pela simulação e usa um snapshot imutável. A exploração no Etherscan é identificada como simulada.

## Cenários reproduzíveis

O controle **Demo** permite selecionar cenários, alterar preço por evento Socket.IO, desconectar/reconectar e restaurar a base. O reset remove alterações de contas, carteiras, favoritos, carrinhos, cotações e pedidos, restaurando as fixtures.

| Cenários | Comportamento |
| --- | --- |
| `success`, `confirmed`, `empty` | Fluxo padrão, confirmação e catálogo vazio |
| `slow`, `variable`, `out-of-order` | Atraso fixo de 1,8 s ou latência determinística em função da busca |
| `timeout`, `offline`, `http-400`, `http-500` | Timeout, erro de conexão e respostas HTTP 400/503 |
| `expired`, `unauthorized` | Sessão inválida e retomada pelo login |
| `signup-conflict`, `form-error`, `favorite-error` | Conflito de cadastro, erros de campos e rollback do favorito |
| `coupon-invalid`, `coupon-expired` | Falhas de validação do cupom |
| `price-changed`, `sold-out` | Mudança de preço/estoque na tentativa de compra |
| `order-timeout` | Pedido criado com resposta atrasada; recuperação da mesma tentativa |
| `declined`, `pending` | Pagamento recusado ou pedido aguardando um comando de simulação |

Para observar mudança em tempo real, adicione Emerald Ape ao carrinho e use **Alterar preço via socket**. No checkout, uma revisão anterior não autoriza a compra pelo valor antigo. Para recuperação, use `order-timeout` ou um pedido `pending` e recarregue sua rota. Os endpoints de controle continuam disponíveis durante os cenários de falha para restaurar a demonstração.

## Testes e auditorias

Foram aprovados **46 testes E2E** no build, em Chrome desktop 1440×1000 e mobile 390×844, e dois testes monetários. A suíte verifica ausência de overflow em início, detalhe, carrinho, pagamento, perfil e carteiras em 390, 414, 768 e 1440 px, além de navegação por teclado e validação dos campos obrigatórios na API.

- Testes e oito baselines versionadas: `tests/`.
- Relatório Playwright: [reports/e2e/html/index.html](reports/e2e/html/index.html).
- Screenshots e traces de novas falhas: gerados em `.local/test-results/`, ignorados pelo Git. Traces são preservados quando um teste falha.
- Configuração e 12 pares HTML/JSON Lighthouse: `lighthouse.config.mjs` e `reports/lighthouse/`.
- Ambiente, versões, métricas e medianas: [reports/lighthouse/summary.json](reports/lighthouse/summary.json).

| Página/perfil | Performance | Acessibilidade | Boas práticas | SEO |
| --- | ---: | ---: | ---: | ---: |
| Início/mobile | 95 | 100 | 100 | 92 |
| Início/desktop | 98 | 100 | 100 | 92 |
| Detalhe/mobile | 95 | 100 | 100 | 92 |
| Detalhe/desktop | 97 | 96 | 100 | 92 |

As medianas usam três medições por combinação. Os relatórios preservam um aviso de IndexedDB nas medições seguintes à primeira; não foram usados perfis Chrome independentes em cada execução. O build emite um aviso de chunk acima de 500 kB. O build também gera arquivos Brotli, servidos pelo preview quando o navegador aceita br; a hospedagem deve negociar sua compressão equivalente. Conteúdo, imagens, fontes e mocks participaram das medições, sem modo exclusivo de auditoria.

## Publicação e limitações

O projeto inclui fallback SPA em `vercel.json` e `public/_redirects`. A publicação e a URL pública ainda não foram realizadas. Após publicar, validar navegação direta, refresh, mocks e Socket.IO no ambiente hospedado.

A interface foi conferida contra as referências salvas do Figma, incluindo composição mobile/desktop, formulários, carteiras inline, autenticação, recibo e componentes compartilhados. Dados de negócio, conexão simulada e revisão explícita podem produzir estados diferentes dos exemplos ilustrativos do desenho. As baselines verificam regressão da implementação. Contratos, regras de estado e adaptações estão em [ARCHITECTURE.md](ARCHITECTURE.md).
