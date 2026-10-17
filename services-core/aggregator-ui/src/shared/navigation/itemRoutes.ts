import type { CatalogTreeNode } from "../types";
import { findNodeById, findNodeByPath } from "../catalog/tree";

const stripBasePath = (pathname: string, basePath: string): string => {
  if (!basePath || basePath === "/") {
    return pathname.replace(/^\/+/, "");
  }
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  if (pathname.startsWith(normalizedBase)) {
    return pathname.slice(normalizedBase.length);
  }
  if (pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length).replace(/^\/+/, "");
  }
  return pathname.replace(/^\/+/, "");
};

export const parseServicePath = (
  value: string | null | undefined,
): string[] => {
  if (!value) {
    return [];
  }
  return value
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .filter(Boolean);
};

export const buildServicePath = (pathIds: string[]): string =>
  pathIds.map((segment) => encodeURIComponent(segment)).join("/");

export const buildItemPathname = (basePath: string, itemId: string): string => {
  const normalizedBase = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  const prefix = normalizedBase === "" ? "" : normalizedBase;
  return `${prefix}/item/${encodeURIComponent(itemId)}`;
};

export const buildItemRouteHref = (
  basePath: string,
  itemId: string,
  pathIds: string[] = [],
): string => {
  const pathname = buildItemPathname(basePath, itemId);
  if (!Array.isArray(pathIds) || pathIds.length === 0) {
    return pathname;
  }
  const params = new URLSearchParams();
  params.set("path", buildServicePath(pathIds));
  return `${pathname}?${params.toString()}`;
};

export const resolveNodeFromLocation = (
  nodes: CatalogTreeNode[],
  basePath: string,
): { node: CatalogTreeNode } | null => {
  if (!nodes.length) {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const servicePath = parseServicePath(params.get("path"));
  const relativePath = stripBasePath(window.location.pathname, basePath);
  let routeId = "";
  if (relativePath.startsWith("item/")) {
    const rest = relativePath.slice("item/".length);
    const [segment] = rest.split("/").filter(Boolean);
    if (segment) {
      routeId = decodeURIComponent(segment);
    }
  }

  const hasRouteId = Boolean(routeId);
  const hasPathParam = servicePath.length > 0;

  if (hasPathParam) {
    const byPath = findNodeByPath(nodes, servicePath);
    if (byPath) {
      return { node: byPath };
    }
    const fallbackId = servicePath[servicePath.length - 1];
    if (fallbackId) {
      const byId = findNodeById(nodes, fallbackId);
      if (byId) {
        return { node: byId };
      }
    }
  }

  if (hasRouteId) {
    const byId = findNodeById(nodes, routeId);
    return byId ? { node: byId } : null;
  }

  return null;
};

export const readLocationRouteContext = (
  basePath: string,
): {
  routeId: string;
  pathIds: string[];
  hasRouteId: boolean;
  hasPathParam: boolean;
} => {
  const params = new URLSearchParams(window.location.search);
  const pathParamRaw = params.get("path") || "";
  const pathIds = parseServicePath(pathParamRaw);
  const relativePath = stripBasePath(window.location.pathname, basePath);
  let routeId = "";
  if (relativePath.startsWith("item/")) {
    const rest = relativePath.slice("item/".length);
    const [segment] = rest.split("/").filter(Boolean);
    if (segment) {
      routeId = decodeURIComponent(segment);
    }
  }
  return {
    routeId,
    pathIds,
    hasRouteId: Boolean(routeId),
    hasPathParam: pathIds.length > 0,
  };
};

