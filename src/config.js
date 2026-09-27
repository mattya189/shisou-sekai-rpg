/**
 * アプリ全体の設定。
 *
 * debug.mode
 *   'auto' : 開発環境（localhost・LAN内IP・hosts に書いたホスト）でだけデバッグ機能を有効にする
 *   'on'   : 常に有効（検証用ブランチなどで一時的に使う。本番に出さないこと）
 *   'off'  : 常に無効
 */
export const CONFIG = {
  saveKey: 'shisou-sekai-rpg/save',
  debug: {
    mode: 'auto',
    hosts: ['localhost', '127.0.0.1', '[::1]'],
    allowPrivateNetwork: true,
  },
};

function isPrivateHost(host) {
  return (
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local')
  );
}

/**
 * @param {{ hostname: string }} location
 * @param {typeof CONFIG.debug} [debugConfig]
 */
export function isDebugEnabled(location, debugConfig = CONFIG.debug) {
  if (debugConfig.mode === 'on') return true;
  if (debugConfig.mode === 'off') return false;
  const host = location.hostname;
  if (debugConfig.hosts.includes(host)) return true;
  if (debugConfig.allowPrivateNetwork && isPrivateHost(host)) return true;
  return false;
}
