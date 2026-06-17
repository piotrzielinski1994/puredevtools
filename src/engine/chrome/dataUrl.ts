export type MockResponse = {
  status: number;
  body: string;
  contentType?: string;
};

export const encodeDataUrl = (response: MockResponse): string => {
  const mediaType = response.contentType ?? 'text/plain';
  return `data:${mediaType},${encodeURIComponent(response.body)}`;
};
