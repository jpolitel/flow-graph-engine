import type { Graph, GraphNode } from './types.js';

/**
 * Compile une liste de nœuds en graphe orienté exploitable.
 *
 * Règles de normalisation :
 * - une arête `a -> b` existe si `a` déclare `b` dans ses `successors`
 *   **ou** si `b` déclare `a` dans ses `predecessors` (union des deux sens) ;
 * - les références vers des IDs absents de la liste sont ignorées ;
 * - les boucles sur soi-même sont supprimées (inutilisables dans un chemin simple) ;
 * - les doublons d'adjacence sont supprimés, l'ordre de déclaration est conservé.
 *
 * @throws si deux nœuds partagent le même `id`.
 */
export function buildGraph(nodes: GraphNode[]): Graph {
  const byId = new Map<string, GraphNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) {
      throw new Error(`buildGraph: identifiant de nœud dupliqué "${node.id}"`);
    }
    byId.set(node.id, node);
  }

  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const id of byId.keys()) {
    successors.set(id, []);
    predecessors.set(id, []);
  }

  const addEdge = (from: string, to: string): void => {
    if (from === to) return;
    if (!byId.has(from) || !byId.has(to)) return;

    const out = successors.get(from);
    if (out && !out.includes(to)) out.push(to);

    const incoming = predecessors.get(to);
    if (incoming && !incoming.includes(from)) incoming.push(from);
  };

  // Sens direct d'abord, puis sens inverse : l'ordre déclaré par l'auteur prime.
  for (const node of nodes) {
    for (const next of node.successors) addEdge(node.id, next);
  }
  for (const node of nodes) {
    for (const previous of node.predecessors) addEdge(previous, node.id);
  }

  return { nodes: byId, successors, predecessors };
}

/**
 * Liste les références d'arêtes pointant vers des nœuds inexistants.
 *
 * Utilitaire de diagnostic pour les catalogues des applications consommatrices ;
 * `buildGraph` ignore ces références sans échouer.
 */
export function findDanglingReferences(
  nodes: GraphNode[],
): { nodeId: string; field: 'predecessors' | 'successors'; missingId: string }[] {
  const ids = new Set(nodes.map((node) => node.id));
  const dangling: {
    nodeId: string;
    field: 'predecessors' | 'successors';
    missingId: string;
  }[] = [];

  for (const node of nodes) {
    for (const missingId of node.predecessors) {
      if (!ids.has(missingId)) {
        dangling.push({ nodeId: node.id, field: 'predecessors', missingId });
      }
    }
    for (const missingId of node.successors) {
      if (!ids.has(missingId)) {
        dangling.push({ nodeId: node.id, field: 'successors', missingId });
      }
    }
  }

  return dangling;
}
