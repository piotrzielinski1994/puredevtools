const isJsonObjectOrArray = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
};

export const bodyToDisk = (body: string): unknown => {
  if (isJsonObjectOrArray(body)) return JSON.parse(body);
  return body;
};

export const diskToBody = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
};
