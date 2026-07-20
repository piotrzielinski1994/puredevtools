export const resolveRewrite = (originalUrl: string, target: string): string => {
  if (target.trim() === '') return originalUrl;
  try {
    const original = new URL(originalUrl);
    const resolved = new URL(target, originalUrl);
    const isOriginOnly = resolved.pathname === '/' && resolved.search === '' && resolved.hash === '';
    if (isOriginOnly) return resolved.origin + original.pathname + original.search + original.hash;
    if (resolved.search === '') resolved.search = original.search;
    if (resolved.hash === '') resolved.hash = original.hash;
    return resolved.toString();
  } catch {
    return originalUrl;
  }
};
