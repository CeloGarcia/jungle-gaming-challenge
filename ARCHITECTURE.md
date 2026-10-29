# Arquitetura

## Organização e stack

Vite e npm são escolhas de build. React/TypeScript implementam a interface; TanStack Router controla rotas, busca e proteção; TanStack Query controla consultas, mutations e cache; Axios é o cliente REST. MSW fornece a API simulada e a integração de eventos consumidos por Socket.IO. Tailwind e primitives no padrão shadcn/ui, com Radix, Slot e class-variance-authority, usam a identidade Kurio. Playwright verifica fluxos e regressão visual; Lighthouse audita o build.

| Local                              | Responsabilidade                           |
| ---------------------------------- | ------------------------------------------ |
| `src/domain.ts`                    | Contratos de transporte/domínio e dinheiro |
| `src/api.ts`                       | Axios, sessão no transporte e QueryClient  |
| `src/mocks/database.ts`            | Fixtures, persistência e regras simuladas  |
| `src/mocks/handlers.ts`            | Fronteira REST e Socket.IO                 |
| `src/main.tsx`                     | Inicialização dos mocks antes da aplicação |
| `src/bootstrap.tsx`                | Router e guards                            |
| `src/app.tsx`                      | Telas, consultas, mutations e interações   |
| `src/components/ui/`               | Primitives compartilhadas                  |
| `src/components/design-assets.tsx` | SVGs originais e composição das marcas     |
| `tests/`                           | E2E, cálculos monetários e baselines       |

Componentes e hooks não contêm respostas fictícias de rede. As fixtures e regras ficam na camada MSW e são reutilizadas em desenvolvimento, build e testes. Imagens e Roboto Mono são locais. O build gera arquivos Brotli a partir dos artefatos finais; o preview negocia br quando suportado e mantém o conteúdo descomprimido idêntico. Os arquivos originais continuam disponíveis para servidores sem suporte a Brotli.

## Contratos REST

Todas as chamadas passam por Axios. Sessão e proprietário são verificados nos handlers privados, além dos guards de navegação.

| Recurso              | Operações                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Conta                | `POST /api/accounts`: username, email, password, confirmation                                             |
| Sessão               | `POST/GET/DELETE /api/session`: autenticar, recuperar e sair                                              |
| Catálogo             | `GET /api/nfts`: q, categories, networks, min, max, tab, sort, page; retorna items, total, pages e facets |
| Detalhe              | `GET /api/nfts/:id`: NFT versionado e disponibilidade por edição                                          |
| Favoritos            | `GET /api/favorites`; `PUT/DELETE /api/favorites/:id`                                                     |
| Carrinho             | `GET /api/cart`; `POST /api/cart/items`; `PATCH/DELETE /api/cart/items/:id`                               |
| Cotação              | `POST /api/quotes`: coupon, network; retorna snapshot, versão, subtotal, desconto, taxa e total           |
| Pedido               | `POST /api/orders`: quoteId, walletId, collector e header Idempotency-Key                                 |
| Consulta do pedido   | `GET /api/orders/:id`; `GET /api/orders?attempt=chave` para recuperar uma tentativa                       |
| Perfil               | `GET/PATCH /api/profile`: displayName, username, email, ens, walletNickname, avatar                       |
| Senha                | `PUT /api/profile/password`: currentPassword, newPassword, confirmation                                   |
| Carteiras            | `GET/POST /api/wallets`; `PATCH /api/wallets/:id`                                                         |
| Controle de cenários | `POST /api/demo/reset`, `/scenario`, `/event`, `/expire`; `GET /api/demo/state`                           |

Erro de transporte:

```json
{
  "error": {
    "code": "VALIDATION",
    "message": "Confira os campos indicados.",
    "fields": { "email": "E-mail inválido." },
    "retryable": false
  }
}
```

Status utilizados: 400/422 para validação, 401 para sessão, 403 para propriedade, 404 para recurso, 409 para conflito de conta/estoque/cotação/idempotência, 410 para cupom expirado e 503 para falha transitória. ETH usa strings decimais; quantidades são inteiras.

## Sessão, persistência e cache

