/**
 * scripts/lib/mini-p-limit.ts  —  v1.0.0
 *
 * Minimale p-limit-Implementation (kompakt, kein externer Dep).
 * Pattern: pLimit(concurrency) liefert (fn) => Promise, das nur N fn-Aufrufe parallel laufen laesst.
 *
 * @param concurrency Max gleichzeitige Aufrufe.
 * @returns Limit function that wraps async tasks.
 */

export function pLimit<T>(concurrency: number): (fn: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`[mini-p-limit] concurrency must be a positive integer, got ${concurrency}`);
  }
  let active = 0;
  const queue: Array<{
    fn: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
  }> = [];

  function next(): void {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift()!;
    fn()
      .then((v: T) => { resolve(v); })
      .catch((e: unknown) => { reject(e); })
      .finally(() => {
        active -= 1;
        next();
      });
  }

  return function limit(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}
