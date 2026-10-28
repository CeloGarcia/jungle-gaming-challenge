import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Eye,
  EyeOff,
  Heart,
  Home as HomeIcon,
  Layers,
  LogOut,
  Menu,
  Minus,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  ShoppingCart,
  User,
  Wallet as WalletIcon,
  X,
  ZoomIn,
} from "lucide-react";
import { api, errorMessage, fieldErrors, queryClient, setSession } from "./api";
import { categories, editions, eth, money, networks, wei } from "./domain";
import type {
  Cart,
  Catalog,
  CatalogParams,
  Edition,
  Nft,
  Order,
  ResourceEvent,
  Session,
} from "./domain";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
const NoticeContext = createContext<(message: string) => void>(() => {});

const SessionContext = createContext<Session | null>(null);

function useSession() {
  return useContext(SessionContext);
}

function useMobile() {
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width:600px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(max-width:600px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

function useNotice() {
  return useContext(NoticeContext);
}

function useOwner() {
  return useSession()?.user.id || "visitor";
}

function useResource<T>(path: string, key: unknown[], enabled = true) {
  return useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => (await api.get<T>(path, { signal })).data,
    enabled,
  });
}

function useAction() {
  const notify = useNotice();
  return useMutation({
    mutationFn: async ({
      method = "post",
      path,
      body,
      headers,
    }: {
      method?: string;
      path: string;
      body?: unknown;
      headers?: Record<string, string>;
    }) => (await api.request({ url: path, method, data: body, headers })).data,
    onError: (error) => notify(errorMessage(error)),
  });
}

function useCart() {
  const owner = useOwner();
  return useResource<Cart>("/cart", ["cart", owner]);
}

function invalidate() {
  void queryClient.invalidateQueries();
}

function Aux({ children }: { children: ReactNode }) {
  const notify = useNotice();
  return (
    <button
      type="button"
      className="aux"
      onClick={() =>
        notify(
          "Esta seção não faz parte desta demonstração. Nenhuma operação foi realizada.",
        )
      }
    >
      {children}
    </button>
  );
}