A sessão fictícia expira em uma hora e é recuperada por REST. Senhas são derivadas por SHA-256 com salt usando Web Crypto e não ficam em claro na base persistida. Isso é somente uma demonstração local, não autenticação de produção. Perfis, carteiras, favoritos, carrinhos e pedidos são isolados por usuário.

Query keys incluem o usuário/visitante e os parâmetros relevantes. Consultas usam AbortSignal, stale time de 30 s e no máximo uma repetição em erros HTTP transitórios. Mutations não repetem automaticamente. Favoritos capturam a intenção no clique e usam snapshot/rollback otimista; o resultado é reconciliado com REST.

O interceptor compara o token enviado pela requisição ao token atual, tanto em sucesso quanto em erro. Respostas de uma sessão substituída viram cancelamentos: não expiram a sessão seguinte nem disparam avisos, rollback ou recuperação de pedido antigos. Um 401 só expira o token que o originou. O reset global da demonstração continua sendo uma operação explícita de limpeza.

Logout cancela queries e limpa cache. A troca de token encerra a conexão anterior e seus listeners; callbacks verificam token e ciclo ativo antes de invalidar recursos. A expiração redireciona ao login com rota de retorno. O rascunho do checkout é persistido por usuário, preservando dados para retomada.

A base simulada fica em `kurio.mock.v1`. Reset restaura integralmente o cenário conhecido, incluindo contas e carteiras. Timers antigos não alteram uma base restaurada, pois a conclusão exige que o pedido ainda pertença à lista atual.

## Dinheiro, carrinho e pedidos

Dinheiro é convertido entre strings decimais e BigInt em wei; não se usa ponto flutuante em cálculos monetários. Quantidades devem ser inteiras positivas, limitadas à disponibilidade por NFT/edição. A cotação REST é a referência de preço, cupom, desconto, rede, taxa e total.

Na mesclagem do visitante, itens da mesma edição são somados e limitados ao estoque. Um cupom do visitante é preservado se o carrinho da conta não tiver outro; sua validade é reavaliada na cotação.

O checkout exige conexão simulada e revisão explícita. A cotação contém proprietário e fingerprint de carrinho, quantidades, revisões de NFTs, cupom e rede. A criação revalida tudo; uma mudança exige nova revisão.

Pedidos usam chave de idempotência persistida por tentativa e hash do conteúdo. A mesma chave/conteúdo recupera o mesmo pedido; outro conteúdo retorna 409. Uma trava cobre requisições concorrentes durante a criação; o registro persistido cobre refresh e retry após timeout.

Pendente pode transicionar para confirmado ou recusado; ambos são terminais. Somente a confirmação da base simulada autoriza o recibo. O recibo usa snapshot imutável. Antes de confirmar, settle valida todas as linhas e consome o estoque de forma síncrona, sem await entre validação e consumo. Se qualquer edição não tiver disponibilidade, o pedido inteiro é recusado, com motivo, sem consumo parcial ou limpeza do carrinho. Não há reserva em pedidos pendentes: a primeira confirmação válida consome a última unidade.

A limpeza do carrinho compara tanto o ID da linha como sua geração UUID persistida. Remover e readicionar cria outra geração; adições na mesma geração são protegidas pelo contador added. A mesclagem incrementa esse contador apenas pelas unidades efetivamente aceitas no limite de estoque. Confirmações repetidas não reaplicam efeitos.

A migração do schema 1 para 2 conserva perfis, pedidos e carrinhos, atribui gerações e descarta cotações antigas. Sem evidência da geração de um pedido legado, sua confirmação preserva as linhas atuais em vez de excluir unidades de origem ambígua. Recusa mantém o carrinho.

## Socket.IO e reconciliação

Versões usadas: MSW 2.15.0, `@mswjs/socket.io-binding` 0.2.0 e `socket.io-client` 4.8.4. O binding publicado usa `toSocketIo`. O matcher MSW normaliza `/socket.io/` para a raiz, por isso o mock usa `ws.link(location.origin)`.

O worker inicia antes da importação do bootstrap, pois Engine.IO captura o construtor WebSocket na avaliação do módulo. O transporte é WebSocket, namespace padrão e eventos textuais; rooms, acknowledgements e anexos binários não são simulados. O handler mantém heartbeat de 20 s e o libera no fechamento.

