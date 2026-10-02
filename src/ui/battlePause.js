/**
 * 戦闘画面の一時停止状態。DOMに依存しない（テストから直接使える）。
 *
 * 停止の理由を2つに分けて持つ:
 *   manual : プレイヤーが一時停止ボタンで止めた
 *   panel  : 詳細またはログのパネルを開いている（'detail' | 'log' | null）
 * 戦闘が進むのは「手動停止でない」かつ「パネルを開いていない」かつ「勝敗未確定」のときだけ。
 *
 * この形にすると依頼書第9項の規則がそのまま成り立つ:
 *   - パネルを開くと止まる。閉じると、開く前に進行中だった場合だけ再開する（manual は触らない）
 *   - 手動停止中に開閉しても停止のまま
 *   - 詳細 → ログの切り替えは panel が null を経由しないので、一瞬も再開しない
 *   - 勝敗確定後は開閉しても進まない
 * 停止していた実時間は記録するだけで、戦闘へは渡さない（再開時にまとめて進めない）。
 */
export function createPauseController({ now = () => 0 } = {}) {
  let manual = false;
  let panel = null;
  let over = false;
  let haltedSince = null;
  const listeners = new Set();

  const running = () => !manual && panel === null && !over;

  function update(fn) {
    const before = running();
    fn();
    const after = running();
    if (before && !after) haltedSince = now();
    if (!before && after) {
      const pausedMs = haltedSince == null ? 0 : now() - haltedSince;
      haltedSince = null;
      for (const listener of listeners) listener(pausedMs);
    }
  }

  return {
    /** 戦闘時間・行動・状態期間・演出キューを進めてよいか */
    isRunning: running,
    isManuallyPaused: () => manual,
    panel: () => panel,
    isOver: () => over,
    toggleManual() {
      update(() => { manual = !manual; });
      return manual;
    },
    setManual(value) {
      update(() => { manual = Boolean(value); });
    },
    /** パネルを開く。別のパネルからの切り替えも同じ呼び出しでよい */
    openPanel(kind) {
      update(() => { panel = kind; });
    },
    closePanel() {
      update(() => { panel = null; });
    },
    /** 勝敗確定。以後は再開しない */
    markOver() {
      update(() => { over = true; });
    },
    /** 再開時に呼ばれる（引数: 停止していた実時間ms。演出の待ち時間をずらすためだけに使う） */
    onResume(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