function Skeleton({ detail = false }: { detail?: boolean }) {
  return (
    <div
      aria-label="Carregando conteúdo"
      role="status"
      className={detail ? "skeleton-detail" : "skeleton-grid"}
    >
      {Array.from({ length: detail ? 2 : 6 }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="state-box" role="alert">
      <h2>Não foi possível carregar</h2>
      <p>{errorMessage(error)}</p>
      <Button onClick={retry}>Tentar novamente</Button>
    </div>
  );
}

function Empty({
  title = "Nenhum NFT encontrado",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state-box">
      <Layers size={36} />
      <h2>{title}</h2>
      {children || <p>Experimente outra busca ou remova os filtros.</p>}
    </div>
  );
}

function Breadcrumb({ label }: { label: string }) {
  return (
    <nav className="breadcrumb" aria-label="Navegação estrutural">
      <Link to="/">Início</Link> / <Link to="/">Mercado</Link> /{" "}
      <span>{label}</span>
    </nav>
  );
}

function Realtime({ token }: { token: string | null }) {
  const notify = useNotice();
  useEffect(() => {
    let active = true;
    const versions = new Map<string, number>();
    const socket = io(location.origin, {
      transports: ["websocket"],
      query: token ? { token } : {},
      reconnectionDelay: 500,
      forceNew: true,
    });
    const handle = (kind: string) => (event: ResourceEvent) => {
      if (!active || token !== localStorage.getItem("kurio.token")) return;
      const key = `${kind}:${event.resourceId}`;
      if (event.version <= (versions.get(key) || 0)) return;
      versions.set(key, event.version);
      if (kind === "nft") {
        notify(
          "Preço ou disponibilidade de um NFT mudou. Confira os valores atualizados antes de comprar.",
        );
      } else {
        notify(
          (event.resource as Order).status === "confirmed"
            ? "Pedido confirmado pela simulação."
            : "Estado do pedido atualizado.",
        );
      }
      invalidate();
    };
    socket.on("connect", () => {
      if (active) invalidate();
    });
    socket.on("nft.updated", handle("nft"));
    socket.on("order.updated", handle("order"));
    socket.on("demo.pong", () => {
      document.documentElement.dataset.socket = "connected";
    });
    socket.on("connect", () => socket.emit("demo.ping"));
    socket.on("disconnect", () => {
      delete document.documentElement.dataset.socket;
    });
    const disconnect = () => socket.disconnect();
    const reconnect = () => socket.connect();
    window.addEventListener("kurio:disconnect", disconnect);
    window.addEventListener("kurio:reconnect", reconnect);
    return () => {
      active = false;
      socket.removeAllListeners();
      socket.disconnect();
      window.removeEventListener("kurio:disconnect", disconnect);
      window.removeEventListener("kurio:reconnect", reconnect);
      delete document.documentElement.dataset.socket;
    };
  }, [token, notify]);
  return null;
}

export default function App() {
  const [message, setMessage] = useState(""),
    [epoch, setEpoch] = useState(0);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const token = localStorage.getItem("kurio.token");
  const session = useResource<Session>(
    "/session",
    ["session", token, epoch],
    !!token,
  );
  const noticeRef = useRef((text: string) => setMessage(text));
  useEffect(() => {
    const changed = () => setEpoch((v) => v + 1);
    const expired = () => {
      void queryClient.cancelQueries();
      queryClient.clear();
      setEpoch((v) => v + 1);
      setMessage("Sua sessão expirou. Entre novamente para retomar.");
      void navigate({
        to: "/login",
        search: { redirect: location.pathname + location.search },
      });
    };
    window.addEventListener("kurio:session", changed);
    window.addEventListener("kurio:expired", expired);
    return () => {
      window.removeEventListener("kurio:session", changed);
      window.removeEventListener("kurio:expired", expired);
    };
  }, [navigate]);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = pathname.startsWith("/nft/")
      ? "NFT — KURIO"
      : pathname === "/"
        ? "KURIO — Arte e cultura digital"
        : `${pathname.split("/")[1]} — KURIO`;
  }, [pathname]);
  const auth = pathname === "/login" || pathname === "/register";
  const privateView =
    ["/checkout", "/profile", "/wallets", "/favorites"].includes(pathname) ||
    pathname.startsWith("/orders/");
  return (
    <NoticeContext.Provider value={noticeRef.current}>
      <SessionContext.Provider value={session.data || null}>
        <a href="#main" className="skip-link">
          Ir para o conteúdo
        </a>
        <Realtime token={token} />
        <Header />
        <main id="main" className="page" tabIndex={-1}>
          {privateView && !session.data ? (
            <Skeleton detail />
          ) : pathname === "/" ? (
            <Home />
          ) : pathname.startsWith("/nft/") ? (
            <Detail id={decodeURIComponent(pathname.slice(5))} />
          ) : pathname === "/cart" ? (
            <Empty title="Esta funcionalidade será adicionada na próxima etapa" />
          ) : pathname === "/checkout" ? (
            <Empty title="Esta funcionalidade será adicionada na próxima etapa" />
          ) : pathname.startsWith("/orders/") ? (
            <Empty title="Esta funcionalidade será adicionada na próxima etapa" />
          ) : pathname === "/profile" ? (
            <Empty title="Esta funcionalidade será adicionada na próxima etapa" />
          ) : pathname === "/wallets" ? (
            <Empty title="Esta funcionalidade será adicionada na próxima etapa" />
          ) : pathname === "/favorites" ? (
            <Favorites />
          ) : auth ? (
            <>
              <div className="auth-background">
                <Home />
              </div>
              <Auth register={pathname === "/register"} />
            </>
          ) : (
            <Empty title="Página não encontrada">
              <Link to="/">Voltar ao início</Link>
            </Empty>
          )}
        </main>
        {!["/profile", "/wallets"].includes(pathname) && !auth && <Footer />}
        <BottomNav />
        {message && (
          <div className="toast" role="status" aria-live="polite">
            <span>{message}</span>
            <button aria-label="Fechar aviso" onClick={() => setMessage("")}>
              <X size={18} />
            </button>
          </div>
        )}
        <DemoPanel />
      </SessionContext.Provider>
    </NoticeContext.Provider>
  );
}

function Header() {
  const session = useSession(),
    cart = useCart();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [search, setSearch] = useState(false),
    [q, setQ] = useState("");
  const navigate = useNavigate();
  const market =
    ["/cart", "/checkout"].includes(path) ||
    path.startsWith("/nft/") ||
    path.startsWith("/orders/");
  return (
    <header className={`header ${market ? "" : "with-divider"}`}>
      <Link to="/" className="wordmark">
        KURIO
      </Link>
      <nav className="desktop-nav" aria-label="Navegação principal">
        <Link
          to="/"
          activeProps={{ className: "" }}
          className={!market ? "active" : ""}
        >
          Início
        </Link>
        <Link
          to="/"
          activeProps={{ className: "" }}
          className={market ? "active" : ""}
        >
          Mercado
        </Link>
        <Aux>Criadores</Aux>
        <Aux>Aprenda</Aux>
      </nav>
      <div className="header-actions">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir busca"
          onClick={() => setSearch(!search)}
        >
          <img src="/assets/imgSearchIcon.svg" alt="" />
        </Button>
        <Link
          className="cart-link"
          to="/cart"
          aria-label={`Carrinho, ${cart.data?.items.reduce((n, i) => n + i.quantity, 0) || 0} itens`}
        >
          <img src="/assets/imgCartIcon.svg" alt="" />
          <span>
            {cart.data?.items.reduce((n, i) => n + i.quantity, 0) || 0}
          </span>
        </Link>
        <Button asChild size="sm">
          <Link to={session ? "/profile" : "/login"}>
            {session ? (
              <User size={16} />
            ) : (
              <img src="/assets/imgLogout.svg" alt="" />
            )}
            <span>{session ? "Meu perfil" : "Entrar"}</span>
          </Link>
        </Button>
      </div>
      {search && (
        <form
          className="header-search"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ to: "/", search: { q, page: 1 } });
            setSearch(false);
          }}
        >
          <label htmlFor="header-q" className="sr-only">
            Buscar NFTs
          </label>
          <input
            id="header-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar arte e coleções"
            autoFocus
          />
          <Button type="submit">Buscar</Button>
        </form>
      )}
    </header>
  );
}

