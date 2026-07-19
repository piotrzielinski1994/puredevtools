import type { HeaderOp } from '../../rules/model';

export const applyHeaderOps = (headers: Headers, ops: HeaderOp[]): void => {
  ops.forEach((op) => {
    if (op.op === 'set') headers.set(op.name, op.value);
    else headers.delete(op.name);
  });
};

export const parseHeaders = (raw: string): Headers => {
  const headers = new Headers();
  raw
    .trim()
    .split(/[\r\n]+/)
    .forEach((line) => {
      const index = line.indexOf(':');
      if (index === -1) return;
      headers.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
    });
  return headers;
};
