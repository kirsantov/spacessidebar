const $ = (s) => document.querySelector(s);
const uid = () => crypto.randomUUID();
const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;
const HUES = [265, 220, 180, 140, 80, 40, 15, 330];
const GROUP_COLORS = { 265: 'purple', 220: 'blue', 180: 'cyan', 140: 'green', 80: 'yellow', 40: 'orange', 15: 'red', 330: 'pink' };
const COLOR_HUE = { grey: null, blue: 220, red: 15, yellow: 80, green: 140, pink: 330, purple: 265, cyan: 180, orange: 40 };
const groupCss = (c) => (COLOR_HUE[c] == null ? 'oklch(62% 0.02 260)' : `oklch(62% 0.17 ${COLOR_HUE[c]})`);
const NO_GROUP = -1, NO_SPLIT = -1;
const canSplit = () => typeof chrome.tabs.createSplit === 'function';
const IS_WIN = /Win/i.test(navigator.platform || '');
const ARC_PATH = IS_WIN
  ? '%LOCALAPPDATA%\\Packages\\TheBrowserCompany.Arc_ttt1ap7aakyb4\\LocalCache\\Local\\Arc\\StorableSidebar.json'
  : '~/Library/Application Support/Arc/StorableSidebar.json';
const ARC_REVEAL = IS_WIN ? `explorer /select,"${ARC_PATH}"` : `open -R "$HOME/Library/Application Support/Arc/StorableSidebar.json"`;
// v0.2 хранил эмодзи — переводим в ключи иконок
const LEGACY_ICONS = { '⭐': 'star', '🌙': 'moon', '🔲': 'grid', '📚': 'book', '🛠': 'tools', '⚡': 'bolt', '🔺': 'triangle', '🚩': 'flag', '🗄': 'server', '💀': 'skull', '🏠': 'home', '🌐': 'globe', '💼': 'briefcase', '🎧': 'music', '🎮': 'square', '✈️': 'plane', '🧪': 'flask', '💡': 'bulb', '🌱': 'leaf', '🔥': 'bolt' };

let state, activeId, winId;
let bindings = {};          // linkId -> tabId (до перезапуска браузера)
let tabSpace = {};          // tabId -> spaceId (режим «вкладки по Spaces»)
let allTabs = new Map();
let allGroups = new Map();  // groupId -> TabGroup
let winTabs = [];
let selected = new Set();   // выделенные вкладки (Ctrl/Cmd+клик)
let gcol = {};              // groupId -> свёрнута ли группа в панели
let filter = '';
let drag = null;            // {kind:'node', id} | {kind:'tab', tabId}
let lastSaved = '';
const lastActive = {};      // spaceId -> tabId

/* ---------- dom helpers ---------- */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k);
  return el;
}
function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.circle);
  s.append(p);
  return s;
}
// иконка Space: ключ из набора; произвольный символ (свой значок из Arc) показываем текстом
const spaceIcon = (v) => (ICONS[v] ? icon(v) : h('span', { class: 'ic txt' }, v || ''));
const spaceLabel = (s) => (ICONS[s.icon] ? s.name : `${s.icon} ${s.name}`);

/* ---------- state ---------- */
const defaults = () => {
  const id = uid();
  return { activeSpaceId: id, settings: { tabsBySpace: false }, spaces: [{ id, name: 'Personal', icon: 'home', hue: 265, items: [] }] };
};
function migrate(st) {
  st.settings = st.settings || { tabsBySpace: false };
  for (const s of st.spaces) if (!ICONS[s.icon] && LEGACY_ICONS[s.icon]) s.icon = LEGACY_ICONS[s.icon];
  return st;
}
const space = () => state.spaces.find((s) => s.id === activeId) || state.spaces[0];
const bySpace = () => !!state.settings.tabsBySpace;
const pristine = () => state.spaces.every((s) => !s.items.length);

function save() {
  lastSaved = JSON.stringify(state);
  chrome.storage.local.set({ state });
}
const saveSession = () => chrome.storage.session.set({ bindings, tabSpace, gcol });

