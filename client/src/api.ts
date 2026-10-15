export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as any).error || `Error ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => req<T>("GET", `/api${url}`),
  post: <T>(url: string, body?: unknown) => req<T>("POST", `/api${url}`, body ?? {}),
  put: <T>(url: string, body?: unknown) => req<T>("PUT", `/api${url}`, body ?? {}),
  del: <T>(url: string) => req<T>("DELETE", `/api${url}`),
};

export function subscribe(onEvent: (topic: string) => void): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let retry: number | undefined;
  const open = () => {
    es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data).topic);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es?.close();
      if (!closed) retry = window.setTimeout(open, 3000);
    };
  };
  open();
  return () => {
    closed = true;
    es?.close();
    if (retry) clearTimeout(retry);
  };
}