function BottomNav() {
  const session = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!["/", "/profile", "/wallets", "/favorites"].includes(pathname))
    return null;
  return (
    <nav className="bottom-nav" aria-label="Navegação mobile">
      <Link to="/" aria-label="Início">
        <HomeIcon />
      </Link>
      <Link to="/favorites" aria-label="Favoritos">
        <Heart />
      </Link>
      <Link
        to="/"
        search={{ tab: "new" }}
        className="central-button"
        aria-label="Explorar novos lançamentos"
      >
        <Plus />
      </Link>
      <Link to="/cart" aria-label="Carrinho">
        <ShoppingBag />
      </Link>
      <Link to={session ? "/profile" : "/login"} aria-label="Minha conta">
        <User />
      </Link>
    </nav>
  );
}

function FavoriteButton({ nft }: { nft: Nft }) {
  const session = useSession(),
    owner = useOwner(),
    notify = useNotice(),
    navigate = useNavigate();
  const key = ["favorites", owner];
  const favorites = useResource<string[]>("/favorites", key, !!session);
  const selected = favorites.data?.includes(nft.id) || false;
  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) await api.put(`/favorites/${nft.id}`);
      else await api.delete(`/favorites/${nft.id}`);
    },
    onMutate: async (next: boolean) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<string[]>(key);
      queryClient.setQueryData<string[]>(key, (old) =>
        next
          ? [...new Set([...(old || []), nft.id])]
          : (old || []).filter((x) => x !== nft.id),
      );
      return { previous };
    },
    onError: (error, _, ctx) => {
      queryClient.setQueryData(key, ctx?.previous);
      notify(errorMessage(error));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  return (
    <button
      className={`favorite ${selected ? "selected" : ""}`}
      disabled={mutation.isPending}
      aria-label={
        selected ? `Remover ${nft.name} dos favoritos` : `Favoritar ${nft.name}`
      }
      aria-pressed={selected}
      onClick={() => {
        if (!session) {
          void navigate({
            to: "/login",
            search: { redirect: `/nft/${nft.id}` },
          });
          return;
        }
        mutation.mutate(!selected);
      }}
    >
      <Heart size={19} fill={selected ? "currentColor" : "none"} />
    </button>
  );
}

function NftCard({ nft }: { nft: Nft }) {
  return (
    <article className="nft-card">
      <div className="card-art">
        <Link to="/nft/$id" params={{ id: nft.id }}>
          <img
            src={nft.image}
            alt={nft.name}
            width={360}
            height={360}
            loading="lazy"
          />
        </Link>
        <FavoriteButton nft={nft} />
        {nft.rare && <span className="rare">RARO</span>}
      </div>
      <div className="card-caption">
        <Link to="/nft/$id" params={{ id: nft.id }}>
          {nft.name}
        </Link>
        <div>
          <strong>{money(nft.price)}</strong>
          {nft.previousPrice && <del>{money(nft.previousPrice)}</del>}
        </div>
      </div>
    </article>
  );
}

function Filters({
  params,
  onChange,
  facets,
}: {
  params: CatalogParams;
  onChange: (p: Partial<CatalogParams>) => void;
  facets?: Catalog["facets"];
}) {
  const [min, setMin] = useState(params.min || "0.02"),
    [max, setMax] = useState(params.max || "12.30");
  const toggle = (key: "categories" | "networks", value: string) => {
    const items = (params[key] || "").split(",").filter(Boolean);
    onChange({
      [key]: items.includes(value)
        ? items.filter((v) => v !== value).join(",")
        : [...items, value].join(","),
    });
  };
  return (
    <div className="filters">
      <h2>Coleções</h2>
      {categories.map((c) => (
        <label className="filter-row" key={c}>
          <input
            type="checkbox"
            checked={(params.categories || "").split(",").includes(c)}
            onChange={() => toggle("categories", c)}
          />
          <span>{c}</span>
          <span>({facets?.categories[c] || 0})</span>
        </label>
      ))}
      <h2>Faixa de preço</h2>
      <div className="price-inputs">
        <label>
          Mínimo
          <input
            aria-label="Preço mínimo"
            type="number"
            min="0"
            step="0.01"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </label>
        <label>
          Máximo
          <input
            aria-label="Preço máximo"
            type="number"
            min="0"
            step="0.01"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
      </div>
      <p>
        Preço: {min} - {max} ETH
      </p>
      <Button
        size="sm"
        onClick={() => {
          if (Number(min) >= 0 && Number(max) >= Number(min))
            onChange({ min, max });
        }}
      >
        Aplicar
      </Button>
      <h2>Rede</h2>
      {networks.map((n) => (
        <label className="filter-row" key={n}>
          <input
            type="checkbox"
            checked={(params.networks || "").split(",").includes(n)}
            onChange={() => toggle("networks", n)}
          />
          <span>{n}</span>
          <span>({facets?.networks[n] || 0})</span>
        </label>
      ))}
      <Button
        className="clear-filters"
        variant="ghost"
        size="sm"
        onClick={() =>
          onChange({
            categories: "",
            networks: "",
            min: "",
            max: "",
            q: "",
            tab: "all",
          })
        }
      >
        Limpar filtros
      </Button>
    </div>
  );
}

function Home() {
  const params = useRouterState({
    select: (s) => s.location.search,
  }) as CatalogParams;
  const navigate = useNavigate();
  const [filters, setFilters] = useState(false),
    [q, setQ] = useState(params.q || "");
  useEffect(() => setQ(params.q || ""), [params.q]);
  const change = (p: Partial<CatalogParams>) =>
    void navigate({ to: "/", search: { ...params, ...p, page: p.page || 1 } });
  const result = useQuery({
    queryKey: ["catalog", params],
    queryFn: async ({ signal }) =>
      (await api.get<Catalog>("/nfts", { params, signal })).data,
  });
  return (
    <>
      <form
        className="mobile-search"
        onSubmit={(e) => {
          e.preventDefault();
          change({ q });
        }}
      >
        <Search size={20} />
        <input
          aria-label="Explorar coleções"
          placeholder="Explorar coleções"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button
          size="icon"
          variant="ghost"
          type="button"
          aria-label="Abrir filtros"
          onClick={() => setFilters(true)}
        >
          <Settings2 />
        </Button>
        <button className="sr-only">Buscar</button>
      </form>
      <section className="hero">
        <div>
          <p className="eyebrow">Bem-vindo à Kurio</p>
          <h1 className="desktop-hero-title">
            SEJA DONO DO FUTURO
            <br />
            DA ARTE DIGITAL
          </h1>
          <h1 className="mobile-hero-title">
            SEJA DONO DA
            <br />
            CULTURA DIGITAL
          </h1>
          <p className="hero-description">
            Descubra NFTs selecionados de criadores emergentes e consagrados.
            Colecione arte digital rara, apoie artistas e tenha uma parte da
            cultura da internet.
          </p>
          <Button asChild>
            <a href="#catalog">EXPLORAR</a>
          </Button>
          <span className="hero-dots" aria-hidden="true">
            •••
          </span>
        </div>
        <img
          src="/assets/emerald.webp"
          alt="Emerald Ape, arte digital em destaque na Kurio"
          width={450}
          height={450}
          fetchPriority="high"
        />
      </section>
      <section className="market-layout" id="catalog">
        <aside>
          <Filters
            params={params}
            onChange={change}
            facets={result.data?.facets}
          />
          <div className="featured">
            <h3>NFT EM DESTAQUE</h3>
            <strong>OFERTA LIMITADA</strong>
            <img
              src="/assets/sage.webp"
              width={310}
              height={350}
              alt="Colecionável em destaque"
              loading="lazy"
            />
          </div>
        </aside>
        <div className="catalog">
          <div className="catalog-toolbar">
            <div className="catalog-tabs" aria-label="Categorias do catálogo">
              {[
                ["all", "Todos os NFTs"],
                ["new", "Novos lançamentos"],
                ["trending", "Em alta"],
              ].map(([value, label]) => (
                <button
                  aria-pressed={(params.tab || "all") === value}
                  className={(params.tab || "all") === value ? "active" : ""}
                  key={value}
                  onClick={() => change({ tab: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="sort-label">
              Ordenar por:{" "}
              <select
                aria-label="Ordenar NFTs"
                value={params.sort || "recent"}
                onChange={(e) => change({ sort: e.target.value })}
              >
                <option value="recent">Listados recentemente</option>
                <option value="price-asc">Menor preço</option>
                <option value="price-desc">Maior preço</option>
              </select>
            </label>
          </div>
          <form
            className="catalog-search"
            onSubmit={(e) => {
              e.preventDefault();
              change({ q });
            }}
          >
            <input
              aria-label="Buscar NFTs no catálogo"
              placeholder="Buscar NFTs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" size="sm">
              Buscar
            </Button>
          </form>
          {result.isPending ? (
            <Skeleton />
          ) : result.isError ? (
            <Failure error={result.error} retry={() => void result.refetch()} />
          ) : result.data.items.length ? (
            <>
              <div className="nft-grid" aria-busy={result.isFetching}>
                {result.data.items.map((n) => (
                  <NftCard key={n.id} nft={n} />
                ))}
              </div>
              <div className="pagination" aria-label="Paginação">
                {Array.from({ length: result.data.pages }, (_, i) => (
                  <button
                    aria-label={`Página ${i + 1}`}
                    aria-current={
                      result.data.page === i + 1 ? "page" : undefined
                    }
                    key={i}
                    onClick={() => change({ page: i + 1 })}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  aria-label="Próxima página"
                  disabled={result.data.page >= result.data.pages}
                  onClick={() => change({ page: (params.page || 1) + 1 })}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <p className="result-count">
                {result.data.total} NFTs encontrados
                {result.isFetching ? " · Atualizando…" : ""}
              </p>
            </>
          ) : (
            <Empty />
          )}
        </div>
      </section>
      <section className="promotions">
        {[
          [
            "emerald",
            "Lançamentos gênesis de edição limitada",
            "Colecione edições escassas diretamente dos criadores antes da revelação pública.",
          ],
          [
            "neon",
            "Arte digital selecionada e muito mais",
            "Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.",
          ],
        ].map(([image, title, description]) => (
          <article key={image}>
            <img
              src={`/assets/${image}.webp`}
              alt=""
              width={280}
              height={280}
              loading="lazy"
            />
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
              <Button size="sm" asChild>
                <a href="#catalog">
                  Explorar <ArrowRight size={15} />
                </a>
              </Button>
            </div>
          </article>
        ))}
      </section>
      <section className="journal">
        <h2>Diário da Cunhagem</h2>
        <p>
          Histórias, guias e insights para colecionadores sobre o universo da
          propriedade digital.
        </p>
        <div>
          {[
            "Como funciona a propriedade de NFTs",
            "10 artistas digitais para acompanhar",
            "Raridade, atributos e procedência",
            "Como proteger sua carteira",
          ].map((title, i) => (
            <article key={title}>
              <img
                src={`/assets/${["neon", "emerald", "sage", "golden"][i]}.webp`}
                width={280}
                height={200}
                alt=""
                loading="lazy"
              />
              <div>
                <small>
                  {12 + i} de setembro | Leitura de {i + 2} min
                </small>
                <h3>{title}</h3>
                <p>Conheça a cultura digital e colecione com consciência.</p>
                <Aux>Ler mais →</Aux>
              </div>
            </article>
          ))}
        </div>
      </section>
      <Dialog
        open={filters}
        onOpenChange={setFilters}
        title="Filtros do catálogo"
      >
        <Filters
          params={params}
          onChange={change}
          facets={result.data?.facets}
        />
        <Button onClick={() => setFilters(false)}>Ver resultados</Button>
      </Dialog>
    </>
  );
}

function Detail({ id }: { id: string }) {
  const result = useResource<Nft>(`/nfts/${id}`, ["nft", id]);
  const [edition, setEdition] = useState<Edition>("1/50"),
    [quantity, setQuantity] = useState(1),
    [zoom, setZoom] = useState(false),
    [tab, setTab] = useState("details");
  const action = useAction(),
    navigate = useNavigate(),
    notify = useNotice();
  if (result.isPending) return <Skeleton detail />;
  if (result.isError)
    return <Failure error={result.error} retry={() => void result.refetch()} />;
  const n = result.data;
  const add = async (checkout = false) => {
    try {
      await action.mutateAsync({
        path: "/cart/items",
        body: { nftId: n.id, edition, quantity },
      });
      invalidate();
      notify("NFT adicionado ao carrinho.");
      if (checkout) void navigate({ to: "/cart" });
    } catch {
      /* The mutation reports its server error. */
    }
  };
  return (
    <>
      <Link to="/" className="mobile-detail-back">
        <ArrowLeft size={20} />
        Voltar ao mercado
      </Link>
      <Breadcrumb label={n.name} />
      <section className="detail-layout">
        <div className="gallery">
          <div className="thumbnails">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                onClick={() => setZoom(true)}
                aria-label={`Ampliar imagem ${i + 1}`}
              >
                <img src={n.image} alt="" width={90} height={90} />
              </button>
            ))}
          </div>
          <button
            className="detail-art"
            onClick={() => setZoom(true)}
            aria-label="Ampliar arte do NFT"
          >
            <img src={n.image} alt={n.name} width={560} height={560} />
            <ZoomIn />
          </button>
        </div>
        <div className="detail-info">
          <div className="detail-title">
            <h1>{n.name}</h1>
            <FavoriteButton nft={n} />
          </div>
          <strong className="detail-price">{money(n.price)}</strong>
          <p className="rating">
            ★★★★★{" "}
            <span>
              {n.rating} · {n.reviews} avaliações de colecionadores
            </span>
          </p>
          <h2>Sobre este NFT:</h2>
          <p>
            Um colecionável digital finalizado à mão da coleção Kurio Editions,
            verificado na {n.network}, com arte desbloqueável e acesso para
            colecionadores.
          </p>
          <fieldset className="edition-picker">
            <legend>Edição:</legend>
            {editions.map((ed) => (
              <button
                key={ed}
                disabled={!n.editions[ed]}
                aria-pressed={edition === ed}
                className={ed === edition ? "selected" : ""}
                onClick={() => {
                  setEdition(ed);
                  setQuantity(1);
                }}
              >
                {ed}
              </button>
            ))}
          </fieldset>
          <p className="stock">{n.editions[edition]} edições disponíveis</p>
          <div className="purchase-row">
            <Quantity
              value={quantity}
              max={n.editions[edition]}
              onChange={setQuantity}
            />
            <strong className="mobile-purchase-price">
              {money(eth(wei(n.price) * BigInt(quantity)))}
            </strong>
            <Button
              disabled={action.isPending || !n.editions[edition]}
              onClick={() => void add(true)}
            >
              Comprar NFT
            </Button>
            <Button
              variant="outline"
              aria-label="Adicionar ao carrinho"
              disabled={action.isPending || !n.editions[edition]}
              onClick={() => void add()}
            >
              <ShoppingCart />
            </Button>
          </div>
          <dl className="nft-metadata">
            <div>
              <dt>ID do token:</dt>
              <dd>#{n.tokenId}</dd>
            </div>
            <div>
              <dt>Coleção:</dt>
              <dd>{n.collection}</dd>
            </div>
            <div>
              <dt>Atributos:</dt>
              <dd>Óculos, Esmeralda, Raro</dd>
            </div>
          </dl>
          <Button
            variant="ghost"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(location.href)
                .then(() => notify("Link copiado."))
                .catch(() => notify("Não foi possível copiar o link."));
            }}
          >
            Compartilhar este NFT <ArrowRight size={16} />
          </Button>
        </div>
      </section>
      <section className="detail-tabs">
        <div>
          <button
            className={tab === "details" ? "active" : ""}
            onClick={() => setTab("details")}
          >
            Detalhes do NFT
          </button>
          <button
            className={tab === "reviews" ? "active" : ""}
            onClick={() => setTab("reviews")}
          >
            Avaliações de colecionadores ({n.reviews})
          </button>
        </div>
        {tab === "details" ? (
          <>
            <p>
              {n.name} é uma obra digital {edition} finalizada à mão da coleção
              Kurio Editions. Cada atributo fica armazenado nos metadados do
              token. A obra explora identidade, movimento e luz em um mundo
              digital sem fronteiras.
            </p>
            <p>
              A propriedade inclui a arte em alta resolução e lançamentos
              exclusivos para colecionadores. Nesta demonstração nenhuma
              propriedade é transferida em blockchain real.
            </p>
            <dl>
              <dt>Rede:</dt>
              <dd>{n.network} · Simulação local</dd>
              <dt>Contrato:</dt>
              <dd>0x7A42…19E8 · Referência fictícia ERC-721</dd>
              <dt>Direitos autorais:</dt>
              <dd>
                5% nas vendas secundárias, conforme referência ilustrativa.
              </dd>
            </dl>
          </>
        ) : (
          <p>
            ★★★★★ 4.8 · 19 avaliações ilustrativas da coleção. O envio de
            avaliações não integra esta demonstração.
          </p>
        )}
      </section>
      <Recommendations title="Mais desta coleção" />
      <Dialog
        open={zoom}
        onOpenChange={setZoom}
        title={n.name}
        className="image-dialog"
      >
        <img
          src={n.image}
          alt={`Arte ampliada: ${n.name}`}
          width={900}
          height={900}
        />
      </Dialog>
    </>
  );
}

function Quantity({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="quantity">
      <button
        aria-label="Diminuir quantidade"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={14} />
      </button>
      <label className="sr-only" htmlFor={undefined}>
        Quantidade
      </label>
      <input
        aria-label="Quantidade"
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 1 && n <= max) onChange(n);
        }}
      />
      <button
        aria-label="Aumentar quantidade"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function Recommendations({ title }: { title: string }) {
  const result = useResource<Catalog>("/nfts?page=1", ["recommendations"]);
  return (
    <section className="recommendations">
      <h2>{title}</h2>
      <div className="recommend-grid">
        {result.data?.items.slice(3, 6).map((n) => (
          <NftCard key={n.id} nft={n} />
        ))}
      </div>
    </section>
  );
}

type FieldProps = {
  label: string;
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  type?: string;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
};

function Field({
  label,
  name,
  value,
  onChange,
  required = false,
  type = "text",
  error,
  placeholder,
  autoComplete,
  readOnly,
}: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div className="input-wrap">
        <input
          id={name}
          name={name}
          type={type === "password" && show ? "text" : type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          readOnly={readOnly}
          minLength={type === "password" ? 8 : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
        />
        {type === "password" && (
          <button
            type="button"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && (
        <p className="field-error" id={`${name}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function Auth({ register }: { register: boolean }) {
  const mobile = useMobile();
  const navigate = useNavigate(),
    notify = useNotice();
  const search = useRouterState({ select: (s) => s.location.search }) as {
    redirect?: string;
  };
  const [values, setValues] = useState({
    username: "",
    email: "",
    password: "",
    confirmation: "",
  });
  const action = useAction();
  const errors = fieldErrors(action.error);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const session = (await action.mutateAsync({
        path: register ? "/accounts" : "/session",
        body: values,
      })) as Session;
      await setSession(session);
      notify(
        register ? "Perfil criado na simulação." : "Você entrou na Kurio.",
      );
      void navigate({ to: search.redirect || "/" });
    } catch {
      /* Server errors remain associated with the form. */
    }
  };
  const content = (
    <>
      <div className="auth-brand wordmark">KURIO</div>
      <div className="auth-tabs">
        <Link to="/login" search={search} className={!register ? "active" : ""}>
          Entrar
        </Link>
        <Link
          to="/register"
          search={search}
          className={register ? "active" : ""}
        >
          Criar conta
        </Link>
      </div>
      <h1>{register ? "Criar perfil de colecionador" : "Entrar"}</h1>
      <p>
        {register
          ? "Crie seu perfil de colecionador e conecte uma carteira quando quiser."
          : "Entre para gerenciar sua carteira, coleção e perfil de criador."}
      </p>
      <form onSubmit={submit}>
        {register && (
          <Field
            name="username"
            label="Nome de usuário"
            value={values.username}
            onChange={(v) => setValues({ ...values, username: v })}
            required
            autoComplete="username"
            error={errors.username}
          />
        )}
        <Field
          name="email"
          label="E-mail"
          type="email"
          value={values.email}
          onChange={(v) => setValues({ ...values, email: v })}
          required
          autoComplete="email"
          placeholder="contato@email.com"
          error={errors.email}
        />
        <Field
          name="password"
          label="Senha"
          type="password"
          value={values.password}
          onChange={(v) => setValues({ ...values, password: v })}
          required
          autoComplete={register ? "new-password" : "current-password"}
          error={errors.password}
        />
        {register && (
          <Field
            name="confirmation"
            label="Confirmar senha"
            type="password"
            value={values.confirmation}
            onChange={(v) => setValues({ ...values, confirmation: v })}
            required
            autoComplete="new-password"
            error={errors.confirmation}
          />
        )}
        <p className="auth-recovery">
          {!register && <Aux>Esqueceu a senha?</Aux>}
        </p>
        {action.isError && (
          <p className="field-error" role="alert">
            {errorMessage(action.error)}
          </p>
        )}
        <Button type="submit" disabled={action.isPending}>
          {action.isPending ? "Aguarde…" : register ? "Criar perfil" : "Entrar"}
        </Button>
      </form>
      <div className="social-divider">Ou continue com</div>
      <div className="social-buttons">
        <button
          onClick={() =>
            notify(
              "O acesso com Google não está integrado nesta demonstração. Use e-mail e senha.",
            )
          }
        >
          <b>G</b>Continuar com Google
        </button>
        <button
          onClick={() =>
            notify(
              "O acesso com Facebook não está integrado nesta demonstração. Use e-mail e senha.",
            )
          }
        >
          <b>f</b>Continuar com Facebook
        </button>
      </div>
      <p className="auth-switch">
        {register ? "Já tem uma conta?" : "Novo na Kurio?"}{" "}
        <Link to={register ? "/login" : "/register"} search={search}>
          {register ? "Entre" : "Crie uma conta"}
        </Link>
      </p>
      <p className="demo-credentials">
        Demonstração: colecionador@kurio.demo
        <br />
        Senha: Kurio123!
      </p>
    </>
  );
  return (
    <>
      {mobile ? (
        <div className="auth-mobile">{content}</div>
      ) : (
        <div className="auth-desktop">
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) void navigate({ to: "/" });
            }}
            title={register ? "Criar conta" : "Entrar"}
            className="auth-dialog"
          >
            {content}
          </Dialog>
        </div>
      )}
    </>
  );
}

function AccountLayout({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const action = useAction(),
    navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const logout = async () => {
    try {
      await action.mutateAsync({ method: "delete", path: "/session" });
      await setSession(null);
      void navigate({ to: "/" });
    } catch {
      /* Error reported by mutation. */
    }
  };
  return (
    <div className="account-layout">
      <aside>
        <h1>Meu perfil</h1>
        <nav aria-label="Conta do colecionador">
          <Link to="/profile" className={path === "/profile" ? "active" : ""}>
            <User size={18} />
            Dados do perfil
          </Link>
          <Link to="/wallets" className={path === "/wallets" ? "active" : ""}>
            <WalletIcon size={18} />
            Carteiras
          </Link>
          <Aux>Atividade</Aux>
          <Link to="/favorites">
            <Heart size={18} />
            Lista de interesse
          </Link>
          <Aux>Ofertas</Aux>
          <Aux>Arquivos baixados</Aux>
          <Aux>Suporte</Aux>
          <button onClick={() => void logout()}>
            <LogOut size={18} />
            Sair
          </button>
        </nav>
      </aside>
      <section className="account-content">
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function Favorites() {
  const owner = useOwner();
  const favorites = useResource<string[]>("/favorites", ["favorites", owner]);
  const catalog = useResource<Catalog>("/nfts", ["favorites-catalog", owner]);
  return (
    <AccountLayout title="Lista de interesse">
      {favorites.isPending || catalog.isPending ? (
        <Skeleton />
      ) : favorites.isError || catalog.isError ? (
        <Failure
          error={favorites.error || catalog.error}
          retry={() => {
            void favorites.refetch();
            void catalog.refetch();
          }}
        />
      ) : favorites.data.length ? (
        <FavoritesItems ids={favorites.data} />
      ) : (
        <Empty title="Sua lista de interesse está vazia" />
      )}
    </AccountLayout>
  );
}

function FavoritesItems({ ids }: { ids: string[] }) {
  return (
    <div className="nft-grid">
      {ids.map((id) => (
        <FavoriteItem key={id} id={id} />
      ))}
    </div>
  );
}

function FavoriteItem({ id }: { id: string }) {
  const result = useResource<Nft>(`/nfts/${id}`, ["nft", id]);
  return result.data ? (
    <NftCard nft={result.data} />
  ) : (
    <div className="skeleton" />
  );
}

function Footer() {
  return (
    <footer className="footer">
      <section className="footer-features">
        {[
          [
            "W",
            "Segurança da carteira",
            "Proteja sua carteira e colecione arte digital verificada com confiança.",
          ],
          [
            "C",
            "Criadores em destaque",
            "Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.",
          ],
          [
            "D",
            "Alertas de lançamentos",
            "Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.",
          ],
        ].map(([icon, title, text]) => (
          <article key={icon}>
            <b className="medallion">{icon}</b>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
        <div className="newsletter">
          <h2>Antecipe-se ao próximo lançamento</h2>
          <Newsletter />
          <p>
            Receba lançamentos selecionados, histórias de criadores e novidades
            do mercado.
          </p>
        </div>
      </section>
      <section className="brand-band">
        <Link to="/" className="wordmark">
          KURIO
        </Link>
        <p>
          Feito para colecionadores,
          <br />
          criadores e cultura
        </p>
        <Aux>contato@email.com</Aux>
        <Aux>+55 11 4002 8922</Aux>
      </section>
      <section className="footer-links">
        <div>
          <h2>Meu perfil</h2>
          <Link to="/profile">Meu perfil</Link>
          <Aux>Minha coleção</Aux>
          <Aux>Atividade</Aux>
          <Aux>Estúdio do criador</Aux>
          <Link to="/favorites">Lista de interesse</Link>
        </div>
        <div>
          <h2>Central de ajuda</h2>
          {[
            "Central de ajuda",
            "Como comprar NFTs",
            "Carteira e segurança",
            "Política do mercado",
            "Denunciar item",
          ].map((s) => (
            <Aux key={s}>{s}</Aux>
          ))}
        </div>
        <div>
          <h2>Coleções</h2>
          {["Arte digital", "Fotografia", "Música", "Arte 3D", "Utilidade"].map(
            (s) => (
              <Link key={s} to="/" search={{ categories: s }}>
                {s}
              </Link>
            ),
          )}
        </div>
        <div>
          <h2>Redes sociais</h2>
          <div className="social-chips">
            {["f", "X", "in", "◎", "▶"].map((s) => (
              <Aux key={s}>{s}</Aux>
            ))}
          </div>
          <h2>Carteiras compatíveis</h2>
          <p className="wallet-chips">METAMASK • WALLETCONNECT • COINBASE</p>
        </div>
      </section>
      <p className="copyright">© 2026 Kurio. Propriedade digital para todos.</p>
    </footer>
  );
}

function Newsletter() {
  const notify = useNotice();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        notify(
          "A newsletter não está integrada nesta demonstração. Nenhum e-mail foi cadastrado.",
        );
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">
        E-mail para newsletter
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="digite seu e-mail..."
      />
      <Button type="submit" size="sm">
        Enviar
      </Button>
    </form>
  );
}

function DemoPanel() {
  const [open, setOpen] = useState(false);
  const action = useAction();
  const notify = useNotice();
  if (import.meta.env.VITE_ENABLE_MOCKS === "false") return null;
  return (
    <div className="demo-panel">
      <button
        aria-label="Abrir controles de demonstração"
        onClick={() => setOpen(!open)}
      >
        <Menu size={16} /> Demo
      </button>
      {open && (
        <div>
          <h2>Simulação local</h2>
          <p>Nenhuma transação real.</p>
          <label>
            Cenário
            <select
              defaultValue="success"
              onChange={async (e) => {
                await action.mutateAsync({
                  path: "/demo/scenario",
                  body: { scenario: e.target.value },
                });
                invalidate();
                notify(`Cenário ${e.target.value} ativado.`);
              }}
            >
              {[
                "success",
                "empty",
                "slow",
                "variable",
                "out-of-order",
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
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            onClick={async () => {
              await action.mutateAsync({
                path: "/demo/event",
                body: { kind: "nft", id: "nft-1", patch: { price: "1.29" } },
              });
            }}
          >
            Alterar preço via socket
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.dispatchEvent(new Event("kurio:disconnect"))}
          >
            Desconectar socket
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.dispatchEvent(new Event("kurio:reconnect"))}
          >
            Reconectar socket
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await action.mutateAsync({
                path: "/demo/reset",
                body: { scenario: "success" },
              });
              await setSession(null);
              location.assign("/");
            }}
          >
            Restaurar demonstração
          </Button>
        </div>
      )}
    </div>
  );
}
