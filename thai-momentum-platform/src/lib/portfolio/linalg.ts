// ============================================================
// Minimal linear-algebra toolkit — pure TypeScript, no deps
// (Task 7-2-b, backend-allocation)
//
// เมทริกซ์ในระบบนี้มีขนาด ≤ 30×30 (จำนวนหุ้นในพอร์ตมีเพดาน ~12 ตัว)
// จึงใช้ Gaussian elimination ตรง ๆ ได้ทันทีโดยไม่ต้องพึ่ง library
// ทุกฟังก์ชัน typed number[][] และไม่มีสถานะร่วม (pure)
// ============================================================

/** A^T */
export function transpose(A: number[][]): number[][] {
  const m = A.length
  const n = m > 0 ? A[0].length : 0
  const T: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0))
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) T[j][i] = A[i][j]
  }
  return T
}

/** C = A·B (ใช้ ikj loop order เพื่อ cache-friendliness) */
export function matmul(A: number[][], B: number[][]): number[][] {
  const m = A.length
  const k = B.length
  if (m === 0 || k === 0 || A[0].length !== k) return []
  const n = B[0].length
  const C: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < m; i++) {
    for (let p = 0; p < k; p++) {
      const a = A[i][p]
      if (a === 0) continue
      const Bp = B[p]
      const Ci = C[i]
      for (let j = 0; j < n; j++) Ci[j] += a * Bp[j]
    }
  }
  return C
}

/** y = A·x */
export function matvec(A: number[][], x: number[]): number[] {
  const m = A.length
  const y = new Array<number>(m).fill(0)
  for (let i = 0; i < m; i++) {
    let s = 0
    const row = A[i]
    for (let j = 0; j < row.length; j++) s += row[j] * (x[j] ?? 0)
    y[i] = s
  }
  return y
}

/** เมทริกซ์เอกลักษณ์ n×n */
export function identity(n: number): number[][] {
  const I: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) I[i][i] = 1
  return I
}

/**
 * แก้ระบบ A·x = b ด้วย Gaussian elimination + partial pivoting
 * คืน x เมื่อสำเร็จ, null เมื่อ A ใกล้ singular (pivot เล็กกว่าเกณฑ์สัมพัทธ์)
 */
export function solveLinear(Ain: number[][], b: number[]): number[] | null {
  const n = Ain.length
  if (n === 0) return []
  if (b.length !== n) return null

  // deep copy กันผลข้างเคียง
  const A = Ain.map((r) => r.slice())
  const x = b.slice()

  // เกณฑ์ singular แบบสัมพัทธ์กับขนาดของเมทริกซ์ (รองรับ cov ที่ scale เล็กมาก)
  let scale = 0
  for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v))
  if (scale === 0) return null
  const eps = 1e-12 * scale

  // forward elimination พร้อม partial pivoting
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
    }
    if (Math.abs(A[piv][col]) <= eps) return null // singular
    if (piv !== col) {
      const tA = A[col]
      A[col] = A[piv]
      A[piv] = tA
      const tx = x[col]
      x[col] = x[piv]
      x[piv] = tx
    }
    const invPivot = 1 / A[col][col]
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] * invPivot
      if (f === 0) continue
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c]
      x[r] -= f * x[col]
    }
  }

  // back substitution
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r]
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]
    x[r] = s / A[r][r]
  }
  return x
}

/**
 * A⁻¹ ผ่าน solveLinear ทีละคอลัมน์กับเวกเตอร์ identity
 * (n ≤ 30 จึงไม่จำเป็นต้อง LU decomposition แบบ reuse)
 * คืน null เมื่อ A singular
 */
export function invert(A: number[][]): number[][] | null {
  const n = A.length
  if (n === 0) return []
  for (const row of A) if (row.length !== n) return null
  const cols: number[][] = []
  const I = identity(n)
  for (let j = 0; j < n; j++) {
    const col = solveLinear(A, I.map((r) => r[j]))
    if (col === null) return null
    cols.push(col)
  }
  // cols[j] = คอลัมน์ที่ j ของ A⁻¹ → stack กลับเป็นแถว
  return transpose(cols)
}
