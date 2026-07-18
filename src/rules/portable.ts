import { portableSchema, type PortableState } from './schema';
import type { TreeNode } from './model';
import { bodyToDisk, diskToBody } from './body-codec';

export type ImportResult =
  | { ok: true; state: PortableState }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const encodeNode = (node: TreeNode): unknown => {
  if (node.kind === 'folder') {
    return { ...node, children: node.children.map(encodeNode) };
  }
  return {
    kind: 'rule',
    rule: {
      ...node.rule,
      actions: node.rule.actions.map((action) =>
        action.type === 'rewriteBody' ? { ...action, body: bodyToDisk(action.body) } : action,
      ),
    },
  };
};

const decodeAction = (action: unknown): unknown => {
  if (!isRecord(action) || action.type !== 'rewriteBody') return action;
  return { ...action, body: diskToBody(action.body) };
};

const decodeNode = (node: unknown): unknown => {
  if (!isRecord(node)) return node;
  if (node.kind === 'folder' && Array.isArray(node.children)) {
    return { ...node, children: node.children.map(decodeNode) };
  }
  if (node.kind === 'rule' && isRecord(node.rule) && Array.isArray(node.rule.actions)) {
    return { ...node, rule: { ...node.rule, actions: node.rule.actions.map(decodeAction) } };
  }
  return node;
};

const decodeBodies = (value: unknown): unknown => {
  if (!isRecord(value) || !Array.isArray(value.workspace)) return value;
  return { ...value, workspace: value.workspace.map(decodeNode) };
};

export const exportRules = (state: PortableState): string =>
  JSON.stringify({ enabled: state.enabled, workspace: state.workspace.map(encodeNode) }, null, 2);

export const importRules = (json: string): ImportResult => {
  const parsed = parseJson(json);
  if (!parsed.ok) return parsed;
  const result = portableSchema.safeParse(decodeBodies(parsed.value));
  if (!result.success) return { ok: false, error: result.error.message };
  return { ok: true, state: result.data };
};

const parseJson = (json: string): { ok: true; value: unknown } | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};
