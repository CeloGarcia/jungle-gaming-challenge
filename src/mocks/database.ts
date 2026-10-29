import { categories, eth, wei } from "../domain";
import type {
  Cart,
  Edition,
  Network,
  Nft,
  Order,
  Profile,
  Quote,
  ResourceEvent,
  Session,
  Wallet,
} from "../domain";

interface Account {
  profile: Profile;
  passwordHash: string;
  salt: string;
  wallets: Wallet[];
  favorites: string[];
}
interface Db {
  schema: number;
  accounts: Account[];
  sessions: Record<string, { userId: string; expiresAt: number }>;
  nfts: Nft[];
  carts: Record<string, Cart>;
  orders: Order[];
  quotes: Record<string, Quote>;
  scenario: string;
  sequence: number;
}
const KEY = "kurio.mock.v1";
export const scenarios = [
  "success",
  "empty",
  "slow",
  "variable",
  "out-of-order",
  "response-lag",
  "timeout",
  "offline",
  "http-400",
  "http-500",
  "expired",
  "unauthorized",
  "signup-conflict",
  "form-error",
  "favorite-error",
  "coupon-invalid",
  "coupon-expired",
  "price-changed",
  "sold-out",
  "order-timeout",
  "confirmed",
  "declined",
  "pending",
];
export class Fault extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export let db: Db;
const subscribers = new Set<(name: string, event: ResourceEvent) => void>();
export function subscribe(fn: (name: string, event: ResourceEvent) => void) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
export function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
const baseNames = [
  "Emerald Ape #042",
  "Sage Nomad #009",
  "Neon Vessel #552",
  "Cosmic Bloom #118",
  "Violet Nomad #314",
  "Ivory Baron #088",
  "Golden Beat #207",
  "Golden Frequency #071",
  "Golden Signal #160",
];
const prices = [
  "1.19",
  "1.69",
  "1.99",
  "1.29",
  "1.39",
  "1.79",
  "0.99",
  "0.59",
  "0.39",
];
const images = [
  "emerald",
  "sage",
  "neon",
  "sage",
  "sage",
  "neon",
  "golden",
  "golden",
  "golden",
];
function fixtures(): Nft[] {
  return Array.from({ length: 36 }, (_, i) => {
    const j = i % 9;
    const suffix = i < 9 ? "" : ` — Série ${Math.floor(i / 9) + 1}`;
    return {
      id: `nft-${i + 1}`,
      name: baseNames[j] + suffix,
      tokenId: baseNames[j].split("#")[1].padStart(4, "0"),
      image: `/assets/${images[j]}.webp`,
      price: prices[j],
      ...(j === 2 ? { previousPrice: "2.29" } : {}),
      network: (["Ethereum", "Polygon", "Solana"] as Network[])[
        i < 9 ? 0 : i % 3
      ],
      category: categories[Math.floor(i / 4) % 9],
      collection: j < 6 ? "Kurio Apes" : "Kurio Editions",
      editions: { "1/1": 1, "1/10": 10, "1/50": 50, ABERTA: 100 },
      version: 1,
      rating: 4.8,
      reviews: 19,
      rare: j === 2,
      trending: i % 2 === 0,
      created: 36 - i,
    };
  });
}
function wallet(primary: boolean, index: number): Wallet {
  return {
    id: `wallet-${index}`,
    primary,
    displayName: primary ? "Principal" : "Reserva",
    nickname: primary ? "Minha carteira" : "Reserva",
    network: primary ? "Ethereum" : "Polygon",
    profileName: "Colecionador Kurio",
    address: `0x${(index === 1 ? "a91f" : "b82e").repeat(10)}`,
    secondary: "",
    type: primary ? "MetaMask" : "WalletConnect",
    referral: "KURIO",
    email: "colecionador@kurio.demo",
    ens: primary ? "kurio.eth" : "nova.kurio.eth",
  };
}
export async function reset(scenario = "success") {
  for (const key of Object.keys(localStorage))
    if (key.startsWith("kurio.")) localStorage.removeItem(key);
  const accounts: Account[] = [];
  for (const [i, username] of ["colecionador", "nova"].entries()) {
    const salt = `kurio-demo-salt-${i}`;
    accounts.push({
      profile: {
        id: `user-${i + 1}`,
        displayName: i ? "Nova Sato" : "Colecionador Kurio",
        username,
        email: `${username}@kurio.demo`,
        ens: i ? "nova.eth" : "kurio.eth",
        walletNickname: "Principal",
        avatar: "",
      },
      passwordHash: await digest(salt + "Kurio123!"),
      salt,
      wallets: [wallet(true, i * 2 + 1), wallet(false, i * 2 + 2)],
      favorites: [],
    });
  }
  db = {
    schema: 2,
    accounts,
    sessions: {},
    nfts: fixtures(),
    carts: {},
    orders: [],
    quotes: {},
    scenario,
    sequence: 0,
  };
  save();
  return { scenario };
}
export async function init() {
  try {
    const existing = JSON.parse(
      localStorage.getItem(KEY) || "null",
    ) as Db | null;
    if (existing?.schema === 1 || existing?.schema === 2) {
      db = existing;
      if (existing.schema === 1) {
        for (const cart of Object.values(db.carts))
          for (const item of cart.items)
            item.generation ||= crypto.randomUUID();
        for (const order of db.orders)
          for (const item of order.quote.items)
            item.generation ||= crypto.randomUUID();
        db.quotes = {};
        db.schema = 2;
        save();
      }
      return;
    }
  } catch {
    /* A corrupt demo state is reset deterministically. */
  }
  await reset();
}
export function account(token: string | null): Account {
  const session = token && db.sessions[token];
  if (
    !session ||
    session.expiresAt <= Date.now() ||
    ["expired", "unauthorized"].includes(db.scenario)
  )
    throw new Fault(
      401,
      "SESSION_EXPIRED",
      "Sua sessão expirou. Entre para continuar.",
    );
  const user = db.accounts.find((a) => a.profile.id === session.userId);
  if (!user) throw new Fault(401, "INVALID_SESSION", "Sessão inválida.");
  return user;
}
export function owner(token: string | null, visitor: string) {
  if (token) return account(token).profile.id;
  return `guest:${visitor}`;
}
export function cartFor(ownerId: string): Cart {
  return (
    db.carts[ownerId] ??
    (db.carts[ownerId] = { items: [], revision: 1, coupon: "" })
  );
}
export function getCart(ownerId: string): Cart {
  const cart = cartFor(ownerId);
  return {
    ...cart,
    items: cart.items.map((item) => ({ ...item, nft: nft(item.nftId) })),
  };
}
export function nft(id: string) {
  const value = db.nfts.find((item) => item.id === id);
  if (!value) throw new Fault(404, "NOT_FOUND", "NFT não encontrado.");
  return value;
}
export function validateQuantity(n: Nft, edition: Edition, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1)
    throw new Fault(
      422,
      "QUANTITY",
      "A quantidade deve ser um número inteiro positivo.",
    );
  if (!(edition in n.editions) || quantity > n.editions[edition])
    throw new Fault(
      409,
      "AVAILABILITY",
      "A quantidade excede a disponibilidade desta edição.",
    );
}
export function addItem(
  ownerId: string,
  nftId: string,
  edition: Edition,
  quantity: number,
) {
  const cart = cartFor(ownerId);
  const item = cart.items.find(
    (i) => i.nftId === nftId && i.edition === edition,
  );
  const n = nft(nftId);
  validateQuantity(n, edition, (item?.quantity || 0) + quantity);
  if (item) {
    item.quantity += quantity;
    item.added += quantity;
  } else
    cart.items.push({
      id: `${nftId}:${edition}`,
      nftId,
      edition,
      quantity,
      added: quantity,
      generation: crypto.randomUUID(),
      nft: n,
    });
  cart.revision++;
  save();
  return getCart(ownerId);
}
export function mergeCart(visitor: string, userId: string) {
  const guest = cartFor(`guest:${visitor}`);
  const target = cartFor(userId);
  for (const item of guest.items) {
    const existing = target.items.find(
      (i) => i.nftId === item.nftId && i.edition === item.edition,
    );
    const max = nft(item.nftId).editions[item.edition];
    const quantity = Math.min(max, (existing?.quantity || 0) + item.quantity);
    if (quantity > 0) {
      if (existing) {
        existing.added += quantity - existing.quantity;
        existing.quantity = quantity;
      } else
        target.items.push({
          ...item,
          quantity,
          added: quantity,
          generation: crypto.randomUUID(),
        });
    }
  }
  guest.items = [];
  if (!target.coupon) target.coupon = guest.coupon;
  guest.coupon = "";
  target.revision++;
  save();
}
export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
export async function signIn(
  email: string,
  password: string,
  visitor: string,
): Promise<Session> {
  const user = db.accounts.find(
    (a) => normalizeEmail(a.profile.email) === normalizeEmail(email),
  );
  if (!user || (await digest(user.salt + password)) !== user.passwordHash)
    throw new Fault(422, "CREDENTIALS", "E-mail ou senha inválidos.", {
      email: "Confira suas credenciais.",
    });
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 60 * 60 * 1000;
  db.sessions[token] = { userId: user.profile.id, expiresAt };
  mergeCart(visitor, user.profile.id);
  save();
  return { user: user.profile, token, expiresAt };
}
export function quote(
  ownerId: string,
  coupon: string,
  network: Network,
): Quote {
  if (!["Ethereum", "Polygon", "Solana"].includes(network))
    throw new Fault(422, "NETWORK", "Escolha uma rede válida.");
  const cart = getCart(ownerId);
  if (!cart.items.length)
    throw new Fault(422, "EMPTY_CART", "Seu carrinho está vazio.");
  for (const item of cart.items)
    validateQuantity(item.nft, item.edition, item.quantity);
  const code = coupon.trim().toUpperCase();
  if (code && (code === "EXPIRED" || db.scenario === "coupon-expired"))
    throw new Fault(410, "COUPON_EXPIRED", "Este cupom expirou.");
  if (code && (code !== "KURIO10" || db.scenario === "coupon-invalid"))
    throw new Fault(422, "COUPON_INVALID", "Código promocional inválido.");
  const subtotal = cart.items.reduce(
    (v, i) => v + wei(i.nft.price) * BigInt(i.quantity),
    0n,
  );
  const discount = code ? subtotal / 10n : 0n;
  const fee =
    network === "Ethereum"
      ? "0.016"
      : network === "Polygon"
        ? "0.002"
        : "0.001";
  const fingerprint = JSON.stringify([
    ownerId,
    cart.revision,
    cart.items.map((i) => [
      i.id,
      i.quantity,
      i.added,
      i.nft.version,
      i.nft.price,
    ]),
    code,
    network,
  ]);
  const existing = Object.values(db.quotes).find(
    (q) => q.fingerprint === fingerprint,
  );
  if (existing) {
    cartFor(ownerId).coupon = code;
    save();
    return existing;
  }
  const result: Quote = {
    id: `quote-${++db.sequence}`,
    ownerId,
    fingerprint,
    items: structuredClone(cart.items),
    subtotal: eth(subtotal),
    discount: eth(discount),
    fee,
    total: eth(subtotal - discount + wei(fee)),
    coupon: code,
    network,
    revision: cart.revision,
  };
  db.quotes[result.id] = result;
  cartFor(ownerId).coupon = code;
  save();
  return result;
}
export function emit(name: string, event: ResourceEvent) {
  subscribers.forEach((fn) => fn(name, event));
}
export function updateNft(
  id: string,
  patch: Partial<Pick<Nft, "price" | "editions">>,
) {
  const item = nft(id);
  Object.assign(item, patch);
  item.version++;
  save();
  const event: ResourceEvent = {
    eventId: `nft:${id}:${item.version}`,
    resourceId: id,
    version: item.version,
    resource: structuredClone(item),
  };
  emit("nft.updated", event);
  return event;
}
export function settle(order: Order, declined = false) {
  if (order.status !== "pending" || !db.orders.includes(order)) return order;
  // Validate every line before changing either stock or the cart. Settlement is synchronous.
  const required = new Map<
    string,
    { nft: Nft; edition: Edition; quantity: number }
  >();
  for (const bought of order.quote.items) {
    const key = bought.nftId + ":" + bought.edition;
    const demand = required.get(key);
    if (demand) demand.quantity += bought.quantity;
    else
      required.set(key, {
        nft: nft(bought.nftId),
        edition: bought.edition,
        quantity: bought.quantity,
      });
  }
  const unavailable =
    !declined &&
    [...required.values()].some(
      (line) => line.nft.editions[line.edition] < line.quantity,
    );
  declined ||= unavailable;
  if (unavailable)
    order.declineReason =
      "A disponibilidade mudou enquanto o pedido estava pendente. Nenhuma unidade foi consumida.";
  order.status = declined ? "declined" : "confirmed";
  order.version++;
  order.updatedAt = new Date().toISOString();
  if (!declined) {
    const cart = cartFor(order.ownerId);
    for (const bought of order.quote.items) {
      const item = cart.items.find(
        (i) => i.id === bought.id && i.generation === bought.generation,
      );
      if (item) {
        const later = Math.max(0, item.added - bought.added);
        item.quantity = Math.max(later, item.quantity - bought.quantity);
      }
      const n = nft(bought.nftId);
      n.editions[bought.edition] -= bought.quantity;
      n.version++;
    }
    cart.items = cart.items.filter((i) => i.quantity > 0);
    cart.revision++;
    cart.coupon = "";
  }
  save();
  if (!declined)
    for (const bought of order.quote.items) {
      const item = nft(bought.nftId);
      emit("nft.updated", {
        eventId: `nft:${item.id}:${item.version}`,
        resourceId: item.id,
        version: item.version,
        resource: structuredClone(item),
      });
    }
  emit("order.updated", {
    eventId: `order:${order.id}:${order.version}`,
    resourceId: order.id,
    version: order.version,
    ownerId: order.ownerId,
    resource: structuredClone(order),
  });
  return order;
}
export function recoverOrders() {
  for (const order of db.orders) {
    if (
      order.status === "pending" &&
      db.scenario !== "pending" &&
      Date.now() - new Date(order.createdAt).getTime() >= 1200
    )
      settle(order, db.scenario === "declined");
  }
}
async function createOrderInternal(
  user: Account,
  body: {
    quoteId: string;
    walletId: string;
    collector: Record<string, string>;
  },
  key: string,
) {
  if (!key)
    throw new Fault(
      422,
      "IDEMPOTENCY_REQUIRED",
      "A chave de tentativa é obrigatória.",
    );
  const requestHash = await digest(JSON.stringify(body));
  const existing = db.orders.find(
    (o) => o.idempotencyKey === key && o.ownerId === user.profile.id,
  );
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new Fault(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Esta tentativa já foi usada com outros dados.",
      );
    return existing;
  }
  const snapshot = db.quotes[body.quoteId];
  if (snapshot && snapshot.ownerId !== user.profile.id)
    throw new Fault(
      403,
      "FORBIDDEN",
      "Esta cotação pertence a outro colecionador.",
    );
  if (!snapshot)
    throw new Fault(
      409,
      "QUOTE_EXPIRED",
      "Revise os valores antes de confirmar.",
    );
  if (db.scenario === "price-changed") {
    db.scenario = "success";
    updateNft(snapshot.items[0].nftId, {
      price: eth(wei(snapshot.items[0].nft.price) + wei("0.1")),
    });
  }
  if (db.scenario === "sold-out") {
    db.scenario = "success";
    const n = nft(snapshot.items[0].nftId);
    updateNft(n.id, {
      editions: { ...n.editions, [snapshot.items[0].edition]: 0 },
    });
  }
  const fresh = quote(user.profile.id, snapshot.coupon, snapshot.network);
  if (fresh.fingerprint !== snapshot.fingerprint)
    throw new Fault(
      409,
      "QUOTE_CHANGED",
      "Preço, estoque ou taxas mudaram. Revise a nova cotação e confirme novamente.",
    );
  const selected = user.wallets.find((w) => w.id === body.walletId);
  if (!selected || selected.network !== snapshot.network)
    throw new Fault(
      422,
      "WALLET_NETWORK",
      "Selecione uma carteira da mesma rede.",
    );
  const collectorErrors: Record<string, string> = {};
  for (const key of [
    "displayName",
    "username",
    "profileName",
    "referral",
    "ens",
  ]) {
    if (!body.collector?.[key]?.trim())
      collectorErrors[key] = "Campo obrigatório.";
  }
  if (!/^\S+@\S+\.\S+$/.test(body.collector?.email || ""))
    collectorErrors.email = "E-mail inválido.";
  if (!/^[\w.-]+\.eth$/.test(body.collector?.ens || ""))
    collectorErrors.ens = "Use um nome terminado em .eth.";
  if (Object.keys(collectorErrors).length)
    throw new Fault(
      422,
      "VALIDATION",
      "Confira os dados do colecionador.",
      collectorErrors,
    );
  const now = new Date().toISOString();
  const order: Order = {
    id: `order-${++db.sequence}`,
    ownerId: user.profile.id,
    status: "pending",
    version: 1,
    createdAt: now,
    updatedAt: now,
    transaction: `0x${(await digest(key)).slice(0, 64)}`,
    quote: structuredClone(snapshot),
    wallet: structuredClone(selected),
    collector: body.collector,
    idempotencyKey: key,
    requestHash,
  };
  db.orders.push(order);
  save();
  if (db.scenario !== "pending")
    setTimeout(() => settle(order, db.scenario === "declined"), 1200);
  return order;
}
const inFlightOrders = new Map<
  string,
  { body: string; promise: Promise<Order> }