function walk(items, fn) {
  for (let i = 0; i < items.length; i++) {
    const n = items[i];
    if (fn(n, items, i) === false) return false;
    if (n.children && walk(n.children, fn) === false) return false;
  }
}
function find(id) {
  let r = null;
  for (const s of state.spaces) {
    walk(s.items, (n, arr, i) => { if (n.id === id) { r = { node: n, arr, i, space: s }; return false; } });
    if (r) break;
  }
  return r;
}
function removeNode(id) {
  const f = find(id);
  if (f) f.arr.splice(f.i, 1);
  return f && f.node;
}
const contains = (node, id) => node.id === id || (node.children || []).some((c) => contains(c, id));
const countLinks = (items) => { let c = 0; walk(items, (n) => { if (n.type === 'link') c++; }); return c; };
const normUrl = (u) => (u || '').replace(/#.*$/, '').replace(/\/$/, '');
const boundTabIds = () => new Set(Object.values(bindings));
const favicon = (url) => `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`;

/* ---------- tabs ---------- */
function tabLink(tabId) {
  for (const [k, v] of Object.entries(bindings)) if (v === tabId) return find(k);
  return null;
}
function spaceOfTab(tab) {
  const f = tabLink(tab.id);
  return f ? f.space.id : tabSpace[tab.id];
}
async function refreshTabs() {
  const [tabs, groups] = await Promise.all([chrome.tabs.query({}), chrome.tabGroups.query({})]);
  allTabs = new Map(tabs.map((x) => [x.id, x]));
  allGroups = new Map(groups.map((g) => [g.id, g]));
  winTabs = tabs.filter((x) => x.windowId === winId);
  for (const id of selected) if (!allTabs.has(id)) selected.delete(id);
  for (const k of Object.keys(gcol)) if (!allGroups.has(Number(k))) delete gcol[k];
  let dirty = false;
  for (const [k, v] of Object.entries(bindings)) if (!allTabs.has(v) || !find(k)) { delete bindings[k]; dirty = true; }
  for (const k of Object.keys(tabSpace)) if (!allTabs.has(Number(k)) || !state.spaces.some((s) => s.id === tabSpace[k])) { delete tabSpace[k]; dirty = true; }
  if (bySpace()) for (const x of winTabs) if (!spaceOfTab(x)) { tabSpace[x.id] = activeId; dirty = true; }
  if (dirty) saveSession();
}
let tabTimer;
function tabsChanged() {
  clearTimeout(tabTimer);
  tabTimer = setTimeout(async () => {
    await refreshTabs();
    if (bySpace()) {
      const act = winTabs.find((x) => x.active);
      const sid = act && spaceOfTab(act);
      if (sid) {
        lastActive[sid] = act.id;
        if (sid !== activeId) { activeId = sid; state.activeSpaceId = sid; save(); }
      }
    }
    render();
    syncGroups();
  }, 60);
}

async function focusTab(x) {
  await chrome.tabs.update(x.id, { active: true });
  if (x.windowId !== winId) chrome.windows.update(x.windowId, { focused: true });
}
async function openLink(n, background) {
  if (background) return chrome.tabs.create({ url: n.url, active: false });
  let x = allTabs.get(bindings[n.id]);
  if (!x) {
    const taken = boundTabIds();
    x = winTabs.find((y) => !taken.has(y.id) && normUrl(y.url) === normUrl(n.url));
  }
  if (x) await focusTab(x);
  else x = await chrome.tabs.create({ url: n.url });
  bindings[n.id] = x.id;
  saveSession();
  tabsChanged();
}
async function pinCurrent() {
  const x = winTabs.find((y) => y.active);
  if (!x || !x.url || boundTabIds().has(x.id)) return;
  const node = { id: uid(), type: 'link', title: x.title || x.url, url: x.url };
  space().items.push(node);
  bindings[node.id] = x.id;
  saveSession(); save(); render(); syncGroups();
}

/* ---------- tab groups: по одной группе на Space, чужие свёрнуты ---------- */
let syncing = false, syncAgain = false;
const autoCollapsed = new Set();
async function syncGroups() {
  if (!bySpace()) return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  try {
    const tabs = await chrome.tabs.query({ windowId: winId });
    const groups = await chrome.tabGroups.query({ windowId: winId });
    const activeTab = tabs.find((x) => x.active);
    let dirty = false;
    for (const s of state.spaces) {
      let g = groups.find((y) => y.title === s.name);
      // пользователь сам перетащил вкладку в группу Space — считаем это переносом
      if (g) for (const x of tabs) if (x.groupId === g.id && !tabLink(x.id) && tabSpace[x.id] !== s.id) { tabSpace[x.id] = s.id; dirty = true; }
    }
    // группы, созданные пользователем (не Space), не трогаем: только сворачиваем, когда их Space не активен
    const spaceGroupIds = new Set(groups.filter((y) => state.spaces.some((s) => s.name === y.title)).map((y) => y.id));
    for (const g of groups) {
      if (spaceGroupIds.has(g.id)) continue;
      const inG = tabs.filter((x) => x.groupId === g.id);
      if (!inG.length) continue;
      const foreign = inG.every((x) => spaceOfTab(x) && spaceOfTab(x) !== activeId) && !(activeTab && inG.some((x) => x.id === activeTab.id));
      if (foreign && !g.collapsed) { await chrome.tabGroups.update(g.id, { collapsed: true }); autoCollapsed.add(g.id); }
      else if (!foreign && g.collapsed && autoCollapsed.has(g.id)) { await chrome.tabGroups.update(g.id, { collapsed: false }); autoCollapsed.delete(g.id); }
    }
    for (const s of state.spaces) {
      const mine = tabs.filter((x) => !x.pinned && spaceOfTab(x) === s.id);
      if (!mine.length) continue;
      let g = groups.find((y) => y.title === s.name);
      const stray = mine.filter((x) => (!g || x.groupId !== g.id) && (x.groupId === NO_GROUP || spaceGroupIds.has(x.groupId))).map((x) => x.id);
      let gid = g && g.id;
      if (stray.length) gid = await chrome.tabs.group(g ? { tabIds: stray, groupId: g.id } : { tabIds: stray, createProperties: { windowId: winId } });
      const want = { title: s.name, color: GROUP_COLORS[s.hue] || 'grey', collapsed: s.id !== activeId && !(activeTab && mine.some((x) => x.id === activeTab.id)) };
      if (!g || g.title !== want.title || g.color !== want.color || g.collapsed !== want.collapsed) await chrome.tabGroups.update(gid, want);
    }
    if (dirty) { saveSession(); render(); }
  } catch (e) {
    console.warn('Spaces Sidebar: tab groups', e); // например, пользователь тащит вкладку — повторим позже
    setTimeout(syncGroups, 400);
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; syncGroups(); }
  }
}
async function setTabsBySpace(on) {
  state.settings.tabsBySpace = on;
  save();
  if (!on) {
    const groups = await chrome.tabGroups.query({ windowId: winId });
    const ours = new Set(groups.filter((g) => state.spaces.some((s) => s.name === g.title)).map((g) => g.id));
    const ids = winTabs.filter((x) => ours.has(x.groupId)).map((x) => x.id);
    if (ids.length) await chrome.tabs.ungroup(ids);
  }
  await refreshTabs(); render(); syncGroups();
}

