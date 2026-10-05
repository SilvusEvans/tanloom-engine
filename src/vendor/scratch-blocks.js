/**
 * DualForge — 积木渲染器入口
 * ================================================================
 * 积木不是自己画的，而是直接用 Scratch 官方发布的 scratch-blocks 包
 * （Scratch 官网编辑器用的就是它），所以积木形状、燕尾槽、圆角、配色、
 * 拖拽吸附、插入标记、右键菜单全都和 Scratch 一致。
 *
 * 包在 node_modules/scratch-blocks 里，由主进程的 df://bundle/ 协议提供
 * （本机访问不了 npm registry，所以是离线放进来的）。
 *
 * 注意：这里必须用**完整 URL**导入，裸模块名（'scratch-blocks'）在浏览器
 * 里没有解析器。
 */
export * from 'df://bundle/node_modules/scratch-blocks/dist/main.mjs';

/** scratch-blocks 的 media 目录（图标 / 光标 / 音效） */
export const MEDIA_URL = 'df://bundle/node_modules/scratch-blocks/media/';
