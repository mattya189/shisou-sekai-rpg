/**
 * seed固定できる乱数生成器（mulberry32）。
 * ゲーム内の乱数はすべてこれを経由させ、テストでは seed を固定する。
 * Math.random() を直接使わないこと。
 */

/**
 * @param {number} [seed]
 */
export function createRng(seed = (Date.now() ^ 0x5eed) >>> 0) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** 0以上1未満 */
    next,
    /** min以上max以下の整数 */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** 確率pで true */
    chance(p) {
      return next() < p;
    },
    pick(array) {
      if (array.length === 0) return undefined;
      return array[Math.floor(next() * array.length)];
    },
    /** 重み付き抽選。entries: [{ weight: number, ... }] */
    weighted(entries, weightKey = 'weight') {
      const total = entries.reduce((sum, e) => sum + (e[weightKey] ?? 0), 0);
      if (total <= 0) return undefined;
      let roll = next() * total;
      for (const e of entries) {
        roll -= e[weightKey] ?? 0;
        if (roll < 0) return e;
      }
      return entries[entries.length - 1];
    },
    getState() {
      return state >>> 0;
    },
    setState(s) {
      state = s >>> 0;
    },
  };
}