>();
export function createOrder(
  user: Account,
  body: Parameters<typeof createOrderInternal>[1],
  key: string,
) {
  const lock = `${user.profile.id}:${key}`,
    content = JSON.stringify(body),
    pending = inFlightOrders.get(lock);
  if (pending) {
    if (pending.body !== content)
      return Promise.reject(
        new Fault(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Esta tentativa já foi usada com outros dados.",
        ),
      );
    return pending.promise;
  }
  const promise = createOrderInternal(user, body, key);
  inFlightOrders.set(lock, { body: content, promise });
  void promise.finally(() => inFlightOrders.delete(lock)).catch(() => {});
  return promise;
}
export function validateProfile(body: Record<string, unknown>, id: string) {
  const fields: Record<string, string> = {};
  if (
    typeof body.displayName !== "string" ||
    body.displayName.trim().length < 2
  )
    fields.displayName = "Informe ao menos dois caracteres.";
  if (typeof body.username !== "string" || !/^\w{3,24}$/.test(body.username))
    fields.username = "Use de 3 a 24 letras, números ou sublinhado.";
  if (typeof body.email !== "string" || !/^\S+@\S+\.\S+$/.test(body.email))
    fields.email = "Informe um e-mail válido.";
  if (
    db.accounts.some(
      (a) =>
        a.profile.id !== id &&
        (normalizeEmail(a.profile.email) === normalizeEmail(body.email) ||
          a.profile.username === body.username),
    )
  )
    throw new Fault(409, "ACCOUNT_EXISTS", "E-mail ou usuário já cadastrado.");
  if (Object.keys(fields).length)
    throw new Fault(422, "VALIDATION", "Confira os campos indicados.", fields);
}
export function validateWallet(body: Wallet) {
  const fields: Record<string, string> = {};
  for (const field of [
    "displayName",
    "nickname",
    "profileName",
    "referral",
    "ens",
  ] as const)
    if (!body[field]?.trim()) fields[field] = "Campo obrigatório.";
  if (!["Ethereum", "Polygon", "Solana"].includes(body.network))
    fields.network = "Escolha uma rede.";
  if (!["MetaMask", "WalletConnect", "Coinbase Wallet"].includes(body.type))
    fields.type = "Escolha o tipo de carteira.";
  if (
    body.network === "Solana"
      ? !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.address || "")
      : !/^0x[0-9a-fA-F]{40}$/.test(body.address || "")
  )
    fields.address = "Endereço incompatível com a rede simulada.";
  if (!/^\S+@\S+\.\S+$/.test(body.email || ""))
    fields.email = "E-mail inválido.";
  if (!/^[\w.-]+\.eth$/.test(body.ens || ""))
    fields.ens = "Use um nome terminado em .eth.";
  if (Object.keys(fields).length)
    throw new Fault(422, "VALIDATION", "Confira os dados da carteira.", fields);
}
export type { Account, Db };
