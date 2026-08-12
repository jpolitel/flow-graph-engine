import type { GraphNode } from '../../src';

/** Fabrique un nœud en ne précisant que ce qui compte pour le test. */
export function node(
  id: string,
  partial: Partial<Omit<GraphNode, 'id'>> = {},
): GraphNode {
  return {
    id,
    tags: partial.tags ?? [],
    predecessors: partial.predecessors ?? [],
    successors: partial.successors ?? [],
    ...(partial.attributes ? { attributes: partial.attributes } : {}),
  };
}

/** Chaîne linéaire : c1 -> c2 -> c3 -> c4. */
export const chain: GraphNode[] = [
  node('c1', { successors: ['c2'] }),
  node('c2', { successors: ['c3'] }),
  node('c3', { successors: ['c4'] }),
  node('c4'),
];

/** Cycle simple : y1 -> y2 -> y3 -> y1. */
export const cycle: GraphNode[] = [
  node('y1', { successors: ['y2'] }),
  node('y2', { successors: ['y3'] }),
  node('y3', { successors: ['y1'] }),
];

/** Nœud isolé, sans aucune arête. */
export const isolated: GraphNode[] = [node('i1')];

/** Deux composantes disjointes : a1 -> a2 -> a3 et b1 -> b2. */
export const twoComponents: GraphNode[] = [
  node('a1', { successors: ['a2'] }),
  node('a2', { successors: ['a3'] }),
  node('a3'),
  node('b1', { successors: ['b2'] }),
  node('b2'),
];

/** Chaîne étiquetée : t1(doux) -> t2(intense) -> t3(doux) -> t4(intense). */
export const tagged: GraphNode[] = [
  node('t1', { tags: ['doux'], successors: ['t2', 't3'] }),
  node('t2', { tags: ['intense'], successors: ['t3'] }),
  node('t3', { tags: ['doux'], successors: ['t4'] }),
  node('t4', { tags: ['intense'] }),
];

/** Graphe dense : chaque nœud pointe vers tous les autres. */
export const dense: GraphNode[] = ['d1', 'd2', 'd3', 'd4', 'd5'].map((id, _index, all) =>
  node(id, { successors: all.filter((other) => other !== id) }),
);
