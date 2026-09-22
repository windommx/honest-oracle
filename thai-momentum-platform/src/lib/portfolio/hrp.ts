// ============================================================
// Hierarchical Risk Parity (López de Prado 2016)
// (Task 7-2-b, backend-allocation)
//
// ทำตาม 4 ขั้นของเอกสาร:
//  1) tree clustering (agglomerative, average linkage) บนระยะ d_ij = sqrt(0.5(1−ρ_ij))
//  2) quasi-diagonalization (จัดลำดับ leaf ให้หุ้นที่ "ใกล้กัน" อยู่ติดกัน)
//  3) recursive bisection แบ่งน้ำหนักตาม inverse-variance variance ของแต่ละฝั่ง
//  4) ตัดต้นไม้เพื่อโชว์ cluster
//
// หมายเหตุ HRP เป็น scale-invariant ต่อ scalar ตัวคูณของ covariance
// (corr กับ inverse-variance weight ไม่เปลี่ยน) จึงป้อน daily cov ตรง ๆ ได้
// ============================================================

export interface HrpResult {
  weights: number[] // ผลรวม = 1
  order: number[] // ลำดับ leaf หลัง quasi-diagonalization (asset index)
  clusters: number[][] // partition ของ asset index เพื่อการแสดงผล
}

// โหนดของ dendrogram: leaf id = asset index (< n), merge id = n + ลำดับการ merge
interface MergeNode {
  id: number
  left: number
  right: number
  dist: number // average-linkage distance ตอน merge
  members: number[]
}

/** ระยะ average linkage ระหว่างสอง cluster = ค่าเฉลี่ย pairwise distance ทั้งหมด */
function avgLinkage(d: number[][], a: number[], b: number[]): number {
  let sum = 0
  for (const i of a) {
    for (const j of b) sum += d[i][j]
  }
  return sum / (a.length * b.length)
}

/** ความแปรปรวนของ cluster ย่อย ด้วย inverse-variance weights ที่ normalize เป็น 1 */
function clusterVariance(cov: number[][], idxs: number[]): number {
  let invSum = 0
  const iv = idxs.map((i) => {
    const v = cov[i][i] > 0 ? 1 / cov[i][i] : 0
    invSum += v
    return v
  })
  // ถ้า variance ทุกตัวเป็น 0 (ราคานิ่งหมด) → ใช้ equal weight กันหารศูนย์
  const w = invSum > 0 ? iv.map((v) => v / invSum) : idxs.map(() => 1 / idxs.length)
  let acc = 0
  for (let a = 0; a < idxs.length; a++) {
    for (let b = 0; b < idxs.length; b++) acc += w[a] * cov[idxs[a]][idxs[b]] * w[b]
  }
  return acc
}

/**
 * รัน HRP จาก covariance matrix (หน่วยใดก็ได้ — scale-invariant)
 * คืน null เมื่อ input ไม่ถูกต้อง (ไม่สี่เหลี่ยม / มี NaN)
 */
