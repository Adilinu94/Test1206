/**
 * scripts/lib/mini-p-limit.js  —  v1.0.0
 *
 * Minimale p-limit-Implementation (kompakt, kein externer Dep).
 * Pattern: pLimit(concurrency) liefert (fn) => Promise, das nur N fn-Aufrufe parallel laufen laesst.
 *
 * @param {number} concurrency Max gleichzeitige Aufrufe.
 * @returns {(fn: () => Promise<T>) => Promise<T>}
 */
export function pLimit(concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`[mini-p-limit] concurrency must be a positive integer, got ${concurrency}`);
  }
  let active = 0;
  const queue = [];

  function next() {
    if (active >= concurrency || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then((v) => { resolve(v); })
      .catch((e) => { reject(e); })
      .finally(() => {
        active -= 1;
        next();
      });
  }

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}