/* ---------- drag & drop ---------- */
function clearDrop() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-inside,.drop-root')
    .forEach((e) => e.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-root'));
}
function dropPos(e, row, n) {
  const r = row.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  if (n.type === 'folder') return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'inside';
  return y < 0.5 ? 'before' : 'after';
}
function takeDragged(targetId) {
  if (drag.kind === 'node') {
    if (drag.id === targetId) return null;
    const f = find(drag.id);
    if (!f || (targetId && contains(f.node, targetId))) return null;
    return removeNode(drag.id);
  }
  const x = allTabs.get(drag.tabId);
  if (!x || !x.url) return null;
  const node = { id: uid(), type: 'link', title: x.title || x.url, url: x.url };
  bindings[node.id] = x.id;
  saveSession();
  return node;
}
function doDrop(targetId, pos, toSpace) {
  if (!drag) return;
  // открытая вкладка, брошенная на иконку Space, просто переезжает в этот Space
  if (drag.kind === 'tab' && toSpace && bySpace()) {
    tabSpace[drag.tabId] = toSpace.id; drag = null;
    saveSession(); render(); syncGroups();
    return;
  }
  const node = takeDragged(targetId);
  if (!node) return;
  if (!targetId) (toSpace || space()).items.push(node);
  else {
    const f = find(targetId);
    if (pos === 'inside') { f.node.children.push(node); f.node.collapsed = false; }
    else f.arr.splice(f.i + (pos === 'after' ? 1 : 0), 0, node);
  }
  drag = null;
  save(); render(); syncGroups();
}
function dragSource(el, data) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    drag = data;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', data.id || String(data.tabId));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => { drag = null; el.classList.remove('dragging'); clearDrop(); });
}

/* ---------- render ---------- */
const xBtn = (title, fn) => h('button', { class: 'x', title, onclick: (e) => { e.stopPropagation(); fn(); } }, icon('close'));

function linkRow(n, depth, sub) {
  const x = allTabs.get(bindings[n.id]);
  return h('div', {
    class: `row link${x ? ' open' : ''}${x && x.active && x.windowId === winId ? ' active' : ''}${x && selected.has(x.id) ? ' sel' : ''}`,
    style: `--d:${depth}`, title: n.url,
    onclick: (e) => { if (x && (e.metaKey || e.ctrlKey)) toggleSelect(x.id); else { clearSelect(); openLink(n, e.metaKey || e.ctrlKey); } },
    onauxclick: (e) => { if (e.button === 1) openLink(n, true); },
    oncontextmenu: (e) => nodeMenu(e, n),
  },
    h('img', { class: 'fav', src: (x && x.favIconUrl) || favicon(n.url), alt: '' }),
    h('span', { class: 'title' }, n.title),
    sub && h('span', { class: 'sub' }, sub),
    x && x.splitViewId > NO_SPLIT && icon('split', 'badge'),
    x && xBtn(t('closeTabKeep'), () => chrome.tabs.remove(x.id)),
  );
}
function treeRows(items, depth, out) {
  for (const n of items) {
    let row;
    if (n.type === 'folder') {
      row = h('div', {
        class: `row folder${n.collapsed ? '' : ' expanded'}`, style: `--d:${depth}`,
        onclick: () => { n.collapsed = !n.collapsed; save(); render(); },
        oncontextmenu: (e) => nodeMenu(e, n),
      }, h('span', { class: 'fav' }, icon('chevron')), h('span', { class: 'title' }, n.title), h('span', { class: 'sub' }, String(countLinks(n.children))));
    } else row = linkRow(n, depth);
    dragSource(row, { kind: 'node', id: n.id });
    row.addEventListener('dragover', (e) => {
      if (!drag) return;
      e.preventDefault(); e.stopPropagation();
      clearDrop();
      row.classList.add('drop-' + dropPos(e, row, n));
    });
    row.addEventListener('drop', (e) => {
      if (!drag) return;
      e.preventDefault(); e.stopPropagation();
      const pos = dropPos(e, row, n);
      clearDrop();
      doDrop(n.id, pos);
    });
    out.push(row);
    if (n.type === 'folder' && !n.collapsed) treeRows(n.children, depth + 1, out);
  }
  return out;
}
/* ---------- выделение вкладок ---------- */
function toggleSelect(id) { if (selected.has(id)) selected.delete(id); else selected.add(id); render(); }
function clearSelect() { if (selected.size) { selected.clear(); render(); } }
// вкладки, к которым относится действие из меню: выделение, если кликнули по выделенной, иначе одна
const targets = (x) => (selected.has(x.id) && selected.size > 1 ? winTabs.filter((y) => selected.has(y.id)) : [x]);

