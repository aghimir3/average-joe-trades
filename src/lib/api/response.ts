import { NextResponse } from 'next/server';

type Primitive = string | number | boolean | null | undefined;
type JsonRecord = Record<string, unknown>;

export type ApiSuccess<T> = { data: T };

export type ApiFailure = {
  error: string;
  message: string;
  status: number;
  requestId: string;
  details?: unknown;
};

function defaultErrorCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_CONTENT';
    case 429:
      return 'RATE_LIMITED';
    case 502:
      return 'BAD_GATEWAY';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

function defaultErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Bad request';
    case 401:
      return 'Authentication required';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable content';
    case 429:
      return 'Too many requests';
    case 502:
      return 'Upstream service failure';
    case 503:
      return 'Service unavailable';
    default:
      return 'Internal Server Error';
  }
}

function normalizeErrorCode(value: unknown, status: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return defaultErrorCode(status);
  }

  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function generateRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${Date.now()}-${hex}`;
  }
}

function toHeaderMap(initHeaders: HeadersInit | undefined): Headers {
  return new Headers(initHeaders ?? {});
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSuccessData(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }

  const keys = Object.keys(body);

  if (keys.length === 1 && keys[0] === 'data') {
    return body.data;
  }

  if (!keys.includes('data')) {
    return body;
  }

  const { data, ...extra } = body;

  if (Object.keys(extra).length === 0) {
    return data;
  }

  if (isRecord(data)) {
    return { ...data, ...extra };
  }

  // When data is a non-record (e.g., array), return the original body as-is.
  // The compatibility mode in apiJson will spread body onto the payload,
  // overwriting payload.data with body.data (the array) and preserving sibling keys.
  return body;
}

function normalizeFailure(body: unknown, status: number): Omit<ApiFailure, 'requestId'> {
  if (!isRecord(body)) {
    return {
      error: defaultErrorCode(status),
      message: typeof body === 'string' ? body : defaultErrorMessage(status),
      status,
    };
  }

  const error = normalizeErrorCode(body.error, status);
  const message =
    typeof body.message === 'string' && body.message.trim().length > 0
      ? body.message
      : typeof body.error === 'string' && body.error.trim().length > 0
        ? body.error
        : defaultErrorMessage(status);

  const details = body.details;

  return details === undefined
    ? { error, message, status }
    : {
        error,
        message,
        status,
        details,
      };
}

function setErrorHeaders(status: number, headers: Headers): void {
  if (status === 401 && !headers.has('WWW-Authenticate')) {
    headers.set('WWW-Authenticate', 'Bearer');
  }
}

/**
 * Standard JSON response helper for API routes.
 * - Success: always `{ data }` for body-bearing 2xx responses
 * - Errors: always `{ error, message, status, requestId, details? }`
 * - Adds `X-Request-Id` on every response
 */
export function apiJson(body: unknown, init?: ResponseInit): NextResponse {
  const status = init?.status ?? 200;
  const headers = toHeaderMap(init?.headers);
  const requestId = headers.get('X-Request-Id') ?? generateRequestId();

  headers.set('X-Request-Id', requestId);

  if (status === 204) {
    return new NextResponse(null, { status: 204, headers });
  }

  if (status >= 200 && status < 300) {
    const normalized = normalizeSuccessData(body);
    const payload: ApiSuccess<unknown> & JsonRecord = { data: normalized };

    // Temporary compatibility mode:
    // expose legacy top-level fields while clients migrate to `data`.
    if (isRecord(normalized)) {
      Object.assign(payload, normalized);
    }

    return NextResponse.json(payload, { status, headers });
  }

  setErrorHeaders(status, headers);

  const normalized = normalizeFailure(body, status);
  const payload: ApiFailure = {
    ...normalized,
    requestId,
  };

  return NextResponse.json<ApiFailure>(payload, { status, headers });
}

export function apiNoContent(init?: Omit<ResponseInit, 'status'>): NextResponse {
  return apiJson(null, { ...(init ?? {}), status: 204 });
}

export function apiOk<T>(data: T, init?: Omit<ResponseInit, 'status'>): NextResponse {
  return apiJson({ data }, { ...(init ?? {}), status: 200 });
}

export function apiCreated<T>(
  data: T,
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiJson({ data }, { ...(init ?? {}), status: 201 });
}

export function apiAccepted<T>(
  data: T,
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiJson({ data }, { ...(init ?? {}), status: 202 });
}

export function apiError(
  error: string,
  message: string,
  status: number,
  details?: unknown,
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiJson(
    details === undefined ? { error, message } : { error, message, details },
    { ...(init ?? {}), status }
  );
}

export function apiUnauthorized(
  message = 'Authentication required',
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiError('UNAUTHORIZED', message, 401, undefined, init);
}

export function apiForbidden(
  message = 'Forbidden',
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiError('FORBIDDEN', message, 403, undefined, init);
}

export function apiNotFound(
  message = 'Not found',
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiError('NOT_FOUND', message, 404, undefined, init);
}

export function apiBadRequest(
  message = 'Bad request',
  details?: unknown,
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiError('BAD_REQUEST', message, 400, details, init);
}

export function apiUnprocessable(
  message = 'Unprocessable content',
  details?: unknown,
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiError('UNPROCESSABLE_CONTENT', message, 422, details, init);
}

export function apiRateLimited(
  message = 'Too many requests',
  details?: unknown,
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiError('RATE_LIMITED', message, 429, details, init);
}

export function apiInternalError(
  message = 'Internal Server Error',
  details?: unknown,
  init?: Omit<ResponseInit, 'status'>
): NextResponse {
  return apiError('INTERNAL_SERVER_ERROR', message, 500, details, init);
}

export type ApiScalar = Primitive;
