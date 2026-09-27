/**
 * セーブの保存先。
 * SaveRepository はこのインターフェース（getItem / setItem / removeItem）だけに依存する。
 * 将来オンライン保存にする場合は、同じ形のアダプタを追加して差し替える。
 */

/** ブラウザの localStorage */
export function browserLocalStorage() {
  return {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  };
}

/** メモリ上の保存先（テスト用） */
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}