function tabRow(x, depth = 0) {
  const row = h('div', {
    class: `row tab open${x.active ? ' active' : ''}${selected.has(x.id) ? ' sel' : ''}`, title: x.url, style: `--d:${depth}`,
    onclick: (e) => { if (e.metaKey || e.ctrlKey) toggleSelect(x.id); else { clearSelect(); focusTab(x); } },
    onauxclick: (e) => { if (e.button === 1) chrome.tabs.remove(x.id); },
    oncontextmenu: (e) => tabMenu(e, x),
  },
    x.favIconUrl ? h('img', { class: 'fav', src: x.favIconUrl, alt: '' }) : h('span', { class: 'fav' }, icon('globe')),
    h('span', { class: 'title' }, x.title || x.url || t('newTab')),
    x.splitViewId > NO_SPLIT && icon('split', 'badge'),
    xBtn(t('close'), () => chrome.tabs.remove(x.id)),
  );
  dragSource(row, { kind: 'tab', tabId: x.id });
  return row;
}
// группа вкладок Chrome — как папка, с обводкой цвета группы
function groupRow(g, tabs) {
  const col = !!gcol[g.id];
  const row = h('div', {
    class: `row folder group${col ? '' : ' expanded'}`, style: `--d:0; --gc:${groupCss(g.color)}`, title: g.title || t('group'),
    onclick: () => { gcol[g.id] = !col; saveSession(); render(); },
    oncontextmenu: (e) => groupMenu(e, g, tabs),
  }, h('span', { class: 'fav' }, icon('chevron')), h('span', { class: 'title' }, g.title || t('group')), h('span', { class: 'sub' }, String(tabs.length)));
  row.addEventListener('dragover', (e) => { if (drag && drag.kind === 'tab') { e.preventDefault(); e.stopPropagation(); clearDrop(); row.classList.add('drop-inside'); } });
  row.addEventListener('drop', (e) => {
    if (!drag || drag.kind !== 'tab') return;
    e.preventDefault(); e.stopPropagation(); clearDrop();
    const ids = selected.has(drag.tabId) ? [...selected] : [drag.tabId];
    drag = null;
    chrome.tabs.group({ tabIds: ids, groupId: g.id }).catch(() => {});
  });
  return row;
}
// открытые вкладки: подряд идущие вкладки одной группы складываем под её заголовок
function tabRows(tabs) {
  const spaceNames = new Set(state.spaces.map((s) => s.name));
  const out = [];
  for (let i = 0; i < tabs.length; i++) {
    const x = tabs[i];
    const g = allGroups.get(x.groupId);
    if (!g || (bySpace() && spaceNames.has(g.title))) { out.push(tabRow(x)); continue; }
    let j = i;
    while (j < tabs.length && tabs[j].groupId === g.id) j++;
    const inG = tabs.slice(i, j);
    out.push(groupRow(g, inG));
    if (!gcol[g.id]) for (const y of inG) { const r = tabRow(y, 1); r.classList.add('ing'); r.style.setProperty('--gc', groupCss(g.color)); out.push(r); }
    i = j - 1;
  }
  return out;
}
function copyLine(text) {
  const b = h('button', { class: 'copy', title: t('copy'), onclick: async () => {
    await navigator.clipboard.writeText(text).catch(() => {});
    b.classList.add('done'); setTimeout(() => b.classList.remove('done'), 1200);
  } }, icon('copy'));
  return h('div', { class: 'codeline' }, h('code', {}, text), b);
}
function onboarding() {
  return h('div', { class: 'onboard' },
    h('div', { class: 'drop' }, icon('upload', 'big'), h('strong', {}, t('obTitle')), h('span', {}, t('obText'))),
    h('p', {}, t('obWhere')), copyLine(ARC_PATH),
    h('p', {}, t('obReveal')), copyLine(ARC_REVEAL),
    h('button', { class: 'primary', onclick: () => pickFile() }, t('obChoose')),
    !IS_WIN && h('p', { class: 'hint' }, t('obPickerHint')),
    h('p', { class: 'hint' }, t('obLocal')),
  );
}

function render() {
  const sp = space();
  activeId = sp.id;
  document.documentElement.style.setProperty('--hue', sp.hue);
  $('#spaceTitle').replaceChildren(spaceIcon(sp.icon), h('span', {}, sp.name));

  const q = filter.trim().toLowerCase();
  const match = (a, b) => (a || '').toLowerCase().includes(q) || (b || '').toLowerCase().includes(q);
  let rows;
  if (q) {
    rows = [];
    for (const s of state.spaces)
      walk(s.items, (n) => { if (n.type === 'link' && match(n.title, n.url)) rows.push(linkRow(n, 0, s.id === sp.id ? '' : s.name)); });
    if (!rows.length) rows = [h('div', { class: 'empty' }, t('nothing'))];
  } else if (pristine()) rows = [onboarding()];
  else {
    rows = treeRows(sp.items, 0, []);
    if (!rows.length) rows = [h('div', { class: 'empty' }, t('emptySpace'))];
  }
  $('#pinned').replaceChildren(...rows);

  const taken = boundTabIds();
  const tabs = winTabs.filter((x) => !taken.has(x.id) && (q ? match(x.title, x.url) : !bySpace() || spaceOfTab(x) === sp.id));
  $('#tabs').replaceChildren(...(q ? tabs.map((x) => tabRow(x)) : tabRows(tabs)));

  $('#spacesBar').replaceChildren(
    ...state.spaces.map((s) => {
      const b = h('button', {
        class: s.id === sp.id ? 'on' : '', title: s.name, style: `--h:${s.hue}`,
        onclick: () => switchSpace(s.id),
        oncontextmenu: (e) => spaceMenu(e, s),
      }, spaceIcon(s.icon));
      b.addEventListener('dragover', (e) => { if (drag) { e.preventDefault(); clearDrop(); b.classList.add('drop-inside'); } });
      b.addEventListener('drop', (e) => { if (!drag) return; e.preventDefault(); clearDrop(); doDrop(null, null, s); });
      return b;
    }),
    h('button', { class: 'add', title: t('newSpace'), onclick: addSpace }, icon('plus')),
  );
}

async function switchSpace(id) {
  activeId = id;
  state.activeSpaceId = id;
  save(); render();
  if (bySpace()) {
    const mine = winTabs.filter((x) => spaceOfTab(x) === id);
    const x = mine.find((y) => y.id === lastActive[id]) || mine[0];
    if (x && !x.active) await chrome.tabs.update(x.id, { active: true });
    syncGroups();
  }
}
function stepSpace(d) {
  const i = state.spaces.findIndex((s) => s.id === activeId);
  const n = state.spaces[i + d];
  if (n) switchSpace(n.id);
}

/* ---------- menus & dialogs ---------- */
function showMenu(e, items) {
  e.preventDefault();
  const m = $('#ctx');
  m.replaceChildren(...items.filter(Boolean).map((it) =>
    it === '-' ? h('hr') : h('button', { class: it.danger ? 'danger' : '', onclick: () => { m.hidden = true; it.fn(); } }, it.label)));
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(e.clientX, innerWidth - r.width - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(e.clientY, innerHeight - r.height - 4)) + 'px';
}

// fields: {key,label,value} | {key,type:'hue'|'icon'|'area',...}; buttons: [{label,value,primary}]
function ask({ title, text, fields = [], buttons }) {
  return new Promise((resolve) => {
    const dlg = $('#dlg'), form = $('#dlgForm');
    buttons = buttons || [{ label: t('cancel'), value: null }, { label: t('ok'), value: 'ok', primary: true }];
    const inputs = {};
    form.replaceChildren(...[
      h('h3', {}, title),
      text && h('p', {}, text),
      ...fields.map((f) => {
        if (f.type === 'hue') {
          return h('div', { class: 'field' }, f.label, h('div', { class: 'hues' }, HUES.map((hue) =>
            h('input', { type: 'radio', name: f.key, value: hue, style: `--h:${hue}`, checked: Number(f.value) === hue }))));
        }
        if (f.type === 'icon') {
          return h('div', { class: 'field' }, f.label, h('div', { class: 'icons' }, SPACE_ICONS.map((k) =>
            h('label', { title: k }, h('input', { type: 'radio', name: f.key, value: k, checked: f.value === k }), icon(k)))));
        }
        const inp = f.type === 'area' ? h('textarea', { rows: 6, readonly: true }, f.value || '') : h('input', { type: 'text', value: f.value || '' });
        inputs[f.key] = inp;
        return h('label', {}, f.label, inp);
      }),
      h('div', { class: 'btns' }, buttons.map((b) =>
        h('button', { type: b.primary ? 'submit' : 'button', class: b.primary ? 'primary' : '', onclick: (ev) => { ev.preventDefault(); done(b.value); } }, b.label))),
    ].filter(Boolean));
    function done(v) {
      dlg.close();
      if (v == null) return resolve(null);
      const out = { _: v };
      for (const [k, inp] of Object.entries(inputs)) out[k] = inp.value.trim();
      for (const f of fields) if (f.type === 'hue' || f.type === 'icon') {
        const c = form.querySelector(`input[name="${f.key}"]:checked`);
        out[f.key] = c ? (f.type === 'hue' ? Number(c.value) : c.value) : f.value;
      }
      resolve(out);
    }
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
    const first = Object.values(inputs)[0];
    if (first && !first.readOnly) { first.focus(); first.select(); }
  });
}
const confirmDlg = async (title, text, okLabel) =>
  !!(await ask({ title, text, buttons: [{ label: t('cancel'), value: null }, { label: okLabel || t('yes'), value: 'ok', primary: true }] }));
const note = (title, text) => ask({ title, text, buttons: [{ label: t('ok'), value: null }] });

function nodeMenu(e, n) {
  const x = allTabs.get(bindings[n.id]);
  const others = state.spaces.filter((s) => s.id !== find(n.id).space.id);
  showMenu(e, [
    n.type === 'link' && { label: t('openBg'), fn: () => openLink(n, true) },
    { label: n.type === 'link' ? t('edit') : t('rename'), fn: () => editNode(n) },
    n.type === 'link' && x && normUrl(x.url) !== normUrl(n.url) && { label: t('rememberUrl'), fn: () => { n.url = x.url; n.title = x.title || n.title; save(); render(); } },
    n.type === 'link' && { label: t('copyLink'), fn: () => navigator.clipboard.writeText(n.url) },
    ...(x && x.windowId === winId ? ['-', ...tabItems(targets(x), x)] : []),
    n.type === 'folder' && { label: t('openAll'), fn: () => walk(n.children, (c) => { if (c.type === 'link') openLink(c, true); }) },
    others.length && '-',
    ...others.map((s) => ({ label: t('moveTo', spaceLabel(s)), fn: () => { removeNode(n.id); s.items.push(n); save(); render(); syncGroups(); } })),
    '-',
    { label: t('delete'), danger: true, fn: async () => {
      if (n.type === 'folder' && n.children.length && !(await confirmDlg(t('delFolderQ'), t('delFolderText', n.title, countLinks(n.children)), t('delete')))) return;
      removeNode(n.id); save(); await refreshTabs(); render();
    } },
  ]);
}
/* ---------- группы и split view ---------- */
async function editGroup(g) {
  const hue = COLOR_HUE[g.color];
  const r = await ask({ title: t('group'), fields: [
    { key: 'title', label: t('name'), value: g.title || '' },
    { key: 'hue', label: t('color'), type: 'hue', value: hue == null ? -1 : hue },
  ] });
  if (!r) return;
  const upd = { title: r.title };
  if (r.hue > 0 && GROUP_COLORS[r.hue]) upd.color = GROUP_COLORS[r.hue];
  await chrome.tabGroups.update(g.id, upd).catch(() => {});
}
async function createGroup(tabs) {
  const ids = tabs.map((x) => x.id);
  const n = allGroups.size;
  const r = await ask({ title: t('newGroup'), fields: [
    { key: 'title', label: t('name'), value: '' },
    { key: 'hue', label: t('color'), type: 'hue', value: HUES[n % HUES.length] },
  ] });
  if (!r) return;
  try {
    const gid = await chrome.tabs.group({ tabIds: ids });
    await chrome.tabGroups.update(gid, { title: r.title, color: GROUP_COLORS[r.hue] || 'grey' });
  } catch (e) { note(t('failTitle'), String(e)); }
  clearSelect();
}
// открыть вкладку x рядом с текущей: Chrome требует соседства и одинаковой группы/закрепления
async function splitWith(x) {
  if (!canSplit()) return note(t('splitWith'), t('splitNeed'));
  const cur = winTabs.find((y) => y.active);
  if (!cur || cur.id === x.id) return;
  try {
    if (cur.splitViewId > NO_SPLIT) await chrome.tabs.unsplit(cur.splitViewId);
    if (x.splitViewId > NO_SPLIT) await chrome.tabs.unsplit(x.splitViewId);
    if (x.pinned !== cur.pinned) await chrome.tabs.update(x.id, { pinned: cur.pinned });
    if (x.windowId !== winId || x.groupId !== cur.groupId) {
      if (cur.groupId === NO_GROUP) { if (x.windowId !== winId) await chrome.tabs.move(x.id, { windowId: winId, index: -1 }); else await chrome.tabs.ungroup(x.id); }
      else await chrome.tabs.group({ tabIds: [x.id], groupId: cur.groupId });
    }
    const c = await chrome.tabs.get(cur.id), y = await chrome.tabs.get(x.id);
    await chrome.tabs.move(y.id, { index: y.index < c.index ? c.index : c.index + 1 });
    await chrome.tabs.createSplit([cur.id, x.id]);
    await chrome.tabs.update(cur.id, { active: true });
  } catch (e) { note(t('splitFail'), String(e)); }
  clearSelect();
}
function pinTab(x) {
  if (!x.url || boundTabIds().has(x.id)) return;
  const node = { id: uid(), type: 'link', title: x.title || x.url, url: x.url };
  space().items.push(node);
  bindings[node.id] = x.id;
}
// пункты меню для вкладок (одной или выделенных): группы, split, Space
function tabItems(tabs, x) {
  const n = tabs.length, ids = tabs.map((y) => y.id);
  const cur = winTabs.find((y) => y.active);
  const spaceNames = new Set(state.spaces.map((s) => s.name));
  const groups = [...allGroups.values()].filter((g) => g.windowId === winId && !(bySpace() && spaceNames.has(g.title)) && !tabs.every((y) => y.groupId === g.id));
  const grouped = tabs.some((y) => y.groupId !== NO_GROUP && !(bySpace() && spaceNames.has((allGroups.get(y.groupId) || {}).title)));
  return [
    { label: n > 1 ? t('createGroupN', n) : t('createGroup'), fn: () => createGroup(tabs) },
    ...groups.map((g) => ({ label: t('addToGroup', g.title || t('group')), fn: () => { chrome.tabs.group({ tabIds: ids, groupId: g.id }).catch(() => {}); clearSelect(); } })),
    grouped && { label: t('ungroup'), fn: () => { chrome.tabs.ungroup(ids).catch(() => {}); clearSelect(); } },
    '-',
    n === 1 && cur && cur.id !== x.id && { label: t('splitWith'), fn: () => splitWith(x) },
    n === 1 && x.splitViewId > NO_SPLIT && canSplit() && { label: t('unsplit'), fn: () => chrome.tabs.unsplit(x.splitViewId).catch(() => {}) },
    bySpace() && state.spaces.filter((s) => s.id !== activeId).length && '-',
    ...(bySpace() ? state.spaces.filter((s) => s.id !== activeId).map((s) => ({ label: t('moveTo', spaceLabel(s)), fn: () => {
      for (const id of ids) tabSpace[id] = s.id;
      clearSelect(); saveSession(); render(); syncGroups();
    } })) : []),
  ];
}
function tabMenu(e, x) {
  const tabs = targets(x);
  const n = tabs.length;
  showMenu(e, [
    ...tabItems(tabs, x),
    '-',
    { label: n > 1 ? t('pinTab') + ` (${n})` : t('pinTab'), fn: () => { for (const y of tabs) pinTab(y); clearSelect(); saveSession(); save(); render(); syncGroups(); } },
    { label: n > 1 ? t('closeN', n) : t('close'), danger: true, fn: () => { selected.clear(); chrome.tabs.remove(tabs.map((y) => y.id)); } },
  ]);
}
function groupMenu(e, g, tabs) {
  const ids = tabs.map((x) => x.id);
  showMenu(e, [
    { label: t('edit'), fn: () => editGroup(g) },
    { label: t('newTabInGroup'), fn: async () => { const x = await chrome.tabs.create({ index: tabs[tabs.length - 1].index + 1 }); chrome.tabs.group({ tabIds: [x.id], groupId: g.id }).catch(() => {}); } },
    { label: t('ungroup'), fn: () => chrome.tabs.ungroup(ids).catch(() => {}) },
    '-',
    { label: t('closeGroup'), danger: true, fn: () => chrome.tabs.remove(ids) },
  ]);
}

