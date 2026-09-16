// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Order statistics.                                                       ║
// ║                                                                          ║
// ║  Small, general, and heavily used: the Monte Carlo asks for three         ║
// ║  percentiles at each of up to 400 steps across up to 10,000 simulations.  ║
// ║  Sorting each column to read three values out of it is the obvious        ║
// ║  implementation and the wrong one.                                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function swap(a: Float64Array, i: number, j: number): void {
  const t = a[i]
  a[i] = a[j]
  a[j] = t
}

/**
 * The k-th smallest element, by Hoare selection, in place over [lo, hi].
 *
 * Linear on average where a sort is linearithmic, and — more importantly here
 * — it reuses the buffer instead of allocating a fresh sorted copy per column.
 *
 * The pivot is a median of three. Equity curves across simulations rise
 * together, so the columns arrive nearly sorted, and near-sorted input is
 * exactly what degrades first-element partitioning to O(n²).
 */
export function selectKth(a: Float64Array, k: number, lo = 0, hi = a.length - 1): number {
  if (a.length === 0) return 0
  let l = Math.max(0, lo)
  let h = Math.min(a.length - 1, hi)
  const target = Math.max(l, Math.min(h, k))

  while (l < h) {
    const mid = (l + h) >> 1
    if (a[mid] < a[l]) swap(a, mid, l)
    if (a[h] < a[l]) swap(a, h, l)
    if (a[h] < a[mid]) swap(a, h, mid)
    const pivot = a[mid]

    let i = l
    let j = h
    while (i <= j) {
      while (a[i] < pivot) i++
      while (a[j] > pivot) j--
      if (i <= j) {
        swap(a, i, j)
        i++
        j--
      }
    }
    if (target <= j) h = j
    else if (target >= i) l = i
    else return a[target]
  }
  return a[target]
}

/**
 * Interpolated percentile (p = 0..100) of an unsorted buffer.
 *
 * Mutates the buffer's order, which callers here are fine with — the column is
 * never read again. Matches the linear-interpolation convention used by the
 * rest of the module, so a p50 on an even count is the mean of the middle two
 * rather than an arbitrary one of them.
 */
export function percentileOf(buf: Float64Array, p: number): number {
  const n = buf.length
  if (n === 0) return 0
  if (n === 1) return buf[0]
  const idx = (Math.max(0, Math.min(100, p)) / 100) * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  const a = selectKth(buf, lo)
  if (lo === hi) return a
  // Selecting `lo` leaves everything ≥ it in [lo, n-1], so the next statistic
  // only has to be found within that suffix.
  const b = selectKth(buf, hi, lo, n - 1)
  return a + (b - a) * (idx - lo)
}

/** The same convention, for an array the caller has already sorted ascending. */
export function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const idx = (Math.max(0, Math.min(100, p)) / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}
