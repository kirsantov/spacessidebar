// Набор штриховых иконок 24×24. Ключ хранится в space.icon.
const ICONS = {
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  grid: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  book: 'M5 7.5a3 3 0 0 1 3-3h10V17H8a3 3 0 0 0-3 3zM5 20a3 3 0 0 0 3 0h10v-3',
  tools: 'M14.5 6.5a4 4 0 0 0-5.2 5.2L4 17l3 3 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  triangle: 'M12 4.5L20.5 19h-17z',
  flag: 'M6 21V4M6 5h11l-2 4 2 4H6',
  server: 'M4 5h16v6H4zM4 13h16v6H4zM7.5 8h.01M7.5 16h.01',
  skull: 'M12 3.5a7.5 7.5 0 0 0-4.5 13.5V20h9v-3A7.5 7.5 0 0 0 12 3.5zM9.2 11.5h.01M14.8 11.5h.01M10.5 20v-2M13.5 20v-2',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  briefcase: 'M4 8h16v11H4zM9 8V5.5h6V8M4 13h16',
  code: 'M9 8l-4.5 4L9 16M15 8l4.5 4L15 16',
  music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  globe: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5S9.5 5.8 12 3.5z',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14zM5 19l7-7',
  flask: 'M9.5 4h5M10.5 4v5.5L5 19a1 1 0 0 0 .9 1.5h12.2A1 1 0 0 0 19 19l-5.5-9.5V4M7.5 15h9',
  plane: 'M3.5 11.5l17-7-7 17-2.5-7.5z',
  cart: 'M3.5 5h2.5l2.2 10h9.3l2-7H7M9.5 19h.01M16.5 19h.01',
  circle: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z',
  square: 'M5 5h14v14H5z',
  bulb: 'M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V17h5.4v-1c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3.5z',
  chat: 'M4.5 5.5h15v10.5H11l-4.5 3.5V16h-2z',
  // служебные
  plus: 'M12 5v14M5 12h14',
  folder: 'M3.5 6.5h6l2 2.5h9v10h-17z',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  close: 'M7 7l10 10M17 7L7 17',
  chevron: 'M9.5 6l6 6-6 6',
  upload: 'M12 16V4.5M7.5 9L12 4.5 16.5 9M4.5 19.5h15',
  copy: 'M9 9h10.5v10.5H9zM5 15V4.5h10.5',
};
const SPACE_ICONS = ['star', 'moon', 'grid', 'book', 'tools', 'bolt', 'triangle', 'flag', 'server', 'skull', 'home', 'briefcase',
  'code', 'music', 'heart', 'globe', 'leaf', 'flask', 'plane', 'cart', 'circle', 'square', 'bulb', 'chat'];
// имена иконок Arc -> наши
const ARC_ICON_MAP = {
  star: 'star', moon: 'moon', grid: 'grid', book: 'book', construction: 'tools', build: 'tools', hammer: 'tools', flash: 'bolt',
  triangle: 'triangle', flag: 'flag', server: 'server', skull: 'skull', home: 'home', briefcase: 'briefcase', code: 'code',
  terminal: 'code', musicalNotes: 'music', musicalNote: 'music', heart: 'heart', planet: 'globe', globe: 'globe', earth: 'globe',
  leaf: 'leaf', flask: 'flask', beaker: 'flask', airplane: 'plane', paperPlane: 'plane', cart: 'cart', bag: 'cart',
  square: 'square', bulb: 'bulb', chatbubble: 'chat', chatbubbles: 'chat', mail: 'chat',
};
if (typeof globalThis !== 'undefined') Object.assign(globalThis, { ICONS, SPACE_ICONS, ARC_ICON_MAP });
