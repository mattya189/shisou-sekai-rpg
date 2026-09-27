/**
 * プレイヤー操作の結果として起こりうるエラー。
 * UIは code を見て表示文言を決められる。message はそのまま表示できる日本語。
 */
export class GameError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}
