/**
 * Minimal hash routing for the two platform pages — the plant overview
 * (`#/plant`) and a per-section workspace (`#/section/:id`). Kept dependency-
 * free (no router library) since there are exactly two page shapes sharing one
 * R3F scene; the store owns the route and this module only parses/formats it.
 */

export interface Route {
  page: 'plant' | 'section';
  sectionId: string | null;
}

export const PLANT_ROUTE: Route = { page: 'plant', sectionId: null };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const m = /^\/section\/(.+)$/.exec(h);
  if (m) return { page: 'section', sectionId: decodeURIComponent(m[1]) };
  return PLANT_ROUTE;
}

export function formatHash(route: Route): string {
  if (route.page === 'section' && route.sectionId) {
    return `#/section/${encodeURIComponent(route.sectionId)}`;
  }
  return '#/plant';
}

export function routesEqual(a: Route, b: Route): boolean {
  return a.page === b.page && a.sectionId === b.sectionId;
}
