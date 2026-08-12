import type { Graph, GenerationOptions, GenerationResult } from './types.js';

/** Nombre de marches aléatoires tentées par défaut. */
const DEFAULT_MAX_ATTEMPTS = 50;

/**
 * Nombre maximal d'expansions de nœuds par tentative. Borne le backtracking :
 * on préfère plusieurs marches courtes qu'une exploration exhaustive
 * (recherche du plus long chemin = NP-difficile).
 */
const EXPANSION_BUDGET = 2000;

/** Sous-graphe induit par les nœuds autorisés. */
interface Subgraph {
  ids: string[];
  successors: Map<string, string[]>;
}

/**
 * Construit le sous-graphe induit par `knownNodeIds`, filtré par `requiredTags`.
 * Une arête n'est conservée que si ses deux extrémités sont retenues.
 */
function buildSubgraph(
  graph: Graph,
  knownNodeIds: string[],
  requiredTags: string[] | undefined,
): Subgraph {
  const wanted = new Set(knownNodeIds);
  const tagFilter =
    requiredTags && requiredTags.length > 0 ? new Set(requiredTags) : undefined;

  const kept = new Set<string>();
  for (const id of wanted) {
    const node = graph.nodes.get(id);
    if (!node) continue;
    if (tagFilter && !node.tags.some((tag) => tagFilter.has(tag))) continue;
    kept.add(id);
  }

  const ids: string[] = [];
  const successors = new Map<string, string[]>();
  // On itère sur le graphe complet pour garder un ordre stable, indépendant
  // de l'ordre de `knownNodeIds`.
  for (const id of graph.nodes.keys()) {
    if (!kept.has(id)) continue;
    ids.push(id);
    const out = graph.successors.get(id) ?? [];
    successors.set(
      id,
      out.filter((next) => kept.has(next)),
    );
  }

  return { ids, successors };
}

/** Tire un élément au hasard, proportionnellement à son poids (poids > 0). */
function pickWeighted<T>(
  items: T[],
  weightOf: (item: T) => number,
  random: () => number,
): T | undefined {
  if (items.length === 0) return undefined;

  let total = 0;
  for (const item of items) total += weightOf(item);
  if (total <= 0) return items[Math.floor(random() * items.length)];

  let threshold = random() * total;
  for (const item of items) {
    threshold -= weightOf(item);
    if (threshold <= 0) return item;
  }
  return items[items.length - 1];
}

/** Ordonne des candidats par tirages successifs sans remise, pondérés. */
function weightedShuffle(
  candidates: string[],
  weightOf: (id: string) => number,
  random: () => number,
): string[] {
  const pool = [...candidates];
  const ordered: string[] = [];
  while (pool.length > 0) {
    const picked = pickWeighted(pool, weightOf, random);
    if (picked === undefined) break;
    pool.splice(pool.indexOf(picked), 1);
    ordered.push(picked);
  }
  return ordered;
}

/**
 * Une marche : DFS aléatoire pondérée depuis `startId`, avec backtracking borné
 * par `EXPANSION_BUDGET`. Retourne le plus long chemin simple rencontré.
 */
function walk(
  subgraph: Subgraph,
  startId: string,
  targetLength: number,
  random: () => number,
): string[] {
  const degreeOf = (id: string): number => (subgraph.successors.get(id) ?? []).length;
  // +1 pour laisser une chance aux culs-de-sac, qui restent des fins valides.
  const weightOf = (id: string): number => degreeOf(id) + 1;

  interface Frame {
    id: string;
    /** Candidats restants, dépilés depuis la fin. */
    remaining: string[];
  }

  const visited = new Set<string>();
  const frames: Frame[] = [];
  let best: string[] = [];
  let budget = EXPANSION_BUDGET;

  const enter = (id: string): void => {
    visited.add(id);
    const candidates = (subgraph.successors.get(id) ?? []).filter(
      (next) => !visited.has(next),
    );
    frames.push({
      id,
      remaining: weightedShuffle(candidates, weightOf, random).reverse(),
    });
    if (frames.length > best.length) best = frames.map((frame) => frame.id);
  };

  enter(startId);

  while (frames.length > 0 && best.length < targetLength) {
    if (budget <= 0) break;
    budget -= 1;

    const top = frames[frames.length - 1];
    if (!top) break;

    let next: string | undefined;
    while (top.remaining.length > 0) {
      const candidate = top.remaining.pop();
      if (candidate !== undefined && !visited.has(candidate)) {
        next = candidate;
        break;
      }
    }

    if (next === undefined) {
      frames.pop();
      visited.delete(top.id);
      continue;
    }

    enter(next);
  }

  return best;
}

/** Cœur commun à `generateSequence` et `getMaxReachableLength`. */
function search(
  subgraph: Subgraph,
  targetLength: number,
  startNodeId: string | undefined,
  maxAttempts: number,
  random: () => number,
): string[] {
  if (targetLength <= 0 || subgraph.ids.length === 0) return [];
  if (startNodeId !== undefined && !subgraph.successors.has(startNodeId)) return [];

  const degreeOf = (id: string): number => (subgraph.successors.get(id) ?? []).length;
  // Un nœud très sortant est un meilleur point de départ : on lui donne du poids,
  // sans jamais exclure les autres.
  const startWeightOf = (id: string): number => degreeOf(id) + 1;

  let best: string[] = [];
  for (
    let attempt = 0;
    attempt < maxAttempts && best.length < targetLength;
    attempt += 1
  ) {
    const start =
      startNodeId ?? pickWeighted(subgraph.ids, startWeightOf, random) ?? subgraph.ids[0];
    if (start === undefined) break;

    const path = walk(subgraph, start, targetLength, random);
    if (path.length > best.length) best = path;
  }

  return best.slice(0, targetLength);
}

/**
 * Génère une séquence de nœuds respectant les arêtes du graphe.
 *
 * Ne lève jamais d'exception : si le sous-graphe ne permet pas d'atteindre
 * `targetLength`, le meilleur chemin trouvé est retourné avec `truncated: true`.
 */
export function generateSequence(
  graph: Graph,
  options: GenerationOptions,
): GenerationResult {
  const requestedLength = Math.max(0, Math.floor(options.targetLength));
  const maxAttempts = Math.max(
    1,
    Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
  );

  const subgraph = buildSubgraph(graph, options.knownNodeIds, options.requiredTags);
  const sequence = search(
    subgraph,
    requestedLength,
    options.startNodeId,
    maxAttempts,
    Math.random,
  );

  return {
    sequence,
    requestedLength,
    achievedLength: sequence.length,
    truncated: sequence.length < requestedLength,
  };
}

/**
 * Longueur maximale atteignable dans le sous-graphe autorisé.
 *
 * Valeur **heuristique** : c'est un minorant obtenu par les mêmes marches
 * aléatoires que `generateSequence`, pas l'optimum exact (plus long chemin =
 * NP-difficile). Utile pour afficher une borne indicative avant génération.
 */
export function getMaxReachableLength(
  graph: Graph,
  options: Omit<GenerationOptions, 'targetLength'>,
): number {
  const subgraph = buildSubgraph(graph, options.knownNodeIds, options.requiredTags);
  const maxAttempts = Math.max(
    1,
    Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS * 2),
  );

  return search(
    subgraph,
    subgraph.ids.length,
    options.startNodeId,
    maxAttempts,
    Math.random,
  ).length;
}
