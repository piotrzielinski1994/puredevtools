export type TreeFolder<Leaf> = {
  kind: 'folder';
  id: string;
  name: string;
  collapsed: boolean;
  children: Array<Leaf | TreeFolder<Leaf>>;
};

export type MoveTarget = { parentId: string | null; index: number };

export type NodeLocation = { parentId: string | null; index: number };

export type DropPosition = 'before' | 'after' | 'inside';

const EMPTY_ZONE_PREFIX = 'empty-zone:';

export const emptyZoneId = (folderId: string): string => `${EMPTY_ZONE_PREFIX}${folderId}`;

export const parseEmptyZoneId = (id: string): string | null =>
  id.startsWith(EMPTY_ZONE_PREFIX) ? id.slice(EMPTY_ZONE_PREFIX.length) : null;

export const ROOT_ZONE_ID = 'root-zone';

export const projectDropPosition = (
  pointerY: number,
  rect: { top: number; height: number },
  isFolder: boolean,
): DropPosition => {
  if (rect.height <= 0) return 'before';
  const fraction = (pointerY - rect.top) / rect.height;
  if (!isFolder) return fraction < 0.5 ? 'before' : 'after';
  if (fraction < 0.25) return 'before';
  if (fraction > 0.75) return 'after';
  return 'inside';
};

const isFolderNode = <Leaf extends { kind: string }>(
  node: Leaf | TreeFolder<Leaf>,
): node is TreeFolder<Leaf> => node.kind === 'folder';

export const findNodeBy = <Leaf extends { kind: string }>(
  tree: Array<Leaf | TreeFolder<Leaf>>,
  id: string,
  nodeId: (node: Leaf | TreeFolder<Leaf>) => string,
): Leaf | TreeFolder<Leaf> | undefined => {
  const direct = tree.find((node) => nodeId(node) === id);
  if (direct) return direct;
  return tree
    .filter(isFolderNode)
    .map((folder) => findNodeBy(folder.children, id, nodeId))
    .find((found): found is Leaf | TreeFolder<Leaf> => found !== undefined);
};

export const locateNodeBy = <Leaf extends { kind: string }>(
  tree: Array<Leaf | TreeFolder<Leaf>>,
  id: string,
  nodeId: (node: Leaf | TreeFolder<Leaf>) => string,
  parentId: string | null = null,
): NodeLocation | null => {
  const index = tree.findIndex((node) => nodeId(node) === id);
  if (index !== -1) return { parentId, index };
  return (
    tree
      .filter(isFolderNode)
      .map((folder) => locateNodeBy(folder.children, id, nodeId, folder.id))
      .find((found): found is NodeLocation => found !== null) ?? null
  );
};

export const dropTargetBy = <Leaf extends { kind: string }>(
  tree: Array<Leaf | TreeFolder<Leaf>>,
  dragId: string,
  overId: string,
  position: DropPosition,
  nodeId: (node: Leaf | TreeFolder<Leaf>) => string,
): MoveTarget | null => {
  if (overId === ROOT_ZONE_ID) return { parentId: null, index: tree.length };
  const emptyZoneFolderId = parseEmptyZoneId(overId);
  if (emptyZoneFolderId !== null) {
    const folder = findNodeBy(tree, emptyZoneFolderId, nodeId);
    if (!folder || !isFolderNode(folder)) return null;
    return { parentId: emptyZoneFolderId, index: folder.children.length };
  }
  if (position === 'inside') {
    const over = findNodeBy(tree, overId, nodeId);
    if (!over || !isFolderNode(over)) return null;
    return { parentId: overId, index: over.children.length };
  }
  const location = locateNodeBy(tree, overId, nodeId);
  if (!location) return null;
  const rawIndex = position === 'before' ? location.index : location.index + 1;
  const dragLocation = locateNodeBy(tree, dragId, nodeId);
  const isSameParent = dragLocation !== null && dragLocation.parentId === location.parentId;
  const index = isSameParent && dragLocation.index < rawIndex ? rawIndex - 1 : rawIndex;
  return { parentId: location.parentId, index };
};

export type IdMinters = {
  folderId(): string;
  leafId(baseId: string): string;
};

export type LeafConfig<Leaf extends { kind: string }, Payload> = {
  leafId(leaf: Leaf): string;
  payloadId(payload: Payload): string;
  toLeaf(payload: Payload): Leaf;
  fromLeaf(leaf: Leaf): Payload;
  cloneLeaf(leaf: Leaf, newId: string, renameTop: boolean): Leaf;
};

const isFolder = <Leaf extends { kind: string }>(
  node: Leaf | TreeFolder<Leaf>,
): node is TreeFolder<Leaf> => node.kind === 'folder';

export type TreeOps<Leaf extends { kind: string }, Payload> = {
  nodeId(node: Leaf | TreeFolder<Leaf>): string;
  flatten(tree: Array<Leaf | TreeFolder<Leaf>>): Payload[];
  findNode(tree: Array<Leaf | TreeFolder<Leaf>>, id: string): Leaf | TreeFolder<Leaf> | undefined;
  containsId(node: Leaf | TreeFolder<Leaf>, id: string): boolean;
  removeNode(
    tree: Array<Leaf | TreeFolder<Leaf>>,
    id: string,
  ): { tree: Array<Leaf | TreeFolder<Leaf>>; node?: Leaf | TreeFolder<Leaf> };
  insertNode(
    tree: Array<Leaf | TreeFolder<Leaf>>,
    toInsert: Leaf | TreeFolder<Leaf>,
    target: MoveTarget,
  ): Array<Leaf | TreeFolder<Leaf>>;
  moveNode(tree: Array<Leaf | TreeFolder<Leaf>>, dragId: string, target: MoveTarget): Array<Leaf | TreeFolder<Leaf>>;
  renameFolder(tree: Array<Leaf | TreeFolder<Leaf>>, id: string, name: string): Array<Leaf | TreeFolder<Leaf>>;
  toggleCollapse(tree: Array<Leaf | TreeFolder<Leaf>>, id: string): Array<Leaf | TreeFolder<Leaf>>;
  walkLeafIds(tree: Array<Leaf | TreeFolder<Leaf>>): string[];
  updateLeafInTree(tree: Array<Leaf | TreeFolder<Leaf>>, payload: Payload): Array<Leaf | TreeFolder<Leaf>>;
  collectFolderIds(tree: Array<Leaf | TreeFolder<Leaf>>): Set<string>;
  newFolderId(tree: Array<Leaf | TreeFolder<Leaf>>): string;
  addFolderNode(tree: Array<Leaf | TreeFolder<Leaf>>, parentId: string | null, id: string): Array<Leaf | TreeFolder<Leaf>>;
  duplicateNode(tree: Array<Leaf | TreeFolder<Leaf>>, id: string): Array<Leaf | TreeFolder<Leaf>>;
  locateNode(tree: Array<Leaf | TreeFolder<Leaf>>, id: string, parentId?: string | null): NodeLocation | null;
  dropTarget(
    tree: Array<Leaf | TreeFolder<Leaf>>,
    dragId: string,
    overId: string,
    position: DropPosition,
  ): MoveTarget | null;
};

