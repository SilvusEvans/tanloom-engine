'use strict';
/**
 * 取值气泡（点击圆形 / 六边形积木）与原版对齐的现场验证
 *   node tools/electron.cjs tools/probe-bubble.cjs
 *
 * 「和原版一样」这件事不看手感看证据：scratch-blocks 自己导出了
 * `Blockly.reportValue(id, value)`，原版就是调它，气泡本体是 Blockly 的
 * DropDownDiv（白底 #FFF / 边框 #AAA / 带朝上的箭头 / 内容区 .valueReportBox）。
 * 这个探针逐项核对这些，并覆盖几种容易做歪的情况：
 * 反复点同一块、点空白处收起、选择区里的圆形积木、布尔值的显示。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerScheme, installHandler, APP_URL } = require('../app-protocol.cjs');
const { registerIpc } = require('../ipc.cjs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', path.join(require('os').tmpdir(), 'df-bubble'));
registerScheme();

const ROOT = path.join(__dirname, '..');
const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`  ${ok ? '✓' : '✖'} ${name}${detail ? ' — ' + detail : ''}`);
};

app.whenReady().then(async () => {
  installHandler(path.join(ROOT, 'src'), ROOT);
  registerIpc();
  const win = new BrowserWindow({
    width: 1680, height: 1020, show: false,
    webPreferences: { preload: path.join(ROOT, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  const logs = [];
  win.webContents.on('console-message', (e) => { const m = (e && e.message) || ''; if (m) logs.push(m); });
  // 用「可见但不抢焦点」的窗口：隐藏页面的 rAF 和 CSS 过渡都不走，
  // 积木坐标也不会稳定下来 —— 隐藏窗口测出来的位置是假象。
  win.showInactive();
  await win.loadURL(APP_URL);
  await new Promise((r) => setTimeout(r, 2600));
  const run = (js) => win.webContents.executeJavaScript(js);
  /**
   * 截图。两个必须：
   *  1. 连抓两次取第二张（第一张常是上一帧）；
   *  2. **绝不许把异常抛出去**。这里在 async 里 await，抛出去就是一个
   *     unhandled rejection —— 后面的汇总、`app.exit()` 全都不会执行，
   *     进程会一直挂着，看起来像「探针卡死」，实际上断言早就跑完了。
   *     （实测踩过：`Current display surface not available for capture`
   *      —— 窗口没被合成时就抓不到，和被测代码毫无关系。）
   */
  const shot = async (region, file) => {
    try {
      if (region) await win.webContents.capturePage(region);
      else await win.webContents.capturePage();
    } catch { /* 预热失败，继续试正片 */ }
    await new Promise((r) => setTimeout(r, 200));
    try {
      const img = region ? await win.webContents.capturePage(region) : await win.webContents.capturePage();
      fs.writeFileSync(file, img.toPNG());
      return true;
    } catch { return false; }
  };

  /* ---- 页面内的公用小工具 ---- */
  await run(`(() => {
    // 取一块积木上「不在字段文字上」的点击点。
    // 落在字段上会被 Blockly 判成字段交互（和原版一致），测试就会误判成「没反应」。
    window.__pt = (id) => {
      const b = window.__df.ws._findBlock(id);
      if (!b || !b.getSvgRoot()) return null;
      const r = b.getSvgRoot().getBoundingClientRect();
      const isField = (el) => {
        if (!el) return true;
        const cl = el.getAttribute ? (el.getAttribute('class') || '') : '';
        if (/blocklyFieldText|blocklyEditableText|blocklyHtmlInput|blocklyDropDownDiv/.test(cl)) return true;
        return !!(el.closest && el.closest('.blocklyEditableText, .blocklyDropDownDiv'));
      };
      let x = Math.round(r.left + 4), y = Math.round(r.top + r.height / 2);
      outer: for (const dx of [4, 8, 12, 3, 6, 20]) {
        for (const dy of [r.height / 2, 8, r.height - 10]) {
          const px = Math.round(r.left + dx), py = Math.round(r.top + dy);
          if (!isField(document.elementFromPoint(px, py))) { x = px; y = py; break outer; }
        }
      }
      return { x, y };
    };
    window.__box = () => {
      const dd = document.querySelector('.blocklyDropDownDiv');
      const box = document.querySelector('.valueReportBox');
      const count = document.querySelectorAll('.valueReportBox').length;
      if (!dd || !box) return { present: false, dd: !!dd, box: !!box, count };
      const dr = dd.getBoundingClientRect();
      const cs = getComputedStyle(dd);
      return {
        present: true, count,
        text: box.textContent,
        rect: [Math.round(dr.left), Math.round(dr.top), Math.round(dr.width), Math.round(dr.height)],
        cls: dd.className,
        visible: cs.display !== 'none' && cs.visibility !== 'hidden',
        colour: cs.backgroundColor,
        border: cs.borderColor,
        arrows: [...dd.children].map((c) => c.getAttribute('class')).filter(Boolean),
      };
    };
    // 临时焦点是全局独占的（拿第二次会抛错），插桩记录取还与调用栈
    const fm = window.__df.Blockly.getFocusManager();
    window.__focusLog = [];
    const orig = fm.takeEphemeralFocus.bind(fm);
    fm.takeEphemeralFocus = function (el) {
      const st = (new Error().stack || '').split('\\n').slice(2, 4).join(' | ').slice(0, 160);
      window.__focusLog.push({ take: st });
      const release = orig(el);
      return function () { window.__focusLog.push({ release: true }); return release(); };
    };
    return 1;
  })()`);

  const click = async (p, wait = 400) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
    win.webContents.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 60));
    win.webContents.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, wait));
  };
  const dumpBox = () => run('window.__box()');

  /* ---- 0. 官方接口在不在 ---- */
  console.log('\n=== 0. scratch-blocks 的官方取值接口 ===');
  const api = await run(`(() => ({
    reportValue: typeof window.__df.Blockly.reportValue,
    showPositionedByBlock: typeof (window.__df.Blockly.DropDownDiv || {}).showPositionedByBlock,
    getContentDiv: typeof (window.__df.Blockly.DropDownDiv || {}).getContentDiv,
    valueReportBoxCss: [...document.styleSheets].some((s) => {
      try { return [...s.cssRules].some((r) => String(r.cssText).includes('valueReportBox')); } catch { return false; }
    }),
  }))()`);
  check('官方 reportValue 可用', api.reportValue === 'function', 'typeof = ' + api.reportValue);
  check('DropDownDiv.showPositionedByBlock 可用', api.showPositionedByBlock === 'function');
  check('.valueReportBox 的样式已注入', api.valueReportBoxCss === true);

  /* ---- 挑积木：一块圆形 + 一块六边形 ---- */
  const picked = await run(`(async () => {
    const df = window.__df;
    const player = df.store.project.entities.find((e) => e.name === '玩家');
    df.store.selectedEntityId = player.id;
    df.ws.showEntity(player.id);
    await new Promise((r) => setTimeout(r, 600));
    // 速度 = 240，是示例项目里现成的变量，好核对值
    const bs = df.ws.ws.getAllBlocks(false);
    const rep = bs.find((b) => b.type === 'data_variable' && b.outputConnection && b.getOutputShape() === 2);
    const hex = bs.find((b) => b.outputConnection && b.getOutputShape() === 1);
    return { rep: rep ? rep.id : null, hex: hex ? hex.id : null,
             repType: rep && rep.type, hexType: hex && hex.type };
  })()`);
  console.log('  圆形:', picked.repType, '| 六边形:', picked.hexType);

  /* ---- 1. 圆形积木 ---- */
  console.log('\n=== 1. 点圆形积木（reporter） ===');
  if (!picked.rep) {
    check('工作区里找得到圆形积木', false);
  } else {
    await click(await run(`window.__pt(${JSON.stringify(picked.rep)})`), 150);
    const box = await dumpBox();
    console.log('  气泡:', JSON.stringify(box));
    check('点圆形积木出现官方取值气泡', box.present && box.visible, box.present ? `内容「${box.text}」` : '没有 .valueReportBox');
    if (box.present) {
      check('是官方配色（白底 + #AAA 边框）',
        /255,\s*255,\s*255/.test(box.colour || '') && /170,\s*170,\s*170/.test(box.border || ''),
        box.colour + ' / ' + box.border);
      check('带官方箭头与内容容器',
        box.arrows.includes('blocklyDropDownArrow') && box.arrows.includes('blocklyDropDownContent'),
        JSON.stringify(box.arrows));
      const geo = await run(`(() => {
        const b = window.__df.ws._findBlock(${JSON.stringify(picked.rep)});
        const r = b.getSvgRoot().getBoundingClientRect();
        const dd = document.querySelector('.blocklyDropDownDiv').getBoundingClientRect();
        // 原版按「第一个字段」定位：气泡在积木下方，水平对着那个字段
        let fx = r.left, fw = r.width;
        for (const input of b.inputList) {
          for (const f of input.fieldRow) {
            const fr = f.getSvgRoot && f.getSvgRoot().getBoundingClientRect();
            if (fr && fr.width) { fx = fr.left; fw = fr.width; break; }
          }
          break;
        }
        return { gapY: Math.round(dd.top - r.bottom), dCenter: Math.round(dd.left + dd.width / 2),
                 fieldCenter: Math.round(fx + fw / 2), vertical: dd.top >= r.bottom - 2 };
      })()`);
      console.log('  定位:', JSON.stringify(geo));
      // 容差放宽到 24px：DropDownDiv 按弹出瞬间的页面坐标定位、不跟随布局，
      // 而运行中底部调试坞每 160ms 刷新会轻微推动整块区域。关键是「在下方 + 对着字段」。
      check('气泡落在积木下方', geo.vertical && geo.gapY >= -2 && geo.gapY <= 24, '纵向间隙 ' + geo.gapY + 'px');
      check('气泡水平对着积木的第一个字段', Math.abs(geo.dCenter - geo.fieldCenter) <= 6,
        '气泡中心 ' + geo.dCenter + ' / 字段中心 ' + geo.fieldCenter);
      check('取值口径与运行时一致（速度 = 240）', box.text === '240', '内容「' + box.text + '」');
    }
  }

  /* ---- 1b. 点「积木上的文字」也要出值 ----
   * 原来这一下会被判成「点在字段上」直接跳过 —— 当时用的是 `.blocklyFieldText`，
   * 而那个类名连纯标签（「让」「说」「秒」「第」「项」）都有，于是圆形积木的绝大部分
   * 面积都成了「字段区」，点下去有没有反应全看落点。用户报的「有时有效、有时无效」就是它。
   * 这里把两种落点分别钉住：标签 → 出值；可编辑字段 → 让路（打开下拉/输入框，不出值）。
   */
  console.log('\n=== 1b. 点在积木的文字标签上 vs 落在可编辑字段上 ===');
  {
    const LABEL_PT = `(() => {
      window.__ptOnLabel = (id) => {
        const b = window.__df.ws._findBlock(id);
        const root = b && b.getSvgRoot();
        if (!root) return null;
        const t = root.querySelector('.blocklyLabelField text, .blocklyLabelField .blocklyFieldText');
        if (!t) return null;
        const r = t.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const el = document.elementFromPoint(x, y);
        return { x, y, cls: (el && el.getAttribute && el.getAttribute('class')) || '',
                 onLabel: !!(el && el.closest && el.closest('.blocklyLabelField')) };
      };
      const bs = window.__df.ws.ws.getAllBlocks(false)
        .filter((b) => b.outputConnection && !b.isInFlyout && b.getSvgRoot());
      for (const b of bs) {
        const p = window.__ptOnLabel(b.id);
        if (p && p.onLabel) return { id: b.id, type: b.type, ...p };
      }
      return { none: true, candidates: bs.map((b) => b.type) };
    })()`;
    const labelPt = await run(LABEL_PT);
    check('找得到一块「带文字标签」的圆形积木', !labelPt.none,
      labelPt.none ? `没有合适的（候选 ${(labelPt.candidates || []).join(', ')}）` : `${labelPt.type} 的标签落点 (${labelPt.x},${labelPt.y}) 命中 ${labelPt.cls}`);

    if (!labelPt.none) {
      await run('window.__df.ws.hideValueBox()');
      await click({ x: labelPt.x, y: labelPt.y }, 220);
      const box = await dumpBox();
      check('点在文字上也会出值（不被当成字段交互吞掉）',
        box.present && box.visible && box.text !== null,
        box.present ? `内容「${box.text}」` : '没弹气泡 —— 这一下被跳过了');
    }

    // 反向：落在可编辑字段（下拉/输入框）上时不该出值 —— 那一下要留给字段本身
    const fieldPt = await run(`(() => {
      const bs = window.__df.ws.ws.getAllBlocks(false)
        .filter((b) => b.outputConnection && !b.isInFlyout && b.getSvgRoot());
      for (const b of bs) {
        const rect = b.getSvgRoot().querySelector('.blocklyFieldRect');
        if (!rect) continue;
        const r = rect.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const el = document.elementFromPoint(x, y);
        if (el && el.closest && el.closest('.blocklyFieldRect, .blocklyEditableField')) return { id: b.id, type: b.type, x, y };
      }
      return { none: true };
    })()`);
    check('找得到一块「带可编辑字段」的圆形积木', !fieldPt.none, fieldPt.none ? '没有带 rect 的字段' : fieldPt.type);
    if (!fieldPt.none) {
      await run('window.__df.ws.hideValueBox()');
      await click({ x: fieldPt.x, y: fieldPt.y }, 220);
      const box = await dumpBox();
      check('落在可编辑字段上不出值（那一下归字段自己）', !box.present,
        box.present ? `不该弹气泡，却弹了「${box.text}」` : '没弹气泡（对）');
      // 收尾：把可能打开的下拉/输入框关掉，别影响后面的断言
      await run(`(() => {
        if (window.__df.Blockly.DropDownDiv) { try { window.__df.Blockly.DropDownDiv.hideWithoutAnimation(); } catch (e) {} }
        document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return 1;
      })()`);
    }
  }

  /* ---- 2. 六边形积木 ---- */
  console.log('\n=== 2. 点六边形积木（boolean） ===');
  if (!picked.hex) {
    check('工作区里找得到六边形积木', false);
  } else {
    await click(await run(`window.__pt(${JSON.stringify(picked.hex)})`));
    const box = await dumpBox();
    console.log('  气泡:', JSON.stringify(box));
    check('点六边形积木出现取值气泡', box.present && box.visible, box.present ? `内容「${box.text}」` : '没有气泡');
    check('布尔按原版显示 true / false', /^(true|false)$/.test(String(box.text || '').trim()), '内容「' + (box.text || '') + '」');
    check('内容区只有一个气泡', box.count === 1, box.count + ' 个');
  }

  /* ---- 3. 点空白处收起 ---- */
  console.log('\n=== 3. 点工作区空白处应收起气泡 ===');
  const blank = await run(`(() => {
    const host = document.querySelector('#blockly-host');
    const r = host.getBoundingClientRect();
    for (const [fx, fy] of [[0.92, 0.88], [0.9, 0.12], [0.55, 0.92]]) {
      const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
      const el = document.elementFromPoint(x, y);
      if (el && /blocklyWorkspace|blocklySvg|blocklyMainBackground/.test(el.getAttribute('class') || '')) return { x, y };
    }
    return null;
  })()`);
  if (!blank) check('找得到工作区空白处', false);
  else {
    await click(blank);
    const box = await dumpBox();
    check('点空白处气泡消失', !box.visible, box.present ? '还在（' + box.text + '）' : '已收起');
  }

  /* ---- 4. 反复点同一块 ---- */
  console.log('\n=== 4. 反复点同一块圆形积木 ===');
  if (picked.rep) {
    const seenBefore = logs.filter((m) => /ephemeral|取值气泡失败/.test(m)).length;
    let box = null;
    for (let i = 0; i < 3; i++) {
      await click(await run(`window.__pt(${JSON.stringify(picked.rep)})`));
      box = await dumpBox();
    }
    const seenAfter = logs.filter((m) => /ephemeral|取值气泡失败/.test(m)).length;
    check('反复点不会留下独占焦点 / 报错', seenAfter === seenBefore, `报错 ${seenBefore} → ${seenAfter} 条`);
    check('每次点都还有气泡', box.present && box.visible, box.present ? `内容「${box.text}」` : '没有气泡');
    check('内容区不会堆积多个气泡', box.count === 1, box.count + ' 个');
  }

  /* ---- 5. 选择区里的圆形积木 ---- */
  console.log('\n=== 5. 选择区（飞出面板）里的圆形积木 ===');
  {
    // 挑一块「整块都不是字段」的圆形积木：变量积木整块就是下拉字段，
    // 点它按原版是「换变量」而不是求值（这条也在下面一起验证）
    const WANT = ['sensing_mousex', 'sensing_mousey', 'sensing_timer'];
    const found = await run(`(async () => {
      const ws = window.__df.ws.ws;
      const fws = ws.getFlyout().getWorkspace();
      const b = fws.getAllBlocks(false).find((x) => ${JSON.stringify(WANT)}.includes(x.type) && x.outputConnection);
      if (!b) return { ok: false, total: fws.getAllBlocks(false).length };
      // 连续工具箱把所有分类摊在一条长条上，滚到它得用面板自己的 scrollTo。
      // 它是逐帧动画（每次走 30%），这里显式多步几次 —— 别依赖 rAF 的时机。
      const target = Math.max(0, b.getRelativeToSurfaceXY().y - 60);
      for (let i = 0; i < 25; i++) { ws.getFlyout().scrollTo(target); await new Promise((r) => setTimeout(r, 25)); }
      return { ok: true, id: b.id, type: b.type, target: Math.round(target) };
    })()`);
    console.log('  滚动:', JSON.stringify(found));
    if (!found.ok) {
      check('选择区里找得到候选圆形积木', false);
    } else {
      const pt = await run(`(() => {
        const b = window.__df.ws._findBlock(${JSON.stringify(found.id)});
        if (!b || !b.getSvgRoot()) return null;
        const r = b.getSvgRoot().getBoundingClientRect();
        // 注意：SVG 元素的 className 是 SVGAnimatedString，过滤要用 getAttribute
        const flyRect = [...document.querySelectorAll('#blockly-host .blocklyFlyout')]
          .filter((e) => !/Trashcan/i.test(e.getAttribute('class') || ''))
          .map((e) => e.getBoundingClientRect())[0];
        return { x: Math.round(r.left + 5), y: Math.round(r.top + r.height / 2),
                 inside: !!flyRect && r.top >= flyRect.top - 1 && r.bottom <= flyRect.bottom + 1,
                 rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width)] };
      })()`);
      if (!pt || !pt.inside) {
        check('把选择区里的圆形积木滚到可见位置', false, JSON.stringify(pt));
      } else {
        await click(pt);
        const box = await dumpBox();
        console.log('  气泡:', JSON.stringify(box));
        check('点选择区里的圆形积木也会出值（和原版一致）', box.present && box.visible,
          box.present ? `内容「${box.text}」` : '没有气泡');
      }

      // 变量积木整块是下拉字段：点它应该出「选变量」的下拉，不是值气泡
      const varPt = await run(`(() => {
        const fws = window.__df.ws.ws.getFlyout().getWorkspace();
        const b = fws.getAllBlocks(false).find((x) => x.type === 'data_variable' && x.outputConnection);
        if (!b || !b.getSvgRoot()) return null;
        const r = b.getSvgRoot().getBoundingClientRect();
        const flyRect = [...document.querySelectorAll('#blockly-host .blocklyFlyout')]
          .filter((e) => !/Trashcan/i.test(e.getAttribute('class') || ''))
          .map((e) => e.getBoundingClientRect())[0];
        if (!flyRect || r.top < flyRect.top || r.bottom > flyRect.bottom) return null;
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      })()`);
      if (varPt) {
        await click(varPt);
        const isFieldDrop = await run(`!!document.querySelector('.blocklyDropDownDiv .blocklyMenuItem, .blocklyDropDownDiv .goog-menuitem')`);
        const box = await dumpBox();
        check('点选择区里的变量积木是「换变量」而不是求值（原版行为）', isFieldDrop === true && !box.present,
          '下拉菜单 ' + isFieldDrop + ' / 值气泡 ' + box.present);
      }
    }
  }

  /* ---- 6. 出图 ---- */
  {
    await run(`(async () => {
      const df = window.__df;
      const b = df.ws._findBlock(${JSON.stringify(picked.rep || '')});
      if (b) df.ws._reportValue(b, df.rt.state.entities['玩家']);
      await new Promise((r) => setTimeout(r, 200));
      return 1;
    })()`);
    const crop = await run(`(() => {
      const b = window.__df.ws._findBlock(${JSON.stringify(picked.rep || '')});
      if (!b) return null;
      const r = b.getSvgRoot().getBoundingClientRect();
      return { x: Math.max(0, Math.round(r.left - 40)), y: Math.max(0, Math.round(r.top - 60)), width: 620, height: 260 };
    })()`);
    if (crop) {
      if (await shot(crop, path.join(ROOT, 'tools', 'shots', '10-value-report.png'))) {
        console.log('\n  已保存 tools/shots/10-value-report.png');
      } else {
        console.log('\n  ⚠ 这张图没抓到（窗口没被合成），跳过 —— 不影响上面的断言');
      }
    }
  }

  /* ---- 账本 ---- */
  const flog = await run('window.__focusLog');
  const takes = flog.filter((e) => e.take).length;
  const rels = flog.filter((e) => e.release).length;
  console.log(`\n=== 临时焦点账本：拿 ${takes} 次 / 还 ${rels} 次（差 1 就是当时还开着的气泡）===`);

  const bad = logs.filter((m) => !/DevTools|Autofill|GPU|deprecated/i.test(m));
  console.log(`\n=== 结果 ${results.filter(Boolean).length}/${results.length} ===`);
  if (bad.length) { console.log('--- 控制台 ---'); bad.slice(-10).forEach((m) => console.log('  ' + m)); }
  else console.log('控制台无报错');
  app.exit(results.every(Boolean) && !bad.length ? 0 : 1);
});
