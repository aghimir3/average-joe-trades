export interface ApiFailure {
  error: string;
  message: string;
  status: number;
  requestId?: string;
  details?: unknown;
}

export interface ApiJsonRecord {
  data?: unknown;
  error?: string;
  message?: string;
  status?: number;
  requestId?: string;
  details?: unknown;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fallbackMessage(status: number): string {
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
      return 'Bad gateway';
    case 503:
      return 'Service unavailable';
    default:
      return 'Request failed';
  }
}

/**
 * Parse API responses using the standardized contract.
 * - Success: returns `{ data, ...compatFields }`
 * - Error: returns `{ error, message, status, requestId?, details? }`
 */
export async function parseApiJson(response: Response): Promise<ApiJsonRecord> {
  if (response.status === 204) {
    return { data: undefined };
  }

  let parsed: unknown = {};
  try {
    parsed = await response.json();
  } catch {
    parsed = {};
  }

  if (response.ok) {
    if (isRecord(parsed) && 'data' in parsed) {
      return parsed;
    }

    return { data: parsed };
  }

  if (!isRecord(parsed)) {
    return {
      error: 'REQUEST_FAILED',
      message: fallbackMessage(response.status),
      status: response.status,
    };
  }

  return {
    error:
      typeof parsed.error === 'string' && parsed.error.trim().length > 0
        ? parsed.error
        : 'REQUEST_FAILED',
    message:
      typeof parsed.message === 'string' && parsed.message.trim().length > 0
        ? parsed.message
        : typeof parsed.error === 'string' && parsed.error.trim().length > 0
          ? parsed.error
          : fallbackMessage(response.status),
    status:
      typeof parsed.status === 'number' && Number.isFinite(parsed.status)
        ? parsed.status
        : response.status,
    requestId: typeof parsed.requestId === 'string' ? parsed.requestId : undefined,
    details: parsed.details,
  };
}

export function apiData<T>(payload: ApiJsonRecord): T {
  return payload.data as T;
}

export function apiDataOr<T>(payload: ApiJsonRecord, fallback: T): T {
  return (payload.data as T | undefined) ?? fallback;
}

export function apiMessage(payload: ApiJsonRecord, fallback: string): string {
  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    return payload.error;
  }

  return fallback;
}
