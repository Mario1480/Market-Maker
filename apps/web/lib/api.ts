
const serverApi =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

const browserApi =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  "http://localhost:4000";

const API = typeof window === "undefined" ? serverApi : browserApi;

export class ApiError extends Error {
  status: number;
  payload?: any;

  constructor(message: string, status: number, payload?: any) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: any
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      // ignore
    }

    const msg =
      payload?.error ||
      payload?.message ||
      `${method} ${path} failed (${res.status})`;

    throw new ApiError(msg, res.status, payload);
  }

  return res.json();
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: any): Promise<T> {
  return request<T>("POST", path, body);
}

export function apiPut<T>(path: string, body: any): Promise<T> {
  return request<T>("PUT", path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}
