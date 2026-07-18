export const resolveUrl = (url: string): string => {
  try {
    return new URL(url, globalThis.location?.href).toString();
  } catch {
    return url;
  }
};
