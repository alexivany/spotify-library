export type SearchParamsPatch = Record<string, string | number | boolean | string[] | undefined | null>;

export function buildSearchParams(current: URLSearchParams, patch: SearchParamsPatch): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      next.delete(key);
    } else if (Array.isArray(value)) {
      next.set(key, value.join(","));
    } else {
      next.set(key, String(value));
    }
  }
  return next;
}
