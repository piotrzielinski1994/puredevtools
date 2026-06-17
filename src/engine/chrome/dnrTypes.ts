export type DnrHeaderOperation =
  | { header: string; operation: 'set'; value: string }
  | { header: string; operation: 'remove' };

export type DnrActionType = 'block' | 'redirect' | 'modifyHeaders';

export type DnrAction = {
  type: DnrActionType;
  redirect?: { url: string };
  requestHeaders?: DnrHeaderOperation[];
  responseHeaders?: DnrHeaderOperation[];
};

export type DnrCondition = {
  urlFilter?: string;
  regexFilter?: string;
  requestMethods?: string[];
  resourceTypes?: string[];
};

export type DnrRule = {
  id: number;
  priority: number;
  action: DnrAction;
  condition: DnrCondition;
};
