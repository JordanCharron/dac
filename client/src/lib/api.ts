export interface ApiError extends Error {
  status: number;
  body: any;
}

let actingClientId: number | null = null;
export function setActingClientId(id: number | null) {
  actingClientId = id;
}
export function getActingClientId() {
  return actingClientId;
}

export async function api<T = any>(
  path: string,
  options: RequestInit & { json?: any; form?: FormData } = {},
): Promise<T> {
  const { json, form, headers, ...rest } = options;
  const init: RequestInit = { credentials: 'include', ...rest, headers: { ...headers } };
  if (actingClientId != null) {
    (init.headers as Record<string, string>)['X-Acting-As-Client-Id'] = String(actingClientId);
  }
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.method = init.method ?? 'POST';
  } else if (form !== undefined) {
    init.body = form;
    init.method = init.method ?? 'POST';
  }
  const res = await fetch(path, init);
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(`api_error_${res.status}`) as ApiError;
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}

export const apiGet = <T = any>(p: string) => api<T>(p);
export const apiPost = <T = any>(p: string, body?: any) => api<T>(p, { method: 'POST', json: body ?? {} });
export const apiPatch = <T = any>(p: string, body?: any) => api<T>(p, { method: 'PATCH', json: body ?? {} });
export const apiPut = <T = any>(p: string, body?: any) => api<T>(p, { method: 'PUT', json: body ?? {} });
export const apiDelete = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });
