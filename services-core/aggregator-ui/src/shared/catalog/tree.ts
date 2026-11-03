import type { CatalogDependency, CatalogItem, CatalogTreeNode } from "../types";

const sortItemsByName = (items: CatalogItem[]): CatalogItem[] =>
  [...items].sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id));

const sortNodesByName = (nodes: CatalogTreeNode[]): CatalogTreeNode[] =>
  [...nodes].sort((a, b) =>
    (a.item.title || a.item.id).localeCompare(b.item.title || b.item.id),
  );

export const collectNodeIds = (nodes: CatalogTreeNode[]): string[] => {
  const ids: string[] = [];
  const visit = (node: CatalogTreeNode) => {
    ids.push(node.item.id);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
};

export const collectDescendantIds = (node: CatalogTreeNode): string[] => {
  const descendants: string[] = [];
  const visit = (children: CatalogTreeNode[]) => {
    children.forEach((child) => {
      descendants.push(child.item.id);
      visit(child.children);
    });
  };
  visit(node.children);
  return descendants;
};

export const collectExpandableIds = (nodes: CatalogTreeNode[]): string[] =>
  collectNodeIds(nodes).filter((id, index, arr) => arr.indexOf(id) === index);

export const buildCatalogTree = (
  items: CatalogItem[],
  dependencies: CatalogDependency[],
): CatalogTreeNode[] => {
  const itemMap = new Map<string, CatalogItem>(
    items.map((item) => [item.id, item]),
  );
  const childrenMap = new Map<string, string[]>();
  const childIds = new Set<string>();

  dependencies.forEach((dep) => {
    if (!itemMap.has(dep.sourceId) || !itemMap.has(dep.targetId)) {
      return;
    }
    childIds.add(dep.targetId);
    const list = childrenMap.get(dep.sourceId) || [];
    list.push(dep.targetId);
    childrenMap.set(dep.sourceId, list);
  });

  const rootItems = sortItemsByName(
    items.filter((item) => !childIds.has(item.id)),
  );

  const toNode = (
    itemId: string,
    visited: Set<string> = new Set<string>(),
    pathSegments: string[] = [],
    pathIds: string[] = [],
  ): CatalogTreeNode | null => {
    if (visited.has(itemId)) {
      return null;
    }
    visited.add(itemId);
    const item = itemMap.get(itemId);
    if (!item) {
      return null;
    }
    const uid = pathSegments.join("/");
    const path = [...pathIds, itemId];
    const children = sortNodesByName(
      (childrenMap.get(itemId) || [])
        .map((childId, index) =>
          toNode(
            childId,
            new Set<string>(visited),
            [...pathSegments, `${index}:${childId}`],
            path,
          ),
        )
        .filter((node): node is CatalogTreeNode => Boolean(node)),
    );
    return { item, children, uid, path };
  };

  return rootItems
    .map((item, index) =>
      toNode(item.id, new Set<string>(), [`${index}:${item.id}`], []),
    )
    .filter((node): node is CatalogTreeNode => Boolean(node));
};

export const findNodePath = (
  nodes: CatalogTreeNode[],
  targetId: string,
): string[] | null => {
  for (const node of nodes) {
    if (node.item.id === targetId) {
      return [node.item.id];
    }
    if (node.children.length) {
      const childPath = findNodePath(node.children, targetId);
      if (childPath) {
        return [node.item.id, ...childPath];
      }
    }
  }
  return null;
};

export const findNodeById = (
  nodes: CatalogTreeNode[],
  targetId: string,
): CatalogTreeNode | null => {
  for (const node of nodes) {
    if (node.item.id === targetId) {
      return node;
    }
    if (node.children.length) {
      const found = findNodeById(node.children, targetId);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

export const findNodeByPath = (
  nodes: CatalogTreeNode[],
  pathIds: string[],
): CatalogTreeNode | null => {
  if (!Array.isArray(pathIds) || pathIds.length === 0) {
    return null;
  }
  const [head, ...rest] = pathIds;
  for (const node of nodes) {
    if (node.item.id !== head) {
      continue;
    }
    if (rest.length === 0) {
      return node;
    }
    const found = findNodeByPath(node.children, rest);
    if (found) {
      return found;
    }
  }
  return null;
};

export const findNodeUidById = (
  nodes: CatalogTreeNode[],
  targetId: string,
): string | null => {
  for (const node of nodes) {
    if (node.item.id === targetId) {
      return node.uid;
    }
    if (node.children.length) {
      const found = findNodeUidById(node.children, targetId);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

