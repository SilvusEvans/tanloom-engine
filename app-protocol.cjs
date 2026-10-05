'use strict';
/**
 * Tanloom Engine — 自定义协议
 * ================================================================
 * 编辑器是 ES module 结构，file:// 下会被 CORS 拦掉，所以需要「像 http 一样」
 * 的加载方式。常见的做法是起一个本地 http 服务器，但那样会受系统代理、
 * 防火墙、端口占用的影响（本机就因为 http_proxy 环境变量直接超时了）。
 *
 * 这里改用 Electron 的自定义协议 tanloom://，由主进程直接从磁盘读文件返回，
 * 不经过任何网络栈 —— 没有端口、没有代理、没有超时。
 */

const { protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const SCHEME = 'tanloom';
const HOST = 'app';
// 第二个 host：把工程根目录也暴露出来，这样渲染进程能加载 node_modules 里的
// scratch-blocks（官方渲染器 + media 资源），不用把它们复制进 src。
const BUNDLE_HOST = 'bundle';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.cur': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.gif': 'image/gif',
  '.map': 'application/json; charset=utf-8'
};

/** 必须在 app ready 之前调用 */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }]);
}

/**
 * 在 app ready 之后调用。
 * @param {string} rootDir  index.html 所在目录（tanloom://app/）
 * @param {string} [bundleDir] 工程根目录（tanloom://bundle/），用于加载 node_modules
 */
function installHandler(rootDir, bundleDir) {
  const roots = {
    [HOST]: path.resolve(rootDir),
    [BUNDLE_HOST]: path.resolve(bundleDir || path.join(rootDir, '..'))
  };

  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const root = roots[url.host] || roots[HOST];
    let rel = decodeURIComponent(url.pathname || '/');
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(root, rel));
    // 防目录穿越：只允许读 root 之内
    const inRoot = file === root || file.startsWith(root + path.sep);
    if (!inRoot) {
      return new Response('forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
    }
    try {
      const res = await net.fetch(pathToFileURL(file).toString());
      const ext = path.extname(file).toLowerCase();
      const headers = new Headers();
      headers.set('content-type', MIME[ext] || 'application/octet-stream');
      headers.set('cache-control', 'no-store');
      return new Response(res.body, { status: 200, headers });
    } catch (err) {
      return new Response('404 ' + url.host + rel, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  });
}

const APP_URL = `${SCHEME}://${HOST}/index.html`;
/** 独立运行窗口的入口（和编辑器同一个 host，只是另一个页面） */
const PLAYER_URL = `${SCHEME}://${HOST}/player.html`;
/** scratch-blocks 的 dist / media 都从这里取 */
const BUNDLE_URL = `${SCHEME}://${BUNDLE_HOST}/`;

module.exports = { registerScheme, installHandler, APP_URL, PLAYER_URL, BUNDLE_URL, SCHEME, HOST, BUNDLE_HOST };
