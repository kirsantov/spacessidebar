// Разбор StorableSidebar.json из Arc -> [{name, icon, items:[{type:'link'|'folder',...}]}]
(function (g) {
  const pairsToMap = (arr) => {
    const m = new Map();
    for (let x of arr || []) {
      if (x && typeof x === 'object' && !x.id && x.value && x.value.id) x = x.value; // формат синхронизации
      if (x && typeof x === 'object' && x.id) m.set(x.id, x);
    }
    return m;
  };
  const uid = () => (g.crypto && g.crypto.randomUUID ? g.crypto.randomUUID() : 'n' + Math.random().toString(36).slice(2));

  function parseArcSidebar(json) {
    const containers = [...((json && json.sidebar && json.sidebar.containers) || [])];
    const sync = json && json.firebaseSyncState && json.firebaseSyncState.syncData;
    if (sync && !containers.some((c) => c && Array.isArray(c.items) && Array.isArray(c.spaces) && c.spaces.length))
      containers.push({ spaces: sync.spaceModels || sync.spaces, items: sync.items });
    const out = [];
    for (const c of containers) {
      if (!c || !Array.isArray(c.items) || !Array.isArray(c.spaces)) continue;
      const items = pairsToMap(c.items);
      const spaces = [...pairsToMap(c.spaces).values()];
      const seen = new Set();
      const byParent = new Map();
      for (const it of items.values()) {
        if (!it.parentID) continue;
        if (!byParent.has(it.parentID)) byParent.set(it.parentID, []);
        byParent.get(it.parentID).push(it.id);
      }

      const build = (id) => {
        const it = items.get(id);
        if (!it || seen.has(id)) return [];
        seen.add(id);
        const d = it.data || {};
        const kids = () => ((it.childrenIds && it.childrenIds.length ? it.childrenIds : byParent.get(id)) || []).flatMap(build);
        if (d.tab && d.tab.savedURL) {
          return [{ id: uid(), type: 'link', title: it.title || d.tab.savedTitle || d.tab.savedURL, url: d.tab.savedURL }];
        }
        if (d.list) {
          return [{ id: uid(), type: 'folder', title: it.title || 'Папка', collapsed: true, children: kids() }];
        }
        return kids(); // splitView, itemContainer и пр. — просто разворачиваем
      };

      const pinnedId = (sp) => {
        const n = sp.newContainerIDs || [];
        for (let i = 0; i < n.length - 1; i++)
          if (n[i] && typeof n[i] === 'object' && 'pinned' in n[i] && typeof n[i + 1] === 'string') return n[i + 1];
        const o = sp.containerIDs || [];
        const i = o.indexOf('pinned');
        return i >= 0 ? o[i + 1] : null;
      };

      const result = spaces.map((sp) => {
        const ic = (sp.customInfo && sp.customInfo.iconType) || {};
        let icon = ic.emoji_v2 || null;
        if (!icon && typeof ic.emoji === 'number') { try { icon = String.fromCodePoint(ic.emoji); } catch (e) {} }
        if (!icon && ic.icon) icon = (g.ARC_ICON_MAP || {})[ic.icon] || null;
        const pid = pinnedId(sp);
        return { name: sp.title || 'Space', icon: icon || 'circle', items: pid ? build(pid) : [] };
      });

      // Favorites (top apps) — в папку в первом Space
      const fav = [];
      const top = c.topAppsContainerIDs || [];
      for (const x of top) if (typeof x === 'string') fav.push(...build(x));
      for (const it of items.values()) {
        const ct = it.data && it.data.itemContainer && it.data.itemContainer.containerType;
        if (ct && 'topApps' in ct) fav.push(...build(it.id));
      }
      if (fav.length && result.length)
        result[0].items.unshift({ id: uid(), type: 'folder', title: 'Favorites', collapsed: false, children: fav });
      out.push(...result);
    }
    return out;
  }
  // Безличная сводка структуры файла — чтобы понять, почему импорт ничего не нашёл
  function describeArcFile(json) {
    const t = (v) => (Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v);
    const keys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).slice(0, 12).map((k) => `${k}:${t(o[k])}`).join(', ') : t(o));
    const lines = [`top: ${keys(json)}`, `version: ${json && json.version}`];
    const cs = (json && json.sidebar && json.sidebar.containers) || [];
    lines.push(`sidebar: ${keys(json && json.sidebar)}`);
    cs.forEach((c, i) => {
      lines.push(`c${i}: ${keys(c)}`);
      const sp = (c && c.spaces || []).find((x) => x && typeof x === 'object');
      if (sp) lines.push(`  space: ${keys(sp)}; newContainerIDs: ${JSON.stringify((sp.newContainerIDs || []).map((x) => (typeof x === 'string' ? 'id' : x))).slice(0, 200)}; containerIDs: ${JSON.stringify((sp.containerIDs || []).map((x, j) => (j % 2 ? 'id' : x))).slice(0, 120)}`);
      const its = (c && c.items || []).filter((x) => x && typeof x === 'object');
      if (its.length) {
        const kinds = {};
        for (const it of its) { const k = Object.keys((it.value || it).data || {}).join('+') || '∅'; kinds[k] = (kinds[k] || 0) + 1; }
        lines.push(`  item: ${keys(its[0])}; data kinds: ${JSON.stringify(kinds)}`);
        const tab = its.find((x) => x.data && x.data.tab);
        if (tab) lines.push(`  tab: ${Object.keys(tab.data.tab).join(',')}`);
      }
    });
    const fs = json && json.firebaseSyncState;
    if (fs) lines.push(`firebaseSyncState: ${keys(fs)}; syncData: ${keys(fs.syncData)}`);
    return lines.join('\n');
  }

  // Стандартный bookmarks.html (Netscape): папки верхнего уровня -> Spaces
  function parseBookmarksHtml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const readDl = (dl) => {
      const out = [];
      for (const dt of dl.children) {
        if (dt.tagName !== 'DT') continue;
        const a = dt.querySelector(':scope > a'), h3 = dt.querySelector(':scope > h3');
        const sub = dt.querySelector(':scope > dl') || (dt.nextElementSibling && dt.nextElementSibling.tagName === 'DL' ? dt.nextElementSibling : null);
        if (a && /^https?:/i.test(a.getAttribute('href') || '')) out.push({ id: uid(), type: 'link', title: a.textContent.trim() || a.href, url: a.getAttribute('href') });
        else if (h3) out.push({ id: uid(), type: 'folder', title: h3.textContent.trim() || 'Папка', collapsed: true, children: sub ? readDl(sub) : [] });
      }
      return out;
    };
    const root = doc.querySelector('dl');
    if (!root) return [];
    let top = readDl(root);
    // типичная обёртка «Bookmarks bar» с единственной папкой — разворачиваем
    while (top.length === 1 && top[0].type === 'folder' && top[0].children.some((c) => c.type === 'folder')) top = top[0].children;
    const spaces = top.filter((n) => n.type === 'folder').map((f) => ({ name: f.title, icon: 'circle', items: f.children }));
    const loose = top.filter((n) => n.type === 'link');
    if (loose.length) spaces.unshift({ name: 'Импорт', icon: 'circle', items: loose });
    return spaces;
  }
  g.parseArcSidebar = parseArcSidebar;
  g.describeArcFile = describeArcFile;
  g.parseBookmarksHtml = parseBookmarksHtml;
})(typeof globalThis !== 'undefined' ? globalThis : this);
