import { test, expect, type Page } from "@playwright/test";
import { rest, login, checkout } from "./support";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".nft-grid .nft-card").first()).toBeVisible();
  await rest(page, "/demo/reset", { scenario: "success" });
  await page.reload();
  await expect(page.locator(".nft-grid .nft-card").first()).toBeVisible();
});
async function buyer(page: Page, email = "colecionador@kurio.demo") {
  const session = await rest(page, "/session", {
    email,
    password: "Kurio123!",
  });
  expect(session.status).toBe(200);
  const headers = { Authorization: "Bearer " + session.data.token };
  const request = (
    path: string,
    body?: unknown,
    method?: string,
    extra: Record<string, string> = {},
  ) => rest(page, path, body, method, { ...headers, ...extra });
  return { request, headers };
}
async function pendingOrder(
  page: Page,
  email: string,
  edition = "1/1",
  key = email,
) {
  const user = await buyer(page, email);
  await user.request("/cart/items", { nftId: "nft-1", edition, quantity: 1 });
  const quote = await user.request("/quotes", {
    coupon: "",
    network: "Ethereum",
  });
  const wallets = await user.request("/wallets");
  const body = {
    quoteId: quote.data.id,
    walletId: wallets.data.find((w: { primary: boolean }) => w.primary).id,
    collector: {
      displayName: "Demo",
      username: "demo",
      email,
      profileName: "Demo",
      referral: "KURIO",
      ens: "demo.eth",
    },
  };
  const order = await user.request("/orders", body, "POST", {
    "Idempotency-Key": key,
  });
  expect(order.status).toBe(201);
  return { ...user, body, order: order.data, key };
}

