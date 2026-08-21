import { createRandom } from './random.js';
import type { Graph, GenerationOptions, GenerationResult } from './types.js';

/** Nombre de marches aléatoires tentées par défaut. */
const DEFAULT_MAX_ATTEMPTS = 50;

/**
 * Nombre maximal d'expansions de nœuds par tentative. Borne le backtracking :
 * on préfère plusieurs marches courtes qu'une exploration exhaustive
 * (recherche du plus long chemin = NP-difficile).
 */
const EXPANSION_BUDGET = 2000;

/**
 * Taille maximale d'une composante soumise à l'exploration exhaustive. Au-delà,
 * le nombre de chemins simples rend l'exhaustivité hors de portée quoi qu'il
 * arrive, et seules les marches aléatoires restent praticables.
 */
const EXACT_MAX_NODES = 14;

/**
 * Budget d'expansions de l'exploration exhaustive. C'est lui, et non la seule
 * taille de la composante, qui décide en dernier ressort : une composante de 14
 * nœuds peu reliée se prouve, la même densément reliée épuise le budget et
 * bascule sur l'heuristique.
 */
const EXACT_EXPANSION_BUDGET = 50000;

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

/**
 * Composantes faiblement connexes du sous-graphe, ordonnées par taille
 * décroissante.
 *
 * La connexité est calculée en ignorant le sens des arêtes : un chemin peut
 * entrer dans la composante par n'importe lequel de ses nœuds. La taille d'une
 * composante **majore** donc la longueur des chemins simples qu'elle contient,
 * ce qui permet d'écarter d'emblée celles qui ne peuvent plus rien apporter.
 */
