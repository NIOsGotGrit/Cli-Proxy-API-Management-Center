/** Desktop uses the bounded content pane; mobile pages grow with the document. */
export function resolvePageScrollContainer(content: HTMLElement | null): HTMLElement | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return content;
  if (content && content.clientHeight <= window.innerHeight + 1) return content;
  return document.scrollingElement as HTMLElement | null;
}