test("última unidade confirma apenas um dos pedidos concorrentes e mantém idempotência", async ({
  page,
}) => {
  await rest(page, "/demo/scenario", { scenario: "pending" });
  const [a, b] = await Promise.all([
    pendingOrder(page, "colecionador@kurio.demo"),
    pendingOrder(page, "nova@kurio.demo"),
  ]);
  const results = await Promise.all(
    [a, b].map((user) =>
      rest(page, "/demo/event", { kind: "order", id: user.order.id }),
    ),
  );
  expect(results.map((r) => r.data.status).sort()).toEqual([
    "confirmed",
    "declined",
  ]);
  expect((await rest(page, "/nfts/nft-1")).data.editions["1/1"]).toBe(0);
  for (const user of [a, b]) {
    const replay = await user.request("/orders", user.body, "POST", {
      "Idempotency-Key": user.key,
    });
    expect(replay.data.id).toBe(user.order.id);
    const cart = await user.request("/cart");
    expect(cart.data.items).toHaveLength(
      replay.data.status === "confirmed" ? 0 : 1,
    );
  }
});
test("falta de estoque em uma linha recusa o pedido inteiro sem consumo parcial", async ({
  page,
}) => {
  await rest(page, "/demo/scenario", { scenario: "pending" });
  const user = await buyer(page);
  await user.request("/cart/items", {
    nftId: "nft-2",
    edition: "1/1",
    quantity: 1,
  });
  // pendingOrder appends nft-1 after nft-2; deplete the last item to detect partial settlement.
  const purchase = await pendingOrder(page, "colecionador@kurio.demo", "1/50");
  const nft = await rest(page, "/nfts/nft-1");
  await rest(page, "/demo/event", {
    kind: "nft",
    id: "nft-1",
    patch: { editions: { ...nft.data.editions, "1/50": 0 } },
  });
  const result = await rest(page, "/demo/event", {
    kind: "order",
    id: purchase.order.id,
  });
  expect(result.data.status).toBe("declined");
  expect((await rest(page, "/nfts/nft-2")).data.editions["1/1"]).toBe(1);
  expect((await purchase.request("/cart")).data.items).toHaveLength(2);
});
test("remover e readicionar durante pedido pendente preserva a nova linha após refresh", async ({
  page,
}) => {
  await rest(page, "/demo/scenario", { scenario: "pending" });
  const user = await pendingOrder(page, "colecionador@kurio.demo", "1/50");
  const before = await user.request("/cart");
  await user.request(
    "/cart/items/" + encodeURIComponent(before.data.items[0].id),
    undefined,
    "DELETE",
  );
  await user.request("/cart/items", {
    nftId: "nft-1",
    edition: "1/50",
    quantity: 1,
  });
  await page.reload();
  await expect(page.locator(".nft-grid .nft-card").first()).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await rest(page, "/demo/event", { kind: "order", id: user.order.id });
    const cart = await user.request("/cart");
    expect(cart.data.items).toHaveLength(1);
    expect(cart.data.items[0].quantity).toBe(1);
  }
});
test("e-mail canônico rejeita colisões sem persistir conta ou perfil inválido", async ({
  page,
}) => {
  const conflict = await rest(page, "/accounts", {
    username: "outro_usuario",
    email: "COLECIONADOR@kurio.demo",
    password: "OutraSenha123!",
    confirmation: "OutraSenha123!",
  });
  expect(conflict.status).toBe(409);
  const valid = await rest(page, "/accounts", {
    username: "outro_usuario",
    email: "  NOVA.CONTA@kurio.demo  ",
    password: "OutraSenha123!",
    confirmation: "OutraSenha123!",
  });
  expect(valid.status).toBe(201);
  expect(valid.data.user.email).toBe("nova.conta@kurio.demo");
  const user = await buyer(page, "nova@kurio.demo");
  const profile = await user.request("/profile");
  const edit = await user.request(
    "/profile",
    { ...profile.data, email: " COLECIONADOR@KURIO.DEMO " },
    "PATCH",
  );
  expect(edit.status).toBe(409);
  expect((await user.request("/profile")).data.email).toBe("nova@kurio.demo");
  expect(
    (
      await rest(page, "/session", {
        email: " COLECIONADOR@KURIO.DEMO ",
        password: "Kurio123!",
      })
    ).status,
  ).toBe(200);
});
test("faixa de preço sincroniza limpar, refresh, voltar e avançar", async ({
  page,
  isMobile,
}) => {
  if (isMobile)
    await page
      .getByRole("button", { name: "Abrir filtros", exact: true })
      .click();
  let filters = isMobile
    ? page.getByRole("dialog")
    : page.locator(".market-layout>aside");
  await filters.getByLabel("Preço mínimo", { exact: true }).fill("1");
  await filters.getByLabel("Preço máximo", { exact: true }).fill("2");
  await filters.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      JSON.parse(url.searchParams.get("min") || "null") === "1" &&
      JSON.parse(url.searchParams.get("max") || "null") === "2",
  );
  await filters
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(page).toHaveURL(/min=&max=/);
  await expect(filters.getByLabel("Preço mínimo", { exact: true })).toHaveValue(
    "0.02",
  );
  await expect(filters.getByLabel("Preço máximo", { exact: true })).toHaveValue(
    "12.30",
  );
  await filters.getByLabel("Preço mínimo", { exact: true }).fill("1.5");
  await filters.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => JSON.parse(url.searchParams.get("min") || "null") === "1.5",
  );
  await page.goBack();
  await expect(filters.getByLabel("Preço mínimo", { exact: true })).toHaveValue(
    "0.02",
  );
  await page.goForward();
  await expect(filters.getByLabel("Preço mínimo", { exact: true })).toHaveValue(
    "1.5",
  );
  await page.reload();
  if (isMobile)
    await page
      .getByRole("button", { name: "Abrir filtros", exact: true })
      .click();
  filters = isMobile
    ? page.getByRole("dialog")
    : page.locator(".market-layout>aside");
  await expect(filters.getByLabel("Preço mínimo", { exact: true })).toHaveValue(
    "1.5",
  );
});
test("401 de mutation antiga não expira a sessão seguinte", async ({
  page,
  isMobile,
}) => {
  await login(page);
  await rest(page, "/demo/scenario", { scenario: "slow" });
  await page
    .getByLabel("Nome de exibição", { exact: false })
    .fill("Operação antiga A");
  const sent = page.waitForRequest(
      (r) => r.url().endsWith("/api/profile") && r.method() === "PATCH",
    ),
    finished = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/profile") && r.request().method() === "PATCH",
    );
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await sent;
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page
    .getByRole("link", {
      name: isMobile ? "Minha conta" : "Entrar",
      exact: true,
    })
    .first()
    .click();
  await page.getByLabel(/^E-mail(?: \*)?$/).fill("nova@kurio.demo");
  await page.getByLabel(/^Senha(?: \*)?$/).fill("Kurio123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  const tokenB = await page.evaluate(() => localStorage.getItem("kurio.token"));
  expect(tokenB).toBeTruthy();
  expect((await finished).status()).toBe(401);
  expect(await page.evaluate(() => localStorage.getItem("kurio.token"))).toBe(
    tokenB,
  );
  await page
    .getByRole("link", {
      name: isMobile ? "Minha conta" : "Meu perfil",
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByLabel("Nome de exibição", { exact: false }),
  ).toHaveValue("Nova Sato");
  await expect(page.getByRole("status")).not.toContainText("sessão expirou");
});

test("sucesso tardio de A não mostra avisos privados depois do login de B", async ({
  page,
  isMobile,
}) => {
  await login(page);
  await rest(page, "/demo/scenario", { scenario: "response-lag" });
  await page
    .getByLabel("Nome de exibição", { exact: false })
    .fill("Operação antiga A");
  const finished = page.waitForResponse(
    (r) => r.url().endsWith("/api/profile") && r.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect
    .poll(async () => (await rest(page, "/profile")).data.displayName)
    .toBe("Operação antiga A");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page
    .getByRole("link", {
      name: isMobile ? "Minha conta" : "Entrar",
      exact: true,
    })
    .first()
    .click();
  await page.getByLabel(/^E-mail(?: \*)?$/).fill("nova@kurio.demo");
  await page.getByLabel(/^Senha(?: \*)?$/).fill("Kurio123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  const tokenB = await page.evaluate(() => localStorage.getItem("kurio.token"));
  expect((await finished).status()).toBe(200);
  expect(await page.evaluate(() => localStorage.getItem("kurio.token"))).toBe(
    tokenB,
  );
  await page
    .getByRole("link", {
      name: isMobile ? "Minha conta" : "Meu perfil",
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByLabel("Nome de exibição", { exact: false }),
  ).toHaveValue("Nova Sato");
  await expect(page.locator(".toast")).not.toContainText("Perfil salvo");
});
test("ordenação e paginação operam os controles e alteram os itens reais", async ({
  page,
  isMobile,
}) => {
  const cards = page.locator(".nft-grid .nft-card");
  for (const sort of ["price-asc", "price-desc"]) {
    if (isMobile) {
      await page
        .getByRole("button", { name: "Abrir filtros", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByLabel("Ordenar NFTs", { exact: true })
        .selectOption(sort);
      await page
        .getByRole("button", { name: "Ver resultados", exact: true })
        .click();
    } else
      await page
        .getByRole("combobox", { name: "Ordenar NFTs", exact: true })
        .selectOption(sort);
    await expect(page).toHaveURL(new RegExp("sort=" + sort));
    await expect(cards).toHaveCount(9);
    await expect
      .poll(async () => {
        const values = await cards
          .locator(".card-caption strong")
          .allTextContents();
        const prices = values.map((v) => Number(v.replace(" ETH", "")));
        return prices.every(
          (v, i) =>
            !i ||
            (sort === "price-asc" ? prices[i - 1] <= v : prices[i - 1] >= v),
        );
      })
      .toBeTruthy();
  }
  const first = await cards.locator(".card-caption>a").allTextContents();
  await page
    .getByRole("button", { name: "Próxima página", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Página 2", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect
    .poll(() => cards.locator(".card-caption>a").allTextContents())
    .not.toEqual(first);
  const second = await cards.locator(".card-caption>a").allTextContents();
  expect(second.filter((n) => first.includes(n))).toHaveLength(0);
  await page.getByRole("button", { name: "Página 1", exact: true }).click();
  await expect
    .poll(() => cards.locator(".card-caption>a").allTextContents())
    .toEqual(first);
});
for (const scenario of ["variable", "out-of-order"])
  test(
    "busca " + scenario + " descarta a resposta REST anterior",
    async ({ page, isMobile }) => {
      await rest(page, "/demo/scenario", { scenario });
      await page.clock.install();
      const search = async (text: string) => {
        if (!isMobile)
          await page
            .getByRole("button", { name: "Abrir busca", exact: true })
            .click();
        const input = isMobile
          ? page.getByLabel("Explorar coleções", { exact: true })
          : page.getByLabel("Buscar NFTs", { exact: true });
        await input.fill(text);
        await input.press("Enter");
      };
      const first = page.waitForRequest(
        (r) =>
          new URL(r.url()).pathname === "/api/nfts" &&
          new URL(r.url()).searchParams.get("q") === "Emerald",
      );
      await search("Emerald");
      await first;
      await search("Sage");
      await page.clock.runFor(150);
      const names = page.locator(".nft-grid .card-caption>a");
      await expect(names).toHaveCount(4);
      for (const name of await names.allTextContents())
        expect(name).toContain("Sage");
      await page.clock.runFor(1200);
      await expect(page).toHaveURL(/q=Sage/);
      for (const name of await names.allTextContents())
        expect(name).toContain("Sage");
      await expect(page.getByRole("alert")).toHaveCount(0);
    },
  );
test("teclado contém foco no diálogo e conclui cadastro sem mouse", async ({
  page,
  isMobile,
}) => {
  await page.goto("/register");
  const dialog = page.getByRole("dialog");
  await expect(page.locator("#username")).toBeVisible();
  if (!isMobile) {
    for (const key of ["Tab", "Shift+Tab"])
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press(key);
        expect(
          await dialog.evaluate((e) => e.contains(document.activeElement)),
        ).toBeTruthy();
      }
  }
  const focus = async (selector: string) => {
    for (let i = 0; i < 24; i++) {
      if (
        await page
          .locator(selector)
          .evaluate((e) => e === document.activeElement)
      )
        return;
      await page.keyboard.press("Tab");
    }
    throw Error("Elemento não alcançável por Tab: " + selector);
  };
  for (const [id, value] of [
    ["username", "teclado_user"],
    ["email", "teclado@kurio.demo"],
    ["password", "Teclado123!"],
    ["confirmation", "Teclado123!"],
  ]) {
    await focus("#" + id);
    await page.keyboard.type(value);
  }
  await focus(
    '.auth-mobile form>button[type="submit"],.auth-dialog form>button[type="submit"]',
  );
  await page.keyboard.press("Enter");
  await expect(page).not.toHaveURL(/register/);
  await expect(page.locator(".toast")).toContainText("Perfil criado");
});
test("eventos duplicados e antigos com preço conflitante não causam regressão nem avisos", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveAttribute(
    "data-socket",
    "connected",
  );
  let requests = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/nfts") requests++;
  });
  await rest(page, "/demo/event", {
    kind: "nft",
    id: "nft-1",
    patch: { price: "1.29" },
  });
  await expect(page.locator(".nft-grid .nft-card").first()).toContainText(
    "1.29 ETH",
  );
  await page.getByRole("button", { name: "Fechar aviso", exact: true }).click();
  const count = requests;
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { pricesSeen: string[] }).pricesSeen = seen;
    new MutationObserver(() => {
      const price = document.querySelector(
        ".nft-grid .nft-card .card-caption strong",
      )?.textContent;
      if (price) seen.push(price);
    }).observe(document.querySelector(".nft-grid")!, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await rest(page, "/demo/event", {
    kind: "duplicate",
    id: "nft-1",
    patch: { price: "0.01" },
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator(".toast")).toHaveCount(0);
  expect(requests).toBe(count);
  expect(
    await page.evaluate(
      () => (window as unknown as { pricesSeen: string[] }).pricesSeen,
    ),
  ).not.toContain("0.01 ETH");
  await expect(page.locator(".nft-grid .nft-card").first()).toContainText(
    "1.29 ETH",
  );
});
test("estoque esgotado via Socket.IO bloqueia confirmação no checkout", async ({
  page,
}) => {
  await checkout(page);
  await expect(page.locator("html")).toHaveAttribute(
    "data-socket",
    "connected",
  );
  const nft = await rest(page, "/nfts/nft-1");
  await rest(page, "/demo/event", {
    kind: "nft",
    id: "nft-1",
    patch: { editions: { ...nft.data.editions, "1/50": 0 } },
  });
  await expect(page.getByRole("alert").first()).toContainText(
    "disponibilidade",
  );
  await expect(
    page.getByRole("button", { name: "Revisar compra", exact: true }),
  ).toBeDisabled();
  expect((await rest(page, "/demo/state")).data.orders).toBe(0);
});

test("cadastros concorrentes com e-mail equivalente persistem apenas uma conta", async ({
  page,
}) => {
  const values = {
    password: "Concorrente123!",
    confirmation: "Concorrente123!",
  };
  const results = await Promise.all([
    rest(page, "/accounts", {
      ...values,
      username: "race_a",
      email: "RACE@kurio.demo",
    }),
    rest(page, "/accounts", {
      ...values,
      username: "race_b",
      email: " race@KURIO.demo ",
    }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  const rejected = results.findIndex((r) => r.status === 409);
  const retry = await rest(page, "/accounts", {
    ...values,
    username: rejected === 0 ? "race_a" : "race_b",
    email: "outro.race@kurio.demo",
  });
  expect(retry.status).toBe(201);
});
test("migração de pedido legado preserva o carrinho quando a geração não pode ser comprovada", async ({
  page,
}) => {
  await rest(page, "/demo/scenario", { scenario: "pending" });
  const user = await pendingOrder(page, "colecionador@kurio.demo", "1/50");
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("kurio.mock.v1")!);
    db.schema = 1;
    for (const cart of Object.values(db.carts) as {
      items: { generation?: string }[];
    }[])
      for (const item of cart.items) delete item.generation;
    for (const order of db.orders)
      for (const item of order.quote.items) delete item.generation;
    localStorage.setItem("kurio.mock.v1", JSON.stringify(db));
  });
  await page.reload();
  await expect(page.locator(".nft-grid .nft-card").first()).toBeVisible();
  await rest(page, "/demo/event", { kind: "order", id: user.order.id });
  const cart = await user.request("/cart");
  expect(cart.data.items).toHaveLength(1);
  expect(cart.data.items[0].generation).toBeTruthy();
  expect((await rest(page, "/nfts/nft-1")).data.editions["1/50"]).toBe(49);
  const replay = await user.request("/orders", user.body, "POST", {
    "Idempotency-Key": user.key,
  });
  expect(replay.data.id).toBe(user.order.id);
});
test("login, cadastro, favoritos e recibo sem overflow, incluindo viewport equivalente a zoom 200%", async ({
  page,
}) => {
  test.setTimeout(90000);
  await checkout(page);
  await page
    .getByRole("button", { name: "Confirmar compra", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Seus NFTs agora estão na sua carteira",
    }),
  ).toBeVisible();
  const receipt = new URL(page.url()).pathname;
  for (const width of [390, 414, 768, 1440, 720]) {
    await page.setViewportSize({ width, height: width === 720 ? 500 : 1000 });
    for (const path of ["/login", "/register", "/favorites", receipt]) {
      await page.goto(path);
      if (path === "/login" || path === "/register")
        await expect(page.getByLabel(/^E-mail(?: \*)?$/)).toBeVisible();
      else if (path === receipt)
        await expect(
          page.getByRole("heading", {
            name: "Seus NFTs agora estão na sua carteira",
          }),
        ).toBeVisible();
      else await expect(page.locator(".account-content")).toBeVisible();
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          { message: path + " em " + width + "px" },
        )
        .toBeTruthy();
    }
  }
});
