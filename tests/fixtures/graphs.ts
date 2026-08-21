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

/**
 * Nœuds portant plusieurs étiquettes, pour vérifier la composition des poids :
 * m1(doux, lent) -> m2(doux, rapide) et m1 -> m3(intense, lent).
 */
export const multiTagged: GraphNode[] = [
  node('m1', { tags: ['doux', 'lent'], successors: ['m2', 'm3'] }),
  node('m2', { tags: ['doux', 'rapide'] }),
  node('m3', { tags: ['intense', 'lent'] }),
];

/** Graphe dense : chaque nœud pointe vers tous les autres. */
export const dense: GraphNode[] = ['d1', 'd2', 'd3', 'd4', 'd5'].map((id, _index, all) =>
  node(id, { successors: all.filter((other) => other !== id) }),
);

/**
 * Piège à marche aléatoire : `h` ouvre sur cinq culs-de-sac et sur une seule
 * chaîne longue. Un départ tiré au sort tombe le plus souvent sur un cul-de-sac,
 * alors que le plus long chemin — `h -> p1 -> p2 -> p3 -> p4`, unique et de
 * longueur 5 — n'est atteignable qu'en partant de `h`.
 */
export const trap: GraphNode[] = [
  node('h', { successors: ['dead1', 'dead2', 'dead3', 'dead4', 'dead5', 'p1'] }),
  node('dead1'),
  node('dead2'),
  node('dead3'),
  node('dead4'),
  node('dead5'),
  node('p1', { successors: ['p2'] }),
  node('p2', { successors: ['p3'] }),
  node('p3', { successors: ['p4'] }),
  node('p4'),
];

/**
 * Même piège, mais avec deux branches longues symétriques : plusieurs chemins
 * optimaux de longueur 4 existent, ce qui permet de vérifier que l'exploration
 * exhaustive ne fige pas la séquence produite.
 */
export const twinPaths: GraphNode[] = [
  node('h', { successors: ['x1', 'x2', 'x3', 'a1', 'b1'] }),
  node('x1'),
  node('x2'),
  node('x3'),
  node('a1', { successors: ['a2'] }),
  node('a2', { successors: ['a3'] }),
  node('a3'),
  node('b1', { successors: ['b2'] }),
  node('b2', { successors: ['b3'] }),
  node('b3'),
];

/** Trois nœuds isolés : autant de composantes d'un seul nœud. */
export const scattered: GraphNode[] = [node('s1'), node('s2'), node('s3')];

/**
 * Composante trop grande pour l'exploration exhaustive (au-delà de 14 nœuds) :
 * la recherche doit y rester heuristique, sans échouer. Dense, donc tout ordre
 * de parcours est un chemin valide.
 */
export const largeDense: GraphNode[] = Array.from(
  { length: 20 },
  (_unused, i) => `g${i}`,
).map((id, _index, all) => node(id, { successors: all.filter((o) => o !== id) }));
