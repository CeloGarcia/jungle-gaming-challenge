export type Network = "Ethereum" | "Polygon" | "Solana";
export type Edition = "1/1" | "1/10" | "1/50" | "ABERTA";
export interface Nft {
  id: string;
  name: string;
  tokenId: string;
  image: string;
  price: string;
  previousPrice?: string;
  network: Network;
  category: string;
  collection: string;
  editions: Record<Edition, number>;
  version: number;
  rating: number;
  reviews: number;
  rare: boolean;
  trending: boolean;
  created: number;
}
export interface Profile {
  id: string;
  displayName: string;
  username: string;
  email: string;
  ens: string;
  walletNickname: string;
  avatar: string;
}
export interface Wallet {
  id: string;
  primary: boolean;
  displayName: string;
  nickname: string;
  network: Network;
  profileName: string;
  address: string;
  secondary: string;
  type: "MetaMask" | "WalletConnect" | "Coinbase Wallet";
  referral: string;
  email: string;
  ens: string;
}
export interface Session {
  user: Profile;
  token: string;
  expiresAt: number;
}
export interface CartItem {
  id: string;
  nftId: string;
  edition: Edition;
  quantity: number;
  added: number;
  nft: Nft;
}
export interface Cart {
  items: CartItem[];
  revision: number;
  coupon: string;
}
export interface Quote {
  id: string;
  ownerId: string;
  fingerprint: string;
  items: CartItem[];
  subtotal: string;
  discount: string;
  fee: string;
  total: string;
  coupon: string;
  network: Network;
  revision: number;
}
export interface Order {
  id: string;
  ownerId: string;
  status: "pending" | "confirmed" | "declined";
  version: number;
  createdAt: string;
  updatedAt: string;
  transaction: string;
  quote: Quote;
  wallet: Wallet;
  collector: Record<string, string>;
  idempotencyKey: string;
  requestHash: string;
}
export interface CatalogParams {
  q?: string;
  categories?: string;
  networks?: string;
  min?: string;
  max?: string;
  tab?: string;
  sort?: string;
  page?: number;
}
export interface Catalog {
  items: Nft[];
  total: number;
  page: number;
  pages: number;
  facets: {
    categories: Record<string, number>;
    networks: Record<string, number>;
  };
}
export interface ResourceEvent {
  eventId: string;
  resourceId: string;
  version: number;
  ownerId?: string;
  resource: Nft | Order;
}
export interface ApiError {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    retryable?: boolean;
  };
}
export const categories = [
  "Arte digital",
  "Fotografia",
  "Música",
  "Arte 3D",
  "Colecionáveis",
  "Generativa",
  "Jogos",
  "Assinaturas",
  "Utilidade",
];
export const networks: Network[] = ["Ethereum", "Polygon", "Solana"];
export const editions: Edition[] = ["1/1", "1/10", "1/50", "ABERTA"];
const WEI = 10n ** 18n;
export function wei(value: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(value))
    throw new Error("Valor decimal inválido");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * WEI + BigInt(fraction.padEnd(18, "0"));
}
export function eth(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const fraction = (abs % WEI).toString().padStart(18, "0").replace(/0+$/, "");
  return `${sign}${abs / WEI}${fraction ? `.${fraction}` : ""}`;
}
export function money(value: string) {
  return `${value} ETH`;
}
export function shortAddress(value: string) {
  return value.length > 18 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
