import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function rest(
  page: Page,
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
  headers: Record<string, string> = {},
) {
  return page.evaluate(
    async ({ path, body, method, headers }) => {
      const token = localStorage.getItem("kurio.token");
      const response = await fetch(`/api${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-visitor": localStorage.getItem("kurio.visitor") || "",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: await response.json() };
    },
    { path, body, method, headers },
  );
}
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.log("BROWSER ERROR:", error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Diário da Cunhagem" }),
  ).toBeVisible();
  await rest(page, "/demo/reset", { scenario: "success" });
  await page.reload();
  await expect(page.locator(".nft-card").first()).toBeVisible();
});
test("MSW REST + Socket.IO real atualizam o preço e descartam duplicatas", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveAttribute(
    "data-socket",
    "connected",
  );
  await rest(page, "/demo/event", {
    kind: "nft",
    id: "nft-1",
    patch: { price: "1.29" },
  });
  await expect(page.locator(".nft-card").first()).toContainText("1.29 ETH");
  await expect(page.getByRole("status")).toContainText(
    "Preço ou disponibilidade",
  );
  await rest(page, "/demo/event", { kind: "duplicate", id: "nft-1" });
  await expect(page.locator(".nft-card").first()).toContainText("1.29 ETH");
});
test("acesso direto, edição, carrinho e persistência", async ({ page }) => {
  await page.goto("/nft/nft-1");
  await expect(
    page.getByRole("heading", { name: "Emerald Ape #042", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("adicionado");
  await page.goto("/cart");
  await expect(page.locator(".cart-item")).toContainText("Emerald Ape #042");
  await expect(page.locator(".summary-total")).toContainText("1.206 ETH");
  await page.reload();
  await expect(page.locator(".cart-item")).toHaveCount(1);
  await page.goto("/nft/inexistente");
  await expect(page.getByRole("alert")).toContainText("NFT não encontrado");
});

async function login(
  page: Page,
  email = "colecionador@kurio.demo",
  password = "Kurio123!",
  destination = "/profile",
) {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  await page.getByLabel(/^E-mail(?: \*)?$/).fill(email);
  await page.getByLabel(/^Senha(?: \*)?$/).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(destination.replace("/", "\\/")));
  await expect(
    page.getByRole("heading", {
      name:
        destination === "/checkout"
          ? "Perfil do colecionador"
          : "Perfil do colecionador",
      exact: true,
    }),
  ).toBeVisible();
}
async function add(page: Page) {
  await page.goto("/nft/nft-1");
  await page
    .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("adicionado");
}
async function checkout(page: Page) {
  await add(page);
  await login(page, "colecionador@kurio.demo", "Kurio123!", "/checkout");
  await page
    .getByRole("button", { name: "Conectar carteira", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Conectar na simulação", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revisar compra", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar compra", exact: true }),
  ).toBeEnabled();
}

test("busca, filtros combinados, ordenação, paginação e histórico", async ({
  page,
  isMobile,
}) => {
  await page.goto("/?page=2");
  await expect(
    page.getByRole("button", { name: "Página 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  if (isMobile) {
    await page
      .getByRole("button", { name: "Abrir filtros", exact: true })
      .click();
  }
  const filters = isMobile
    ? page.getByRole("dialog")
    : page.locator(".market-layout>aside");
  await filters.getByLabel("Fotografia", { exact: false }).check();
  await expect(page).toHaveURL(/categories=Fotografia/);
  await expect(page).toHaveURL(/page=1/);
  await filters.getByLabel("Ethereum", { exact: false }).check();
  await expect(page).toHaveURL(/networks=Ethereum/);
  if (isMobile)
    await page
      .getByRole("button", { name: "Ver resultados", exact: true })
      .click();
  await expect(page.locator(".nft-card")).toHaveCount(4);
  await page.goto("/?q=Emerald&sort=price-asc&page=1");
  await expect(page.locator(".nft-card")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".nft-card").first()).toContainText("Emerald");
  await page.goto("/?q=inexistente");
  await expect(
    page.getByRole("heading", { name: "Nenhum NFT encontrado" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator(".nft-card")).toHaveCount(4);
});
test("sessão, expiração, retorno ao fluxo e troca de usuário", async ({
  page,
}) => {
  await login(page);
  await page
    .getByLabel("Nome de exibição", { exact: false })
    .fill("Conta privada A");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Perfil salvo");
  await page.reload();
  await expect(
    page.getByLabel("Nome de exibição", { exact: false }),
  ).toHaveValue("Conta privada A");
  await rest(page, "/demo/expire", {});
  await page.goto("/wallets");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel(/^E-mail(?: \*)?$/).fill("nova@kurio.demo");
  await page.getByLabel(/^Senha(?: \*)?$/).fill("Kurio123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/wallets/);
  await page.goto("/profile");
  await expect(
    page.getByLabel("Nome de exibição", { exact: false }),
  ).toHaveValue("Nova Sato");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.goto("/profile");
  await expect(page).toHaveURL(/login/);
});
test("cadastro com conflito e criação persistente", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel(/^Nome de usuário(?: \*)?$/).fill("novo_usuario");
  await page.getByLabel(/^E-mail(?: \*)?$/).fill("colecionador@kurio.demo");
  await page.getByLabel(/^Senha(?: \*)?$/).fill("NovaSenha123!");
  await page.getByLabel(/^Confirmar senha(?: \*)?$/).fill("NovaSenha123!");
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("já cadastrado");
  await page.getByLabel(/^E-mail(?: \*)?$/).fill("novo@kurio.demo");
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.goto("/profile");
  await expect(page.getByLabel(/^Nome de usuário(?: \*)?$/)).toHaveValue(
    "novo_usuario",
  );
});
test("favorito otimista, falha e rollback persistente", async ({ page }) => {
  await login(page);
  await page.goto("/nft/nft-1");
  await page
    .getByRole("button", { name: "Favoritar Emerald Ape #042", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remover Emerald Ape #042 dos favoritos",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", {
      name: "Remover Emerald Ape #042 dos favoritos",
    }),
  ).toBeEnabled();
  await rest(page, "/demo/scenario", { scenario: "favorite-error" });
  await page
    .getByRole("button", { name: "Remover Emerald Ape #042 dos favoritos" })
    .click();
  await expect(page.getByRole("status")).toContainText("não foi salvo");
  await expect(
    page.getByRole("button", {
      name: "Remover Emerald Ape #042 dos favoritos",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await rest(page, "/demo/scenario", { scenario: "success" });
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remover Emerald Ape #042 dos favoritos",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/favorites");
  await expect(page.locator(".nft-card")).toHaveCount(1);
});
test("carrinho, limite, cupom inválido/expirado/válido e mesclagem no login", async ({
  page,
}) => {
  await add(page);
  await page.goto("/cart");
  await page.getByRole("button", { name: "Aumentar quantidade" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Quantidade", exact: true }),
  ).toHaveValue("2");
  await page.getByLabel(/^Código promocional(?: \*)?$/).fill("INVALIDO");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("inválido");
  await page.getByLabel(/^Código promocional(?: \*)?$/).fill("EXPIRED");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("expirou");
  await page.getByLabel(/^Código promocional(?: \*)?$/).fill("KURIO10");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.locator(".summary-total")).toContainText("2.158 ETH");
  await login(page);
  await page.goto("/cart");
  await expect(
    page.getByRole("spinbutton", { name: "Quantidade", exact: true }),
  ).toHaveValue("2");
  const invalid = await rest(page, "/cart/items", {
    nftId: "nft-1",
    edition: "1/1",
    quantity: 2,
  });
  expect(invalid.status).toBe(409);
  await page
    .getByRole("button", { name: "Remover Emerald Ape #042", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Seu carrinho está vazio" }),
  ).toBeVisible();
});
test("compra completa do catálogo até o recibo e snapshot após atualização", async ({
  page,
}) => {
  await checkout(page);
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(page).toHaveURL(/orders\/order-/);
  await expect(
    page.getByRole("heading", {
      name: "Seus NFTs agora estão na sua carteira",
    }),
  ).toBeVisible();
  await expect(page.locator(".receipt .summary-total")).toContainText(
    "1.206 ETH",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Seus NFTs agora estão na sua carteira",
    }),
  ).toBeVisible();
  await rest(page, "/demo/event", {
    kind: "nft",
    id: "nft-1",
    patch: { price: "9.99" },
  });
  await expect(page.locator(".receipt .summary-total")).toContainText(
    "1.206 ETH",
  );
  const cart = await rest(page, "/cart");
  expect(cart.data.items).toHaveLength(0);
});
test("recusa de pagamento preserva carrinho", async ({ page }) => {
  await checkout(page);
  await rest(page, "/demo/scenario", { scenario: "declined" });
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pagamento recusado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voltar ao carrinho" }).click();
  await expect(page.locator(".cart-item")).toHaveCount(1);
});
test("idempotência concorrente, conteúdo conflitante e propriedade do pedido", async ({
  page,
}) => {
  await add(page);
  await login(page);
  await rest(page, "/demo/scenario", { scenario: "pending" });
  const q = await rest(page, "/quotes", { coupon: "", network: "Ethereum" });
  const payload = {
    quoteId: q.data.id,
    walletId: "wallet-1",
    collector: {
      displayName: "Demo",
      username: "demo",
      email: "demo@kurio.demo",
    },
  };
  const [a, b] = await Promise.all([
    rest(page, "/orders", payload, "POST", {
      "Idempotency-Key": "test-concurrent",
    }),
    rest(page, "/orders", payload, "POST", {
      "Idempotency-Key": "test-concurrent",
    }),
  ]);
  expect(a.data.id).toBe(b.data.id);
  const conflict = await rest(
    page,
    "/orders",
    {
      ...payload,
      collector: { ...payload.collector, displayName: "Alterado" },
    },
    "POST",
    { "Idempotency-Key": "test-concurrent" },
  );
  expect(conflict.status).toBe(409);
  const other = await rest(page, "/session", {
    email: "nova@kurio.demo",
    password: "Kurio123!",
  });
  const forbidden = await page.evaluate(
    async ({ id, token }) => {
      const r = await fetch(`/api/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.status;
    },
    { id: a.data.id, token: other.data.token },
  );
  expect(forbidden).toBe(403);
});
test("timeout recupera a mesma tentativa sem duplicar compra", async ({
  page,
}) => {
  test.setTimeout(45000);
  await checkout(page);
  await rest(page, "/demo/scenario", { scenario: "order-timeout" });
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Seus NFTs agora estão na sua carteira",
    }),
  ).toBeVisible({ timeout: 15000 });
  const state = await rest(page, "/demo/state");
  expect(state.data.orders).toBe(1);
});
test("preço via Socket.IO invalida revisão no checkout", async ({ page }) => {
  await checkout(page);
  await expect(page.locator("html")).toHaveAttribute(
    "data-socket",
    "connected",
  );
  await rest(page, "/demo/event", {
    kind: "nft",
    id: "nft-1",
    patch: { price: "1.49" },
  });
  await expect(page.locator(".summary-total")).toContainText("1.506 ETH");
  await expect(
    page.getByRole("button", { name: "Revisar compra", exact: true }),
  ).toBeVisible();
  expect((await rest(page, "/demo/state")).data.orders).toBe(0);
  await page
    .getByRole("button", { name: "Revisar compra", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Seus NFTs agora estão na sua carteira",
    }),
  ).toBeVisible();
});
test("pedido pendente, desconexão, reconexão e adições posteriores", async ({
  page,
}) => {
  await checkout(page);
  await rest(page, "/demo/scenario", { scenario: "pending" });
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pedido pendente" }),
  ).toBeVisible();
  const url = page.url(),
    id = new URL(url).pathname.split("/").pop()!;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("kurio:disconnect")),
  );
  await rest(page, "/cart/items", {
    nftId: "nft-1",
    edition: "1/50",
    quantity: 1,
  });
  await rest(page, "/demo/event", { kind: "order", id });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Seus NFTs agora estão na sua carteira",
    }),
  ).toBeVisible();
  const cart = await rest(page, "/cart");
  expect(cart.data.items[0].quantity).toBe(1);
  expect((await rest(page, "/demo/state")).data.orders).toBe(1);
});
test("perfil, avatar, senha, carteiras e validação do servidor", async ({
  page,
}) => {
  await login(page);
  await rest(page, "/demo/scenario", { scenario: "form-error" });
  await page.getByLabel("Nome de exibição", { exact: false }).fill("Novo nome");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível salvar",
  );
  await rest(page, "/demo/scenario", { scenario: "success" });
  await page.getByLabel("Alterar avatar").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByRole("img", { name: "Seu avatar" })).toBeVisible();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Perfil salvo");
  await page.reload();
  await expect(
    page.getByLabel("Nome de exibição", { exact: false }),
  ).toHaveValue("Novo nome");
  await expect(page.getByRole("img", { name: "Seu avatar" })).toBeVisible();
  await page.getByLabel("Senha atual", { exact: false }).fill("SenhaErrada!");
  await page.getByLabel(/^Nova senha(?: \*)?$/).fill("NovaSenha456!");
  await page
    .getByLabel("Confirmar nova senha", { exact: false })
    .fill("NovaSenha456!");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("alert")).toContainText("incorreta");
  await page.getByLabel("Senha atual", { exact: false }).fill("Kurio123!");
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByRole("status")).toContainText("Senha alterada");
  await page.goto("/wallets");
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Apelido da carteira", { exact: false })
    .fill("Carteira revisada");
  await dialog
    .getByLabel("Endereço da carteira", { exact: false })
    .fill("invalido");
  await dialog.getByRole("button", { name: "Salvar carteira" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Confira");
  await dialog
    .getByLabel("Endereço da carteira", { exact: false })
    .fill("0x" + "a".repeat(40));
  await dialog.getByRole("button", { name: "Salvar carteira" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".wallet-preview").first()).toContainText(
    "Carteira revisada",
  );
});
test("teclado, foco de diálogo, erro e skeleton com recuperação", async ({
  page,
  isMobile,
}) => {
  if (isMobile) {
    await page
      .getByRole("button", { name: "Abrir filtros", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Abrir filtros", exact: true }),
    ).toBeFocused();
  } else {
    await page.goto("/nft/nft-1");
    const zoom = page.getByRole("button", { name: "Ampliar arte do NFT" });
    await zoom.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(zoom).toBeFocused();
  }
  await rest(page, "/demo/scenario", { scenario: "slow" });
  await page.goto("/?q=Emerald");
  await expect(
    page.getByRole("status", { name: "Carregando conteúdo" }),
  ).toBeVisible();
  await expect(page.locator(".nft-card")).toHaveCount(4);
  await rest(page, "/demo/scenario", { scenario: "http-500" });
  await page.goto("/?q=Sage");
  await expect(page.getByRole("alert")).toBeVisible();
  await rest(page, "/demo/scenario", { scenario: "success" });
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.locator(".nft-card")).toHaveCount(4);
});
test("responsividade sem overflow em 390, 414, 768 e 1440", async ({
  page,
}) => {
  for (const width of [390, 414, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".nft-card").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("cotação revalidada bloqueia preço alterado e edição esgotada", async ({
  page,
}) => {
  await checkout(page);
  await rest(page, "/demo/scenario", { scenario: "price-changed" });
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("mudaram");
  expect((await rest(page, "/demo/state")).data.orders).toBe(0);
  await expect(page.locator(".summary-total")).toContainText("1.306 ETH");
  await page
    .getByRole("button", { name: "Revisar compra", exact: true })
    .click();
  await rest(page, "/demo/scenario", { scenario: "sold-out" });
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(page.getByRole("alert").first()).toContainText(
    /disponibilidade|estoque/,
  );
  expect((await rest(page, "/demo/state")).data.orders).toBe(0);
});
test("expiração no checkout preserva contexto e dados para retomada", async ({
  page,
}) => {
  await checkout(page);
  await page
    .getByLabel("Observação do colecionador (opcional)")
    .fill("Retomar esta observação");
  await rest(page, "/demo/expire", {});
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(page).toHaveURL(/login/);
  await page.getByLabel(/^E-mail(?: \*)?$/).fill("colecionador@kurio.demo");
  await page.getByLabel(/^Senha(?: \*)?$/).fill("Kurio123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/checkout/);
  await expect(
    page.getByLabel("Observação do colecionador (opcional)"),
  ).toHaveValue("Retomar esta observação");
  await expect(page.locator(".checkout-item")).toHaveCount(1);
});
test("duplo clique envia um único pedido", async ({ page }) => {
  await checkout(page);
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .dblclick();
  await expect(
    page.getByRole("heading", {
      name: "Seus NFTs agora estão na sua carteira",
    }),
  ).toBeVisible();
  expect((await rest(page, "/demo/state")).data.orders).toBe(1);
});
test("regressão visual: início, detalhe, carrinho e pagamento", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00Z"));
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("home.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });
  await page.goto("/nft/nft-1");
  await expect(
    page.getByRole("heading", { name: "Emerald Ape #042", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("detail.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });
  await page
    .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("adicionado");
  await page.goto("/cart");
  await expect(page.locator(".summary-total")).toContainText("1.206 ETH");
  await expect(page).toHaveScreenshot("cart.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });
  await login(page, "colecionador@kurio.demo", "Kurio123!", "/checkout");
  await expect(page.locator(".summary-total")).toContainText("1.206 ETH");
  await expect(page).toHaveScreenshot("checkout.png", {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });
});