function componentsOf(subgraph: Subgraph): string[][] {
  const neighbours = new Map<string, string[]>();
  const link = (from: string, to: string): void => {
    const known = neighbours.get(from);
    if (known) known.push(to);
    else neighbours.set(from, [to]);
  };

  for (const [id, out] of subgraph.successors) {
    for (const next of out) {
      link(id, next);
      link(next, id);
    }
  }

  const seen = new Set<string>();
  const components: string[][] = [];

  // Parcours dans l'ordre stable du sous-graphe : à graphe égal, découpage égal.
  for (const id of subgraph.ids) {
    if (seen.has(id)) continue;

    const component: string[] = [];
    const queue = [id];
    seen.add(id);

    while (queue.length > 0) {
      const current = queue.pop() as string;
      component.push(current);
      for (const next of neighbours.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }

    components.push(component);
  }

  // `sort` est stable : à tailles égales, l'ordre de découverte est conservé.
  return components.sort((a, b) => b.length - a.length);
}

/** Poids d'entrée invalide ou absent : ignoré. Poids négatif : ramené à 0. */
function sanitizeWeight(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return value < 0 ? 0 : value;
}

/**
 * Poids déclaré par l'appelant pour un nœud : produit des poids de ses tags et
 * de son poids direct. Vaut 1 partout en l'absence de pondération.
 */
function buildDeclaredWeight(
  graph: Graph,
  nodeWeights: Record<string, number> | undefined,
  tagWeights: Record<string, number> | undefined,
): (id: string) => number {
  const weightedTags = tagWeights && Object.keys(tagWeights).length > 0;
  const weightedNodes = nodeWeights && Object.keys(nodeWeights).length > 0;
  if (!weightedTags && !weightedNodes) return () => 1;

  // Le poids d'un nœud ne dépend que des options : on le calcule une fois, quel
  // que soit le nombre de tirages où il réapparaît.
  const cache = new Map<string, number>();

  return (id: string): number => {
    const known = cache.get(id);
    if (known !== undefined) return known;

    let weight = sanitizeWeight(nodeWeights?.[id]);
    if (weightedTags) {
      for (const tag of graph.nodes.get(id)?.tags ?? []) {
        weight *= sanitizeWeight(tagWeights?.[tag]);
      }
    }

    cache.set(id, weight);
    return weight;
  };
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
    const weight = weightOf(item);
    // Un poids nul n'est jamais tiré ici : il ne subsiste que par le repli
    // ci-dessus, quand plus aucun candidat n'a de poids. C'est ce qui fait
    // d'un poids nul un « dernier recours » et non une exclusion.
    if (weight <= 0) continue;
    threshold -= weight;
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
  declaredWeightOf: (id: string) => number,
): string[] {
  const degreeOf = (id: string): number => (subgraph.successors.get(id) ?? []).length;
  // +1 pour laisser une chance aux culs-de-sac, qui restent des fins valides.
  // La pondération de l'appelant module ce poids structurel sans le remplacer.
  const weightOf = (id: string): number => (degreeOf(id) + 1) * declaredWeightOf(id);

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

/**
 * Plus long chemin simple d'une composante, par exploration exhaustive.
 *
 * L'ordre de parcours est **tiré au sort** (mêmes poids que les marches) : sur
 * une composante où plusieurs chemins atteignent `targetLength`, l'exploration
 * s'arrête au premier trouvé, qui varie donc d'un appel à l'autre. C'est ce qui
 * permet d'utiliser l'exhaustivité sans figer la séquence produite.
 *
 * L'exploration s'arrête avant terme si le budget d'expansions est épuisé, ou
 * dès que `targetLength` est atteinte : le chemin retourné est alors un minorant
 * et non un optimum prouvé. L'appelant n'a pas à faire la différence — il
 * conserve simplement le plus long chemin qu'il a vu.
 */
function exactLongestPath(
  subgraph: Subgraph,
  component: string[],
  startNodeId: string | undefined,
  targetLength: number,
  random: () => number,
  weightOf: (id: string) => number,
): string[] {
  const visited = new Set<string>();
  const path: string[] = [];
  let best: string[] = [];
  let budget = EXACT_EXPANSION_BUDGET;
  let exhausted = false;

  const explore = (id: string): void => {
    if (budget <= 0) {
      exhausted = true;
      return;
    }
    budget -= 1;

    visited.add(id);
    path.push(id);
    if (path.length > best.length) best = [...path];

    if (best.length < targetLength) {
      const candidates = (subgraph.successors.get(id) ?? []).filter(
        (next) => !visited.has(next),
      );
      for (const next of weightedShuffle(candidates, weightOf, random)) {
        explore(next);
        if (exhausted || best.length >= targetLength) break;
      }
    }

    path.pop();
    visited.delete(id);
  };

  const starts =
    startNodeId !== undefined
      ? [startNodeId]
      : weightedShuffle(component, weightOf, random);

  for (const start of starts) {
    explore(start);
    if (exhausted || best.length >= targetLength) break;
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
  declaredWeightOf: (id: string) => number,
): string[] {
  if (targetLength <= 0 || subgraph.ids.length === 0) return [];
  if (startNodeId !== undefined && !subgraph.successors.has(startNodeId)) return [];

  const degreeOf = (id: string): number => (subgraph.successors.get(id) ?? []).length;
  // Un nœud très sortant est un meilleur point de départ : on lui donne du poids,
  // sans jamais exclure les autres.
  const startWeightOf = (id: string): number => (degreeOf(id) + 1) * declaredWeightOf(id);

  const components = componentsOf(subgraph);
  // Départ imposé : seule sa composante peut produire quoi que ce soit.
  const reachable =
    startNodeId !== undefined
      ? components.filter((component) => component.includes(startNodeId))
      : components;

  let best: string[] = [];
  /**
   * Nœuds encore susceptibles d'améliorer le résultat. Une composante dont la
   * taille ne dépasse pas le meilleur chemin déjà trouvé ne peut rien apporter :
   * l'écarter évite d'y gaspiller des tentatives, et vide le vivier — donc
   * arrête la recherche — dès qu'aucune composante ne peut plus faire mieux.
   */
  const viable = (): string[] =>
    reachable.filter((component) => component.length > best.length).flat();

  let pool = viable();
  for (
    let attempt = 0;
    attempt < maxAttempts && best.length < targetLength && pool.length > 0;
    attempt += 1
  ) {
    const start = startNodeId ?? pickWeighted(pool, startWeightOf, random) ?? pool[0];
    if (start === undefined) break;

    const path = walk(subgraph, start, targetLength, random, declaredWeightOf);
    if (path.length > best.length) {
      best = path;
      pool = viable();
    }
  }

  // Les marches sont bornées : elles peuvent manquer un chemin qui existe. Sur
  // une composante assez petite pour être épuisée, l'exploration exhaustive
  // tranche — au prix d'un budget lui aussi borné.
  if (best.length < targetLength) {
    for (const component of reachable) {
      if (component.length <= best.length) break;
      if (component.length > EXACT_MAX_NODES) continue;

      const exact = exactLongestPath(
        subgraph,
        component,
        startNodeId,
        targetLength,
        random,
        startWeightOf,
      );
      if (exact.length > best.length) best = exact;
      if (best.length >= targetLength) break;
    }
  }

  return best.slice(0, targetLength);
}

/** `Math.random` par défaut, suite reproductible dès qu'une graine est fournie. */
function randomSource(seed: number | string | undefined): () => number {
  return seed === undefined ? Math.random : createRandom(seed);
}

/**
 * Génère une séquence de nœuds respectant les arêtes du graphe.
 *
 * Ne lève jamais d'exception : si le sous-graphe ne permet pas d'atteindre
 * `targetLength`, le meilleur chemin trouvé est retourné avec `truncated: true`.
 *
 * Aléatoire par défaut ; reproductible dès que `options.seed` est fournie.
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
    randomSource(options.seed),
    buildDeclaredWeight(graph, options.nodeWeights, options.tagWeights),
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
    randomSource(options.seed),
    buildDeclaredWeight(graph, options.nodeWeights, options.tagWeights),
  ).length;
}
