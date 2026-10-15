import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
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
    cache: "no-store",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
const QUERY_TIMEOUT_MS = 30000;

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT_MS)]);
    let res: Response;
    try {
      res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
        cache: "no-store",
        signal: requestSignal,
      });
    } catch (error) {
      if (!signal.aborted && error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error(`Request ${String(queryKey[0])} is taking longer than 30 seconds. Try again.`);
      }
      throw error;
    }

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
      refetchOnWindowFocus: true,
      staleTime: 30000, // 30 seconds - data considered fresh
      gcTime: 60000, // 60 seconds - garbage collection time
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.includes("taking longer than 30 seconds")) return false;
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