async function editNode(n) {
  const fields = [{ key: 'title', label: t('name'), value: n.title }];
  if (n.type === 'link') fields.push({ key: 'url', label: t('address'), value: n.url });
  const r = await ask({ title: n.type === 'link' ? t('bookmark') : t('folder'), fields });
  if (!r) return;
  if (r.title) n.title = r.title;
  if (n.type === 'link' && r.url) n.url = r.url;
  save(); render();
}
async function newFolder() {
  const r = await ask({ title: t('newFolder'), fields: [{ key: 'title', label: t('name'), value: t('folder') }] });
  if (!r) return;
  space().items.unshift({ id: uid(), type: 'folder', title: r.title || t('folder'), collapsed: false, children: [] });
  save(); render();
}
const spaceFields = (s) => [
  { key: 'name', label: t('name'), value: s.name },
  { key: 'icon', label: t('icon'), type: 'icon', value: s.icon },
  { key: 'hue', label: t('color'), type: 'hue', value: s.hue },
];
async function addSpace() {
  const n = state.spaces.length;
  const r = await ask({ title: t('newSpace'), fields: spaceFields({ name: '', icon: SPACE_ICONS[n % SPACE_ICONS.length], hue: HUES[n % HUES.length] }) });
  if (!r) return;
  const s = { id: uid(), name: r.name || t('space'), icon: r.icon, hue: r.hue, items: [] };
  state.spaces.push(s);
  switchSpace(s.id);
}
async function editSpace(s) {
  const r = await ask({ title: t('space'), fields: spaceFields(s) });
  if (!r) return;
  s.name = r.name || s.name; s.icon = r.icon || s.icon; s.hue = r.hue;
  save(); render(); syncGroups();
}
function spaceMenu(e, s) {
  const i = state.spaces.indexOf(s);
  const move = (d) => { state.spaces.splice(i, 1); state.spaces.splice(i + d, 0, s); save(); render(); };
  showMenu(e, [
    { label: t('edit'), fn: () => editSpace(s) },
    i > 0 && { label: t('moveLeft'), fn: () => move(-1) },
    i < state.spaces.length - 1 && { label: t('moveRight'), fn: () => move(1) },
    state.spaces.length > 1 && '-',
    state.spaces.length > 1 && { label: t('delSpace'), danger: true, fn: async () => {
      if (!(await confirmDlg(t('delSpaceQ'), t('delSpaceText', s.name, countLinks(s.items)), t('delete')))) return;
      state.spaces.splice(i, 1);
      if (activeId === s.id) activeId = state.spaces[Math.max(0, i - 1)].id;
      state.activeSpaceId = activeId;
      save(); await refreshTabs(); render(); syncGroups();
    } },
  ]);
}

/* ---------- import / export ---------- */
function pickFile() { const f = $('#file'); f.value = ''; f.click(); }
const importErr = (err) => note(t('failTitle'), String((err && err.stack) || err));

