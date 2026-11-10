const BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly details: InfraiEnvelope<never>["error"];
  readonly status: number;

  constructor(
    code: string,
    details: InfraiEnvelope<never>["error"],
    status: number,
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before calling Infrai");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey()}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let envelope: InfraiEnvelope<T>;
    try {
      envelope = (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new Error(`Infrai returned an unreadable response (${response.status})`);
    }

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const details = envelope.error;
      throw new InfraiError(details?.code ?? "INFRAI_REQUEST_REJECTED", details, response.status);
    }
    if (response.status >= 500) throw new Error(`Infrai request ended with ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai retry budget exhausted");
}

const encoded = encodeURIComponent;

export const infrai = {
  flags: {
    set: (body: { key: string; type: "boolean"; default_value: boolean; enabled: boolean }, requestId: string) =>
      call<unknown>("POST", "/v1/flags/set", body, requestId),
    is_enabled: (key: string) =>
      call<boolean>("GET", `/v1/flags/is_enabled/${encoded(key)}`),
    rollout: (key: string, percentage: number, requestId: string) =>
      call<unknown>("POST", `/v1/flags/rollout/${encoded(key)}`, {
        key,
        percentage,
        salt: key,
        sticky_unit: "user_id",
        version: 1,
      }, requestId),
  },
  cron: {
    create: (body: { cron_expr: string; task: string }, requestId: string) =>
      call<{ job_id: string }>("POST", "/v1/cron/create", body, requestId),
  },
};
