# Spaces Sidebar

An Arc-style sidebar for Chrome: Spaces, folders and pinned tabs, in Chrome's native side panel.

Arc stops working on December 22, 2026. This extension keeps the part of it that was about people rather than AI: a vertical list of pinned tabs, grouped into Spaces, each of which opens in its own tab.

Not affiliated with The Browser Company.

## What it does

- **Spaces.** Icons at the bottom of the panel, each with its own color. Click or two-finger swipe to switch.
- **Pinned tabs and folders.** Click opens the page in a tab; the next click returns to that same tab instead of opening a duplicate. Closing the tab keeps the pin.
- **Open tabs.** The unpinned tabs of the window sit below the pins. Drag one up to pin it, drag it onto a Space icon to move it there.
- **Tab groups.** Chrome tab groups show up among the open tabs as folders outlined in the group's color. Ctrl/Cmd+click selects several tabs; right-click creates a group from them, adds them to an existing group, ungroups or closes them. Drag a tab onto a group header to add it. The group appears in Chrome's tab strip too.
- **Split view.** Right-click a tab (or an open pin) and choose "Open side by side with current tab" to put both into Chrome's split view. Needs Chrome 155 or newer.
- **Tabs per Space (optional).** Each Space gets a Chrome tab group; switching Spaces collapses the others. Off by default, toggle it in the menu.
- **Import from Arc.** Drop `StorableSidebar.json` on the panel. Spaces, folders, pinned tabs and Favorites come over. Also imports a standard `bookmarks.html`.
- **Backup.** Export and restore as JSON.
- Search across all Spaces, drag-and-drop ordering, light and dark themes, English and Russian UI.

## Install

The extension is not in the Chrome Web Store. It installs from this repository in about a minute and works in Chrome, Edge, Brave and other Chromium browsers with a side panel (Chrome 116+).

1. Download the code: [spacessidebar-main.zip](https://github.com/kirsantov/spacessidebar/archive/refs/heads/main.zip), or `git clone https://github.com/kirsantov/spacessidebar.git`.
2. Unzip it somewhere permanent. Chrome loads the extension from this folder every time, so do not leave it in Downloads if you clean that up.
3. Open `chrome://extensions`.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and select the unzipped folder, the one that contains `manifest.json`.
6. Pin the extension: puzzle icon in the toolbar, then the pin next to Spaces Sidebar.
7. Click the icon or press Alt+S. The panel opens on the side.

To move the panel to the left, open Chrome settings, Appearance, Side panel position.

To change the shortcut, open `chrome://extensions/shortcuts`.

### Update

With git: `git pull`, then press the reload arrow on the extension's card in `chrome://extensions`.

Without git: download the zip again, replace the folder contents, press the reload arrow. Your Spaces live in the browser's storage, not in the folder, so they survive an update. They do not survive removing the extension: export a backup first (menu, Export backup).

### Установка (по-русски)

1. Скачайте [архив](https://github.com/kirsantov/spacessidebar/archive/refs/heads/main.zip) и распакуйте в постоянную папку.
2. Откройте `chrome://extensions`, включите «Режим разработчика».
3. Нажмите «Загрузить распакованное расширение» и выберите папку, в которой лежит `manifest.json`.
4. Закрепите иконку расширения на панели и нажмите её (или Alt+S).

Обновление: заменить содержимое папки (или `git pull`) и нажать стрелку перезагрузки на карточке расширения. Spaces хранятся в браузере и при обновлении сохраняются; перед удалением расширения сделайте экспорт бэкапа из меню.

## Importing from Arc

An extension cannot read files outside the browser sandbox, so there is one manual step: give it the file.

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Arc/StorableSidebar.json` |
| Windows | `%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_ttt1ap7aakyb4\LocalCache\Local\Arc\StorableSidebar.json` |

On macOS, `open -R "$HOME/Library/Application Support/Arc/StorableSidebar.json"` reveals the file in Finder; drag it onto the panel. The empty panel shows the same instructions with copy buttons.

The file is parsed locally. If the import finds nothing, the error dialog offers a diagnostics dump that contains only the file's structure (key names and counts, no URLs or titles) — attach it to an issue.

## Limits

- The link between a pin and its tab lives until the browser restarts. After that a pin re-attaches to an open tab only if the URL matches exactly.
- Chrome's own tab strip stays where it is. "Tabs per Space" tidies it with tab groups but cannot hide it.
- Unpinned ("Today") tabs and Arc themes are not imported. Split views become ordinary pins.
- No sync between devices yet; use the JSON backup.

## Development

No build step. Plain JS, Manifest V3.

- `panel.js` — UI and state
- `arc-import.js` — `StorableSidebar.json` and `bookmarks.html` parsers
- `icons.js` — icon set
- `_locales/` — UI strings
- `scripts/pack.sh` — builds a zip with only the extension files

## Privacy

No network requests, no analytics, no accounts. See [PRIVACY.md](PRIVACY.md).

## License

MIT