async function onFile(file) {
  const text = await file.text();
  if (/^\s*<|NETSCAPE-Bookmark/i.test(text.slice(0, 2000))) return addSpaces(parseBookmarksHtml(text));
  let json;
  try { json = JSON.parse(text); } catch (e) { return note(t('failTitle'), t('failNotFile', file.name)); }
  if (json && Array.isArray(json.spaces) && json.spaces.every((s) => s && s.id && Array.isArray(s.items))) {
    if (!pristine() && !(await confirmDlg(t('restoreQ'), t('restoreText', json.spaces.length), t('replace')))) return;
    state = migrate({ activeSpaceId: json.spaces[0].id, settings: state.settings, spaces: json.spaces });
    activeId = state.activeSpaceId;
    save(); await refreshTabs(); render(); syncGroups();
    return;
  }
  let found = [], err = '';
  try { found = parseArcSidebar(json); } catch (e) { err = String((e && e.stack) || e); }
  if (found.some((s) => s.items.length)) return addSpaces(found);
  let diag = '';
  try { diag = describeArcFile(json); } catch (e) { diag = 'describe failed: ' + e; }
  diag = `file: ${file.name} (${file.size} b)\nspaces parsed: ${found.length}\n${err ? 'error: ' + err + '\n' : ''}${diag}`;
  const r = await ask({
    title: t('failTitle'), text: t('failArc'),
    fields: [{ key: 'diag', label: t('diag'), type: 'area', value: diag }],
    buttons: [{ label: t('close'), value: null }, { label: t('copyDiag'), value: 'copy', primary: true }],
  });
  if (r) await navigator.clipboard.writeText(diag).catch(() => {});
}
async function addSpaces(found) {
  found = found.filter((s) => s.items.length);
  const total = found.reduce((a, s) => a + countLinks(s.items), 0);
  if (!found.length) return note(t('importTitle'), t('importNone'));
  const fresh = pristine();
  const r = await ask({
    title: t('importTitle'),
    text: t('importFound', found.length, found.map((s) => s.name).join(', '), total),
    buttons: [{ label: t('cancel'), value: null }, !fresh && { label: t('importReplace'), value: 'replace' }, { label: fresh ? t('importDo') : t('importAdd'), value: 'add', primary: true }].filter(Boolean),
  });
  if (!r) return;
  const base = r._ === 'replace' || fresh ? 0 : state.spaces.length;
  const spaces = found.map((s, i) => ({ id: uid(), name: s.name, icon: s.icon || 'circle', hue: HUES[(base + i) % HUES.length], items: s.items }));
  if (base === 0) state.spaces = spaces; else state.spaces.push(...spaces);
  activeId = state.activeSpaceId = spaces[0].id;
  save(); await refreshTabs(); render(); syncGroups();
}
function exportJson() {
  const blob = new Blob([JSON.stringify({ spaces: state.spaces }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `spaces-sidebar-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function mainMenu(e) {
  showMenu(e, [
    { label: t('importArc'), fn: pickFile },
    { label: t('importHtml'), fn: pickFile },
    '-',
    { label: bySpace() ? t('tabsBySpaceOff') : t('tabsBySpaceOn'), fn: () => setTabsBySpace(!bySpace()) },
    '-',
    { label: t('exportJson'), fn: exportJson },
    { label: t('restoreJson'), fn: pickFile },
  ]);
}

/* ---------- init ---------- */
function localize() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-ph]').forEach((e) => { e.placeholder = t(e.dataset.i18nPh); });
  document.querySelectorAll('[data-icon]').forEach((e) => e.append(icon(e.dataset.icon)));
}
async function init() {
  localize();
  winId = (await chrome.windows.getCurrent()).id;
  state = migrate((await chrome.storage.local.get('state')).state || defaults());
  activeId = state.activeSpaceId;
  const ses = await chrome.storage.session.get(['bindings', 'tabSpace', 'gcol']);
  bindings = ses.bindings || {};
  tabSpace = ses.tabSpace || {};
  gcol = ses.gcol || {};
  await refreshTabs();
  render();
  syncGroups();

  for (const ev of ['onCreated', 'onRemoved', 'onUpdated', 'onActivated', 'onMoved', 'onAttached', 'onDetached', 'onReplaced'])
    chrome.tabs[ev].addListener(tabsChanged);
  for (const ev of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved']) chrome.tabGroups[ev].addListener(tabsChanged);
  chrome.tabs.onCreated.addListener((x) => {
    if (bySpace() && x.windowId === winId && !tabSpace[x.id]) { tabSpace[x.id] = activeId; saveSession(); }
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.state && ch.state.newValue && JSON.stringify(ch.state.newValue) !== lastSaved) {
      state = migrate(ch.state.newValue); lastSaved = JSON.stringify(state);
      if (!state.spaces.some((s) => s.id === activeId)) activeId = state.spaces[0].id;
      render();
    }
    if (area === 'session') {
      if (ch.bindings) bindings = ch.bindings.newValue || {};
      if (ch.tabSpace) tabSpace = ch.tabSpace.newValue || {};
      render();
    }
  });

  $('#search').addEventListener('input', (e) => { filter = e.target.value; render(); });
  $('#search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const r = document.querySelector('#pinned .row.link, #tabs .row'); if (r) r.click(); }
    if (e.key === 'Escape') { e.target.value = ''; filter = ''; render(); }
  });
  $('#spaceTitle').addEventListener('click', () => editSpace(space()));
  $('#pinCurrent').addEventListener('click', pinCurrent);
  $('#newFolder').addEventListener('click', newFolder);
  $('#menuBtn').addEventListener('click', mainMenu);
  $('#newTab').addEventListener('click', () => chrome.tabs.create({}));
  $('#clearTabs').addEventListener('click', async () => {
    const taken = boundTabIds();
    const ids = winTabs.filter((x) => !taken.has(x.id) && !x.active && !x.pinned && (!bySpace() || spaceOfTab(x) === activeId)).map((x) => x.id);
    if (ids.length && (await confirmDlg(t('closeTabsQ'), t('closeTabsText', ids.length), t('close')))) chrome.tabs.remove(ids);
  });
  $('#file').addEventListener('change', (e) => { if (e.target.files[0]) onFile(e.target.files[0]).catch(importErr); });

  // бросок в пустое место списка закладок = в конец Space
  const pinned = $('#pinned');
  pinned.addEventListener('dragover', (e) => { if (drag) { e.preventDefault(); clearDrop(); pinned.classList.add('drop-root'); } });
  pinned.addEventListener('drop', (e) => { if (!drag) return; e.preventDefault(); clearDrop(); doDrop(null); });
  // бросок закладки в «Открытые вкладки» = открепить (вкладка остаётся)
  const tabsEl = $('#tabs');
  tabsEl.addEventListener('dragover', (e) => {
    const f = drag && drag.kind === 'node' && find(drag.id);
    if (f && f.node.type === 'link' && bindings[drag.id]) { e.preventDefault(); clearDrop(); tabsEl.classList.add('drop-root'); }
  });
  tabsEl.addEventListener('drop', async (e) => {
    if (!drag || drag.kind !== 'node') return;
    e.preventDefault(); clearDrop();
    const f = find(drag.id);
    if (bySpace() && bindings[drag.id]) tabSpace[bindings[drag.id]] = f.space.id;
    removeNode(drag.id); drag = null;
    saveSession(); save(); await refreshTabs(); render();
  });
  // файл импорта можно бросить в любое место панели
  document.addEventListener('dragover', (e) => {
    if (drag || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); document.body.classList.add('filedrag');
  });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('filedrag'); });
  document.addEventListener('drop', (e) => {
    document.body.classList.remove('filedrag');
    if (drag || !e.dataTransfer.files.length) return;
    e.preventDefault();
    onFile(e.dataTransfer.files[0]).catch(importErr);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ctx') && !e.target.closest('#menuBtn')) $('#ctx').hidden = true;
    if (!e.target.closest('.row, #ctx, dialog, footer') && !e.metaKey && !e.ctrlKey) clearSelect();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#dlg').open) { clearSelect(); $('#ctx').hidden = true; } });
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea, code')) e.preventDefault(); });
  window.addEventListener('blur', () => { $('#ctx').hidden = true; });

  // свайп двумя пальцами влево/вправо — переключение Spaces
  let acc = 0, cool = 0, resetT;
  document.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 2) return;
    acc += e.deltaX;
    clearTimeout(resetT);
    resetT = setTimeout(() => { acc = 0; }, 200);
    if (Math.abs(acc) > 120 && Date.now() > cool) {
      stepSpace(acc > 0 ? 1 : -1);
      acc = 0; cool = Date.now() + 600;
    }
  }, { passive: true });
}
init();
