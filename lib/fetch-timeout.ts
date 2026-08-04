/**
 * Browser/server fetch with AbortSignal timeout.
 * Prevents endless pending requests that leave spinners / disabled buttons stuck.
 */

export class FetchTimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'FetchTimeoutError';
  }
}

export type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number;
};

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {}
): Promise<Response> {
  const { timeoutMs = 15_000, signal: outerSignal, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  if (outerSignal) {
    if (outerSignal.aborted) controller.abort();
    else outerSignal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new FetchTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
  }
}

/** Race a promise against a timeout (for getSession / non-fetch awaits). */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = 'Operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new FetchTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
