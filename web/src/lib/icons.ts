const PATHS: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  map: '<path d="M3 6.5 9 4.5l6 2 6-2v13l-6 2-6-2-6 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  city: '<path d="M4 21V10h6v11M14 21V4h6v17"/><path d="M2 21h20"/>',
  bowl: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M9 7.6c0-1.7 1.1-2.1 1.1-3.6M14 7.6c0-1.7 1.1-2.1 1.1-3.6"/>',
  camera: '<path d="M4 8h3l1.5-2.2h7L17 8h3v11H4z"/><circle cx="12" cy="13.4" r="3.2"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.7l5.8-.8z"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  trash: '<path d="M4 7h16M9 7V4.8h6V7M7 7l1 13h8l1-13"/>',
  again: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4.5V9h-4.5"/>',
  pin: '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-.7 4.4M20 5v6h-6"/>',
};

export type IconName = keyof typeof PATHS;

export function iconPaths(name: string): string {
  return PATHS[name] ?? '';
}
