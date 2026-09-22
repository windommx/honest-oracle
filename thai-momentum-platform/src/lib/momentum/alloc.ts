// ============================================================
// Allocator — แบ่งทุนระหว่าง engine ด้วย HRP บน realized returns
//
// หลักการ: Sharpe ของพอร์ต = f(จำนวน alpha stream ที่ไม่ correlated)
// การเพิ่ม engine ที่ corr กับ core ≈ 0 ดีกว่า leverage engine เดิม 2 เท่าเสมอ
//
// - clusterOrder : quasi-diagonalization (average-linkage + dendrogram LdP)
// - hrpWeights   : recursive bisection บน cov (input = weekly returns ต่อถังจาก events)
// - kellyVec     : Kelly หลายตำแหน่งแบบมี correlation f* = Σ⁻¹μ (หดครึ่ง Kelly)
//
// เปิดใช้จริงเมื่อมี ≥3 engines ผ่าน gate + weekly returns รวม ≥8 สัปดาห์
// (ปรับน้ำหนักรายเดือนจาก weekly returns ใน events เท่านั้น)
// ============================================================

export function clusterOrder(corr: number[][]): number[] {
  const n = corr.length
  if (n === 0) return []
  // distance matrix d = sqrt(0.5(1−ρ))
  const d: number[][] = corr.map((row, i) =>
    row.map((v, j) => {
      const rho = Math.min(1, Math.max(-1, isFinite(v) ? v : 0))
      return i === j ? 0 : Math.sqrt(Math.max(0, 0.5 * (1 - rho)))
    })
  )
  // agglomerative clustering (average linkage, deterministic scan order)
  type Node = { ids: number[]; left?: Node; right?: Node }
  let clusters: Node[] = corr.map((_, i) => ({ ids: [i] }))
  while (clusters.length > 1) {
    let bi = 0
    let bj = 1
    let bd = Infinity
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        let s = 0
        let c = 0
        for (const a of clusters[i].ids)
          for (const b of clusters[j].ids) {
            s += d[a][b]
            c++
          }
        const avg = s / (c || 1)
        if (avg < bd) {
          bd = avg
          bi = i
          bj = j
        }
      }
    const left = clusters[bi]
    const right = clusters[bj]
    clusters = clusters.filter((_, k) => k !== bi && k !== bj)
    clusters.push({ ids: [...left.ids, ...right.ids], left, right })
  }
  // quasi-diagonalization: ขยาย dendrogram ลูกซ้ายก่อนขวา
  const root = clusters[0]
  const order: number[] = []
  const walk = (node: Node): void => {
    if (node.left && node.right) {
      walk(node.left)
      walk(node.right)
    } else order.push(...node.ids)
  }
  walk(root)
  return order
}

const clusterVar = (cov: number[][], ids: number[]): number => {
  const n = ids.length
  let s = 0
  for (const i of ids) for (const j of ids) s += cov[i]?.[j] ?? 0
  return s / (n * n || 1)
}

/** HRP recursive bisection — คืนน้ำหนักผลรวม 1 (หรือ equal ถ้าข้อมูลเสีย) */
export function hrpWeights(cov: number[][], order?: number[]): number[] {
  const n = cov.length
  if (n === 0) return []
  const ord = order ?? clusterOrder(cov.map((row, i) => row.map((v, j) => (i === j ? 1 : isFinite(v) ? v : 0))))
  const w = new Array<number>(n).fill(1)
  const bisect = (ids: number[]): void => {
    if (ids.length <= 1) return
    const half = Math.floor(ids.length / 2)
    const a = ids.slice(0, half)
    const b = ids.slice(half)
    const varA = clusterVar(cov, a)
    const varB = clusterVar(cov, b)
    const alpha = varA + varB > 0 ? 1 - varB / (varA + varB) : 0.5
    for (const i of a) w[i] *= alpha
    for (const i of b) w[i] *= 1 - alpha
    bisect(a)
    bisect(b)
  }
  bisect(ord)
  const tot = w.reduce((s, v) => s + v, 0)
  return tot > 0 ? w.map((x) => x / tot) : new Array<number>(n).fill(1 / n)
}

/** Kelly หลายตำแหน่งแบบมี correlation: f* = 0.5·Σ⁻¹μ (half-Kelly ตามนโยบาย) */
export const kellyVec = (mu: number[], covInv: number[][]): number[] =>
  mu.map((_, i) => 0.5 * (covInv[i] ?? []).reduce((s, row, j) => s + row * (mu[j] ?? 0), 0))