export function runHRP(cov: number[][]): HrpResult | null {
  const n = cov.length
  if (n === 0) return null
  for (const row of cov) {
    if (row.length !== n) return null
    for (const v of row) if (!isFinite(v)) return null
  }
  if (n === 1) return { weights: [1], order: [0], clusters: [[0]] }

  // ---- ขั้น 1: correlation จาก covariance (variance = 0 → ρ = 0) ----
  const corr: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    corr[i][i] = 1
    for (let j = i + 1; j < n; j++) {
      const di = cov[i][i]
      const dj = cov[j][j]
      const raw = di > 0 && dj > 0 ? cov[i][j] / Math.sqrt(di * dj) : 0
      const r = Math.max(-1, Math.min(1, raw)) // clamp กัน float noise
      corr[i][j] = r
      corr[j][i] = r
    }
  }

  // ---- ขั้น 2: distance matrix d_ij = sqrt(0.5·(1−ρ_ij)) ----
  const d: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dij = Math.sqrt(Math.max(0, 0.5 * (1 - corr[i][j])))
      d[i][j] = dij
      d[j][i] = dij
    }
  }

  // ---- ขั้น 3: agglomerative hierarchical clustering, average linkage ----
  // เริ่มจากทุกหุ้นเป็น cluster ตัวเอง แล้ว merge คู่ที่มีระยะเฉลี่ยน้อยสุด
  // จนเหลือ cluster เดียว — tie-break ตามลำดับการสแกน (deterministic)
  const merges: MergeNode[] = []
  let active: { id: number; members: number[] }[] = Array.from({ length: n }, (_, i) => ({
    id: i,
    members: [i],
  }))
  while (active.length > 1) {
    let bi = 0
    let bj = 1
    let best = Infinity
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        const dist = avgLinkage(d, active[a].members, active[b].members)
        if (dist < best) {
          best = dist
          bi = a
          bj = b
        }
      }
    }
    const A = active[bi]
    const B = active[bj]
    const node: MergeNode = {
      id: n + merges.length,
      left: A.id,
      right: B.id,
      dist: best,
      members: [...A.members, ...B.members],
    }
    merges.push(node)
    active = active.filter((_, k) => k !== bi && k !== bj)
    active.push({ id: node.id, members: node.members })
  }
  const rootId = merges[merges.length - 1].id

  // ---- ขั้น 4: quasi-diagonalization — ขยาย dendrogram เป็นลำดับ leaf
  // (deterministic: ลูกซ้ายก่อนลูกขวา ตามลำดับที่บันทึกไว้ตอน merge) ----
  const byId = new Map<number, MergeNode>()
  for (const m of merges) byId.set(m.id, m)
  const order: number[] = []
  const expand = (id: number): void => {
    const m = byId.get(id)
    if (!m) {
      order.push(id) // leaf
      return
    }
    expand(m.left)
    expand(m.right)
  }
  expand(rootId)

  // ---- ขั้น 5: recursive bisection บน seriated list ----
  // แบ่งครึ่งที่ midpoint ของลำดับ (bisection แบบ simplified มาตรฐานของ HRP)
  const weights = new Array<number>(n).fill(0)
  const bisect = (items: number[], wgt: number): void => {
    if (items.length === 1) {
      weights[items[0]] += wgt
      return
    }
    const mid = Math.floor(items.length / 2)
    const left = items.slice(0, mid)
    const right = items.slice(mid)
    const vl = clusterVariance(cov, left)
    const vr = clusterVariance(cov, right)
    const tot = vl + vr
    // V รวมเป็น 0 (ทุกหุ้นนิ่ง) → แบ่งครึ่ง 50/50
    const alpha = tot > 0 ? 1 - vl / tot : 0.5
    bisect(left, wgt * alpha)
    bisect(right, wgt * (1 - alpha))
  }
  bisect(order, 1)

  // เก็บกวาด float: clamp ≥ 0 แล้ว normalize ให้รวม = 1
  let sum = 0
  for (let i = 0; i < n; i++) {
    weights[i] = Math.max(0, weights[i])
    sum += weights[i]
  }
  if (sum <= 0) return null
  for (let i = 0; i < n; i++) weights[i] /= sum

  // ---- ขั้น 6: cluster เพื่อการแสดงผล — ตัดต้นไม้ที่ระดับ median ของ merge distances
  // (average linkage เป็น monotone linkage ⇒ การตัดที่ height h ให้ partition ที่ทุก
  //  cluster ถูกสร้างจากการ merge ที่ระดับ ≤ h; เลือก h = median เพื่อให้ได้กลุ่ม
  //  ขนาดกำลังดี — ไม่แตกเป็นหน่วยเดี่ยวหมดและไม่รวบทั้งต้นไม้เป็นก้อนเดียว)
  // ถ้าทุก merge ระยะเท่ากัน (root ≤ median) → ทั้งหมดเป็น cluster เดียว
  const dists = merges.map((m) => m.dist).sort((a, b) => a - b)
  const mid = Math.floor((dists.length - 1) / 2)
  const median =
    dists.length % 2 === 1 ? dists[mid] : (dists[mid] + dists[mid + 1]) / 2
  const clusters: number[][] = []
  const cut = (id: number): void => {
    const m = byId.get(id)
    if (m && m.dist > median) {
      cut(m.left)
      cut(m.right)
      return
    }
    if (m) clusters.push(m.members.slice())
    else clusters.push([id]) // leaf เดี่ยว
  }
  cut(rootId)
  // deterministic: เรียงตามสมาชิกตัวแรกของ cluster
  clusters.sort((a, b) => Math.min(...a) - Math.min(...b))

  return { weights, order, clusters }
}
