import { expect, type Page } from "@playwright/test";
export async function rest(
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
export async function login(
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
  if (destination === "/checkout")
    await expect(page.locator(".checkout-layout")).toBeVisible();
  else
    await expect(
      page.getByRole("heading", {
        name: "Perfil do colecionador",
        exact: true,
      }),
    ).toBeVisible();
}
export async function add(page: Page) {
  await page.goto("/nft/nft-1");
  await page
    .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("adicionado");
}
export async function checkout(page: Page) {
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
