/**
 * 戦場の立ち位置。DOMに依存しない。
 *
 *   x     : 戦場幅に対する横位置（%）。立ち絵の中心
 *   depth : 0 = 画面端側（敵なら上端・味方なら下端）。現在は全員 0（各陣営が横一直線に並ぶ）
 *
 * 敵は戦場の上端、味方は下端にそれぞれ横一列で並び、中央の空間で向き合う。
 * 情報（名前・HP・MP・スタック・状態）は、敵は立ち絵の上、味方は立ち絵の下に置く。
 * 1〜2体は中央へ寄せる。ボスは中央に置き、部位を左右に並べる。
 */
const LAYOUTS = {
  1: [{ x: 50, depth: 0 }],
  2: [{ x: 30, depth: 0 }, { x: 70, depth: 0 }],
  3: [{ x: 18, depth: 0 }, { x: 50, depth: 0 }, { x: 82, depth: 0 }],
};

/**
 * @param {Array<{ boss?: any, isPart?: boolean }>} units 片側のユニット（並び順どおり）
 * @returns {Array<{ x: number, depth: number }>} units と同じ順の配置
 */
export function slotLayout(units) {
  const count = units.length;
  const bossIndex = units.findIndex((u) => u.boss);
  if (bossIndex >= 0 && count > 1) {
    // ボス本体は中央、部位などは左右へ交互に置く（一直線）
    const sides = [{ x: 18, depth: 0 }, { x: 82, depth: 0 }];
    let next = 0;
    return units.map((u, i) => (i === bossIndex ? { x: 50, depth: 0 } : sides[next++ % sides.length]));
  }
  if (LAYOUTS[count]) return LAYOUTS[count].map((slot) => ({ ...slot }));
  // 3体を超える構成は現在の仕様（3対3）では起きないが、データ不整合でも画面外へ出さない
  return units.map((_, i) => ({ x: Math.round(((i + 0.5) / count) * 100), depth: 0 }));
}