export const createTreeOps = <Leaf extends { kind: string }, Payload>(
  config: LeafConfig<Leaf, Payload>,
): TreeOps<Leaf, Payload> => {
  type Node = Leaf | TreeFolder<Leaf>;

  const nodeId = (node: Node): string => (isFolder(node) ? node.id : config.leafId(node));

  const flatten = (tree: Node[]): Payload[] =>
    tree.flatMap((node) => (isFolder(node) ? flatten(node.children) : [config.fromLeaf(node)]));

  const findNode = (tree: Node[], id: string): Node | undefined => {
    const direct = tree.find((node) => nodeId(node) === id);
    if (direct) return direct;
    return tree
      .filter(isFolder)
      .map((folder) => findNode(folder.children, id))
      .find((found): found is Node => found !== undefined);
  };

  const containsId = (node: Node, id: string): boolean => {
    if (nodeId(node) === id) return true;
    if (!isFolder(node)) return false;
    return node.children.some((child) => containsId(child, id));
  };

  const removeNode = (tree: Node[], id: string): { tree: Node[]; node?: Node } => {
    const removed = findNode(tree, id);
    const without = tree.flatMap<Node>((node) => {
      if (nodeId(node) === id) return [];
      if (isFolder(node)) return [{ ...node, children: removeNode(node.children, id).tree }];
      return [node];
    });
    return { tree: without, node: removed };
  };

  const insertNode = (tree: Node[], toInsert: Node, target: MoveTarget): Node[] => {
    if (target.parentId === null) {
      const at = Math.max(0, Math.min(target.index, tree.length));
      return [...tree.slice(0, at), toInsert, ...tree.slice(at)];
    }
    return tree.map((node) => {
      if (!isFolder(node)) return node;
      if (node.id === target.parentId) {
        const at = Math.max(0, Math.min(target.index, node.children.length));
        return { ...node, children: [...node.children.slice(0, at), toInsert, ...node.children.slice(at)] };
      }
      return { ...node, children: insertNode(node.children, toInsert, target) };
    });
  };

  const moveNode = (tree: Node[], dragId: string, target: MoveTarget): Node[] => {
    const dragged = findNode(tree, dragId);
    if (!dragged) return tree;
    if (target.parentId !== null) {
      const parent = findNode(tree, target.parentId);
      if (!parent || !isFolder(parent)) return tree;
      if (containsId(dragged, target.parentId)) return tree;
    }
    const without = removeNode(tree, dragId).tree;
    return insertNode(without, dragged, target);
  };

  const renameFolder = (tree: Node[], id: string, name: string): Node[] => {
    if (name.trim() === '') return tree;
    return tree.map((node) => {
      if (!isFolder(node)) return node;
      if (node.id === id) return { ...node, name };
      return { ...node, children: renameFolder(node.children, id, name) };
    });
  };

  const toggleCollapse = (tree: Node[], id: string): Node[] =>
    tree.map((node) => {
      if (!isFolder(node)) return node;
      if (node.id === id) return { ...node, collapsed: !node.collapsed };
      return { ...node, children: toggleCollapse(node.children, id) };
    });

  const walkLeafIds = (tree: Node[]): string[] =>
    tree.flatMap((node) => (isFolder(node) ? walkLeafIds(node.children) : [config.leafId(node)]));

  const updateLeafInTree = (tree: Node[], payload: Payload): Node[] =>
    tree.map((node) => {
      if (isFolder(node)) return { ...node, children: updateLeafInTree(node.children, payload) };
      return config.leafId(node) === config.payloadId(payload) ? config.toLeaf(payload) : node;
    });

  const collectFolderIds = (tree: Node[]): Set<string> => {
    const ids = new Set<string>();
    const walk = (nodes: Node[]): void =>
      nodes.forEach((node) => {
        if (!isFolder(node)) return;
        ids.add(node.id);
        walk(node.children);
      });
    walk(tree);
    return ids;
  };

  const newFolderId = (tree: Node[]): string => {
    const taken = collectFolderIds(tree);
    const next = (n: number): string => {
      const candidate = `folder-${n}`;
      return taken.has(candidate) ? next(n + 1) : candidate;
    };
    return next(taken.size + 1);
  };

  const addFolderNode = (tree: Node[], parentId: string | null, id: string): Node[] => {
    const folder: TreeFolder<Leaf> = { kind: 'folder', id, name: 'New folder', collapsed: false, children: [] };
    if (parentId === null) return [...tree, folder];
    return insertNode(tree, folder, { parentId, index: Number.MAX_SAFE_INTEGER });
  };

  const locate = (tree: Node[], id: string, parentId: string | null): MoveTarget | null => {
    const index = tree.findIndex((node) => nodeId(node) === id);
    if (index !== -1) return { parentId, index };
    return (
      tree
        .filter(isFolder)
        .map((folder) => locate(folder.children, id, folder.id))
        .find((found): found is MoveTarget => found !== null) ?? null
    );
  };

  const makeMinters = (tree: Node[]): IdMinters => {
    const takenFolders = collectFolderIds(tree);
    const takenLeaves = new Set(walkLeafIds(tree));
    return {
      folderId: () => {
        const pick = (n: number): string => {
          const candidate = `folder-${n}`;
          return takenFolders.has(candidate) ? pick(n + 1) : candidate;
        };
        const id = pick(1);
        takenFolders.add(id);
        return id;
      },
      leafId: (baseId) => {
        const pick = (n: number): string => {
          const candidate = n === 1 ? `${baseId}-copy` : `${baseId}-copy-${n}`;
          return takenLeaves.has(candidate) ? pick(n + 1) : candidate;
        };
        const id = pick(1);
        takenLeaves.add(id);
        return id;
      },
    };
  };

  const cloneSubtree = (node: Node, mint: IdMinters, renameTop: boolean): Node => {
    if (!isFolder(node)) return config.cloneLeaf(node, mint.leafId(config.leafId(node)), renameTop);
    return {
      kind: 'folder',
      id: mint.folderId(),
      name: renameTop ? `${node.name} (copy)` : node.name,
      collapsed: node.collapsed,
      children: node.children.map((child) => cloneSubtree(child, mint, false)),
    };
  };

  const duplicateNode = (tree: Node[], id: string): Node[] => {
    const source = findNode(tree, id);
    const location = locate(tree, id, null);
    if (!source || !location) return tree;
    const clone = cloneSubtree(source, makeMinters(tree), true);
    return insertNode(tree, clone, { parentId: location.parentId, index: location.index + 1 });
  };

  const locateNode = (tree: Node[], id: string, parentId: string | null = null): NodeLocation | null =>
    locateNodeBy(tree, id, nodeId, parentId);

  const dropTarget = (tree: Node[], dragId: string, overId: string, position: DropPosition): MoveTarget | null =>
    dropTargetBy(tree, dragId, overId, position, nodeId);

  return {
    nodeId,
    flatten,
    findNode,
    containsId,
    removeNode,
    insertNode,
    moveNode,
    renameFolder,
    toggleCollapse,
    walkLeafIds,
    updateLeafInTree,
    collectFolderIds,
    newFolderId,
    addFolderNode,
    duplicateNode,
    locateNode,
    dropTarget,
  };
};