| Evento          | Payload e efeito                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `nft.updated`   | eventId, resourceId, version e NFT; informa mudança e reconcilia catálogo, detalhe, carrinho e cotação |
| `order.updated` | eventId, resourceId, ownerId, version e pedido; reconcilia estado/recibo                               |

O cliente descarta versões repetidas/antigas por recurso. Payloads não substituem diretamente o cache: consultas REST recuperam o estado atual, evitando regressão por eventos atrasados. Reconexão invalida recursos ativos e recupera pedidos sem criar outra compra.

## Validações e decisões de interface

Cadastro exige usuário de 3–24 caracteres, e-mail, senha de 8+ caracteres e confirmação. Perfil exige nome de 2+ caracteres e usuário/e-mail únicos. Cadastro, edição, unicidade e login usam o mesmo e-mail canônico (trim + lowercase). O cadastro revalida a unicidade após derivar a senha, antes da inserção síncrona, cobrindo cadastros concorrentes. Carteiras validam nome, apelido, perfil, tipo, rede, e-mail e endereço: 0x com 40 dígitos hex em Ethereum/Polygon ou base58 de 32–44 caracteres em Solana. Código de indicação e ENS são obrigatórios nas carteiras; ENS termina em .eth. O formulário separa o sufixo fixo .eth do nome digitado.

O checkout exige nome de exibição, usuário, nome do perfil, e-mail, indicação e ENS, além da carteira/rede selecionadas. Os dados da carteira salva preenchem os campos adicionais sem substituir alterações do colecionador. ENS/carteira secundária e observação são opcionais. Cliente e API validam a obrigatoriedade. No mobile, os dados do colecionador ficam em uma seção expansível que abre automaticamente se um campo inválido impedir o envio; cupom e detalhes monetários continuam acessíveis. A conexão simulada e a revisão explícita precedem a confirmação.

Carteiras são editadas inline, com estados de principal/secundária, cópia da principal, cancelamento e persistência. A galeria tem quatro miniaturas e as recomendações apresentam cinco itens por página, com indicadores operáveis por teclado; no mobile, os cinco cards podem ser percorridos horizontalmente. Ícones, marcas e a ilustração do recibo usam arquivos originais locais. O componente de assets conserva as dimensões nativas dos SVGs.

A identidade do mesmo NFT permanece coerente entre catálogo, carrinho e pedido, mesmo quando exemplos do design associam artes ou IDs diferentes a rótulos iguais. Quantidades ilustrativas não substituem estoque/edições da API. Preço anterior é riscado e o selo RARO fica contido no card para legibilidade. A edição única permanece 1/1, corrigindo a repetição de 1/10 do exemplo mobile. Os fluxos de API conservam seus valores reais, em vez de reproduzir quantidades ilustrativas do desenho.

O filtro de preço mantém dois campos numéricos em lugar do slider ilustrativo: isso permite informar valores exatos e operar com teclado/leitor de tela. O rascunho só é aplicado em Aplicar; limpar e mudanças dos limites pela URL sincronizam os campos. Ordenação também está disponível nos filtros mobile. Essa é uma adaptação explícita do desenho.

Google/Facebook, newsletter, suporte e conteúdo editorial informam quando uma ação não é integrada. O botão central mobile leva a novos lançamentos. A exploração de transação é identificada como simulada. Diálogos usam título, Escape, contenção e devolução de foco; skeletons respeitam movimento reduzido.

## Validação e publicação

Os testes de REST passam por MSW e os de eventos pelo cliente Socket.IO. A regressão visual canônica usa Ubuntu 24.04/Chromium no GitHub Actions, com baselines Linux próprias; as Windows/Chrome são adicionais. A configuração impede geração automática de imagens esperadas. As baselines versionadas detectam regressão da implementação; não comprovam, isoladamente, fidelidade ao Figma. O Lighthouse mede conteúdo, imagens, fontes e mocks reais do build. Relatórios e condições de execução estão em `reports/lighthouse`, com resumo no README.

O build executa sem backend privado. Há fallback SPA para Vercel e Netlify/Cloudflare. A publicação e a validação da URL pública permanecem pendentes.
