import { delay, http, HttpResponse, ws } from "msw";
import { toSocketIo } from "@mswjs/socket.io-binding";
import type { Edition, Network, Wallet } from "../domain";
import { wei } from "../domain";
import {
  account,
  addItem,
  cartFor,
  createOrder,
  db,
  digest,
  Fault,
  getCart,
  nft,
  quote,
  recoverOrders,
  reset,
  save,
  scenarios,
  settle,
  signIn,
  subscribe,
  updateNft,
  validateProfile,
  validateQuantity,
  validateWallet,
  owner,
  emit,
} from "./database";
interface RequestBody extends Wallet {
  [key: string]: unknown;
  username: string;
  password: string;
  confirmation: string;
  currentPassword: string;
  newPassword: string;
  avatar: string;
  walletNickname: string;
  quantity: number;
  nftId: string;
  edition: Edition;
  coupon: string;
  quoteId: string;
  walletId: string;
  collector: Record<string, string>;
  scenario: string;
  kind: string;
  patch: Parameters<typeof updateNft>[1];
  declined: boolean;
}

// MSW 2.15 normalizes the default Socket.IO path to the server root before matching.
const socket = ws.link(location.origin);
export const handlers = [
  socket.addEventListener("connection", (connection) => {
    const { client } = connection;
    const io = toSocketIo(connection);
    let userId: string | undefined;
    try {
      const token = new URL(client.url).searchParams.get("token");
      if (token) userId = account(token).profile.id;
    } catch {
      client.close(1008, "Sessão inválida");
      return;
    }
    const unsubscribe = subscribe((name, event) => {
      if (!event.ownerId || event.ownerId === userId)
        io.client.emit(name, event);
    });
    const heartbeat = setInterval(() => client.send("2"), 20000);
    client.addEventListener("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    io.client.on("demo.ping", () =>
      io.client.emit("demo.pong", { transport: "socket.io", version: 1 }),
    );
    recoverOrders();
  }),
  http.all("/api/*", async ({ request }) => {
    const url = new URL(request.url),
      path = url.pathname.slice(4),
      method = request.method;
    const token =
      request.headers.get("authorization")?.replace("Bearer ", "") || null;
    const visitor = request.headers.get("x-visitor") || "anonymous";
    const rawBody =
      method === "GET" || method === "DELETE" ? "" : await request.text();
    let body: RequestBody;
    try {
      body = (rawBody ? JSON.parse(rawBody) : {}) as RequestBody;
    } catch {
      return HttpResponse.json(
        { error: { code: "BAD_REQUEST", message: "JSON inválido." } },
        { status: 400 },
      );
    }
    const response = (data: unknown, status = 200) =>
      HttpResponse.json(data as never, { status });
    try {
      if (path === "/demo/reset" && method === "POST")
        return response(await reset(body.scenario || "success"));
      if (path === "/demo/scenario" && method === "POST") {
        if (!scenarios.includes(body.scenario))
          throw new Fault(422, "SCENARIO", "Cenário desconhecido.");
        db.scenario = body.scenario;
        save();
        return response({ scenario: db.scenario });
      }
      if (path === "/demo/state")
        return response({
          scenario: db.scenario,
          orders: db.orders.length,
          versions: db.nfts.map((n) => [n.id, n.version]),
        });
      if (path === "/demo/event" && method === "POST") {
        if (body.kind === "nft")
          return response(updateNft(body.id, body.patch));
        if (body.kind === "duplicate") {
          const n = nft(body.id);
          const event = {
            eventId: `nft:${n.id}:${n.version}`,
            resourceId: n.id,
            version: n.version,
            resource: structuredClone(n),
          };
          emit("nft.updated", event);
          emit("nft.updated", {
            ...event,
            version: Math.max(0, n.version - 1),
          });
          return response({ ok: true });
        }
        if (body.kind === "order") {
          const o = db.orders.find((o) => o.id === body.id);
          if (!o) throw new Fault(404, "NOT_FOUND", "Pedido não encontrado.");
          settle(o, body.declined);
          return response(o);
        }
      }
      if (path === "/demo/expire" && method === "POST") {
        if (token && db.sessions[token]) db.sessions[token].expiresAt = 0;
        save();
        return response({ ok: true });
      }
      if (!path.startsWith("/session") && !path.startsWith("/accounts")) {
        if (db.scenario === "offline") return HttpResponse.error();
        if (db.scenario === "timeout") await delay(12000);
        if (["slow", "variable", "out-of-order"].includes(db.scenario))
          await delay(
            db.scenario === "slow"
              ? 1800
              : (url.searchParams.get("q")?.length || 0) % 2
                ? 1100
                : 120,
          );
        else await delay(90);
        if (db.scenario === "http-500")
          throw new Fault(
            503,
            "TRANSIENT",
            "Serviço temporariamente indisponível. Tente novamente.",
          );
        if (db.scenario === "http-400")
          throw new Fault(
            400,
            "BAD_REQUEST",
            "Não foi possível processar a solicitação.",
          );
      }
      if (path === "/accounts" && method === "POST") {
        if (db.scenario === "signup-conflict")
          throw new Fault(
            409,
            "ACCOUNT_EXISTS",
            "E-mail ou usuário já cadastrado.",
          );
        validateProfile({ ...body, displayName: body.username }, "");
        if (
          typeof body.password !== "string" ||
          body.password.length < 8 ||
          body.password !== body.confirmation
        )
          throw new Fault(
            422,
            "VALIDATION",
            "A senha deve ter ao menos oito caracteres e coincidir com a confirmação.",
            { confirmation: "Confira as senhas." },
          );
        const id = `user-${db.accounts.length + 1}`,
          salt = crypto.randomUUID();
        db.accounts.push({
          profile: {
            id,
            displayName: body.username,
            username: body.username,
            email: body.email,
            ens: "",
            walletNickname: "",
            avatar: "",
          },
          passwordHash: await digest(salt + body.password),
          salt,
          wallets: [],
          favorites: [],
        });
        save();
        return response(await signIn(body.email, body.password, visitor), 201);
      }
      if (path === "/session") {
        if (method === "POST")
          return response(await signIn(body.email, body.password, visitor));
        if (method === "DELETE") {
          if (token) delete db.sessions[token];
          save();
          return response({ ok: true });
        }
        const a = account(token);
        return response({
          user: a.profile,
          token,
          expiresAt: db.sessions[token!].expiresAt,
        });
      }
      if (path === "/nfts" && method === "GET") {
        const p = url.searchParams;
        let items = [...db.nfts];
        const q = (p.get("q") || "").toLowerCase(),
          cats = (p.get("categories") || "").split(",").filter(Boolean),
          nets = (p.get("networks") || "").split(",").filter(Boolean);
        const facets = {
          categories: Object.fromEntries(
            [...new Set(db.nfts.map((n) => n.category))].map((c) => [
              c,
              db.nfts.filter((n) => n.category === c).length,
            ]),
          ),
          networks: Object.fromEntries(
            ["Ethereum", "Polygon", "Solana"].map((c) => [
              c,
              db.nfts.filter((n) => n.network === c).length,
            ]),
          ),
        };
        items = items.filter(
          (n) =>
            (!q || `${n.name} ${n.collection}`.toLowerCase().includes(q)) &&
            (!cats.length || cats.includes(n.category)) &&
            (!nets.length || nets.includes(n.network)) &&
            (!p.get("min") || wei(n.price) >= wei(p.get("min")!)) &&
            (!p.get("max") || wei(n.price) <= wei(p.get("max")!)) &&
            (p.get("tab") !== "trending" || n.trending) &&
            (p.get("tab") !== "new" || n.created > 18),
        );
        if (db.scenario === "empty") items = [];
        const sort = p.get("sort");
        items.sort(
          sort === "price-asc"
            ? (a, b) =>
                wei(a.price) > wei(b.price)
                  ? 1
                  : wei(a.price) < wei(b.price)
                    ? -1
                    : 0
            : sort === "price-desc"
              ? (a, b) =>
                  wei(a.price) < wei(b.price)
                    ? 1
                    : wei(a.price) > wei(b.price)
                      ? -1
                      : 0
              : (a, b) => b.created - a.created,
        );
        const total = items.length,
          pages = Math.max(1, Math.ceil(total / 9)),
          page = Math.min(pages, Math.max(1, Number(p.get("page")) || 1));
        return response({
          items: items.slice((page - 1) * 9, page * 9),
          total,
          page,
          pages,
          facets,
        });
      }
      if (path.startsWith("/nfts/") && method === "GET")
        return response(nft(decodeURIComponent(path.slice(6))));
      if (path === "/cart" || path.startsWith("/cart/items")) {
        const id = owner(token, visitor),
          cart = cartFor(id);
        if (method === "GET") return response(getCart(id));
        if (method === "POST")
          return response(
            addItem(id, body.nftId, body.edition, body.quantity),
            201,
          );
        const itemId = decodeURIComponent(path.slice("/cart/items/".length)),
          item = cart.items.find((i) => i.id === itemId);
        if (!item) throw new Fault(404, "NOT_FOUND", "Item não encontrado.");
        if (method === "DELETE")
          cart.items = cart.items.filter((i) => i.id !== itemId);
        if (method === "PATCH") {
          validateQuantity(
            nft(item.nftId),
            item.edition as Edition,
            body.quantity,
          );
          if (body.quantity > item.quantity)
            item.added += body.quantity - item.quantity;
          item.quantity = body.quantity;
        }
        cart.revision++;
        save();
        return response(getCart(id));
      }
      if (path === "/quotes" && method === "POST")
        return response(
          quote(
            owner(token, visitor),
            body.coupon || "",
            (body.network || "Ethereum") as Network,
          ),
        );
      const user = account(token);
      if (path === "/favorites" || path.startsWith("/favorites/")) {
        if (method === "GET") return response(user.favorites);
        if (db.scenario === "favorite-error")
          throw new Fault(
            503,
            "TRANSIENT",
            "O favorito não foi salvo. Tente novamente.",
          );
        const id = path.slice(11);
        nft(id);
        user.favorites =
          method === "DELETE"
            ? user.favorites.filter((n) => n !== id)
            : [...new Set([...user.favorites, id])];
        save();
        return response(user.favorites);
      }
      if (path === "/profile") {
        if (method === "GET") return response(user.profile);
        if (db.scenario === "form-error")
          throw new Fault(
            422,
            "VALIDATION",
            "Não foi possível salvar este formulário.",
            { displayName: "Nome indisponível no cenário de erro." },
          );
        validateProfile(body, user.profile.id);
        if (body.avatar && String(body.avatar).length > 700000)
          throw new Fault(
            422,
            "AVATAR_SIZE",
            "Use uma imagem menor que 500 KB.",
            { avatar: "Imagem muito grande." },
          );
        user.profile = {
          ...user.profile,
          displayName: body.displayName,
          username: body.username,
          email: body.email,
          ens: body.ens || "",
          walletNickname: body.walletNickname || "",
          avatar: body.avatar || "",
        };
        save();
        return response(user.profile);
      }
      if (path === "/profile/password" && method === "PUT") {
        if (
          (await digest(user.salt + body.currentPassword)) !== user.passwordHash
        )
          throw new Fault(422, "VALIDATION", "A senha atual está incorreta.", {
            currentPassword: "Senha incorreta.",
          });
        if (
          typeof body.newPassword !== "string" ||
          body.newPassword.length < 8 ||
          body.newPassword !== body.confirmation
        )
          throw new Fault(
            422,
            "VALIDATION",
            "Use ao menos oito caracteres e confirme a nova senha.",
            { confirmation: "Confira as senhas." },
          );
        user.passwordHash = await digest(user.salt + body.newPassword);
        save();
        return response({ ok: true });
      }
      if (path === "/wallets" || path.startsWith("/wallets/")) {
        if (method === "GET") return response(user.wallets);
        if (db.scenario === "form-error")
          throw new Fault(422, "VALIDATION", "Confira os dados da carteira.", {
            address: "Endereço indisponível no cenário de erro.",
          });
        const wallet = body as unknown as Wallet;
        validateWallet(wallet);
        if (method === "POST") {
          if (user.wallets.length >= 2)
            throw new Fault(409, "LIMIT", "Você já possui duas carteiras.");
          wallet.id = crypto.randomUUID();
          wallet.primary = user.wallets.length === 0;
          user.wallets.push(wallet);
        } else {
          const index = user.wallets.findIndex((w) => w.id === path.slice(9));
          if (index < 0)
            throw new Fault(404, "NOT_FOUND", "Carteira não encontrada.");
          user.wallets[index] = {
            ...wallet,
            id: user.wallets[index].id,
            primary: user.wallets[index].primary,
          };
        }
        save();
        return response(user.wallets);
      }
      if (path === "/orders" && method === "GET") {
        recoverOrders();
        const order = db.orders.find(
          (o) =>
            o.ownerId === user.profile.id &&
            o.idempotencyKey === url.searchParams.get("attempt"),
        );
        if (!order)
          throw new Fault(
            404,
            "NOT_FOUND",
            "Tentativa ainda não criou um pedido.",
          );
        return response(order);
      }
      if (path === "/orders" && method === "POST") {
        const result = await createOrder(
          user,
          body as never,
          request.headers.get("idempotency-key") || "",
        );
        if (db.scenario === "order-timeout") {
          db.scenario = "success";
          save();
          await delay(11000);
        }
        return response(result, 201);
      }
      if (path.startsWith("/orders/") && method === "GET") {
        recoverOrders();
        const order = db.orders.find((o) => o.id === path.slice(8));
        if (!order) throw new Fault(404, "NOT_FOUND", "Pedido não encontrado.");
        if (order.ownerId !== user.profile.id)
          throw new Fault(
            403,
            "FORBIDDEN",
            "Este pedido pertence a outro colecionador.",
          );
        return response(order);
      }
      throw new Fault(404, "NOT_FOUND", "Recurso não encontrado.");
    } catch (error) {
      if (error instanceof Fault)
        return response(
          {
            error: {
              code: error.code,
              message: error.message,
              fields: error.fields,
              retryable: error.status >= 500,
            },
          },
          error.status,
        );
      console.error(error);
      return response(
        {
          error: {
            code: "INTERNAL",
            message: "Erro na simulação.",
            retryable: true,
          },
        },
        500,
      );
    }
  }),
];
