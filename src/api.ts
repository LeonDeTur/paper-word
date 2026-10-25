export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const form = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "X-Paperword": "1",
      ...(!form && options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
export const json = (value: unknown) => JSON.stringify(value);
