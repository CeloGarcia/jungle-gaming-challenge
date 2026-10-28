import axios from "axios";
import { QueryClient } from "@tanstack/react-query";
import type { ApiError, Session } from "./domain";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: (count, error) =>
        axios.isAxiosError(error) &&
        !!error.response &&
        error.response.status >= 500 &&
        count < 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
let visitor = localStorage.getItem("kurio.visitor");
if (!visitor) {
  visitor = crypto.randomUUID();
  localStorage.setItem("kurio.visitor", visitor);
}
export const api = axios.create({
  baseURL: "/api",
  timeout: 8000,
  headers: { "x-visitor": visitor },
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kurio.token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem("kurio.token")) {
      localStorage.removeItem("kurio.token");
      window.dispatchEvent(new Event("kurio:expired"));
    }
    return Promise.reject(error);
  },
);
export function errorMessage(error: unknown) {
  return axios.isAxiosError<ApiError>(error)
    ? error.response?.data.error?.message ||
        (error.code === "ECONNABORTED"
          ? "A solicitação demorou demais. Você pode tentar novamente com segurança."
          : "Falha de conexão. Confira a rede e tente novamente.")
    : error instanceof Error
      ? error.message
      : "Não foi possível concluir a ação.";
}
export function fieldErrors(error: unknown) {
  return axios.isAxiosError<ApiError>(error)
    ? error.response?.data.error?.fields || {}
    : {};
}
export async function setSession(session: Session | null) {
  await queryClient.cancelQueries();
  queryClient.clear();
  if (session) localStorage.setItem("kurio.token", session.token);
  else localStorage.removeItem("kurio.token");
  window.dispatchEvent(new Event("kurio:session"));
}
