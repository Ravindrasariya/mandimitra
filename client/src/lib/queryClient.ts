import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Error thrown for any non-2xx response. Carries the server's machine-readable `code` and
 * `params` alongside the English `message` so the caller can render a translated sentence
 * instead of the hardcoded English one. Falls back to `message` when no code is sent.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  params?: Record<string, string | number>;

  constructor(message: string, status: number, code?: string, params?: Record<string, string | number>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message = text;
    let code: string | undefined;
    let params: Record<string, string | number> | undefined;
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
      if (typeof json.code === "string") code = json.code;
      if (json.params && typeof json.params === "object") params = json.params;
    } catch {}
    throw new ApiError(message, res.status, code, params);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
