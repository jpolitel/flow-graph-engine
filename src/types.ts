/**
 * Types publics du moteur.
 *
 * Aucun vocabulaire métier ici : le moteur ne manipule que des nœuds génériques
 * reliés par des arêtes orientées.
 */

/** Nœud générique du graphe, tel que fourni par l'application consommatrice. */
export interface GraphNode {
  /** Identifiant unique dans le graphe. */
  id: string;
  /** Étiquettes libres, utilisées pour filtrer le sous-graphe à la génération. */
  tags: string[];
  /** Métadonnées libres, transportées telles quelles et ignorées par le moteur. */
  attributes?: Record<string, unknown>;
  /** IDs des nœuds pouvant précéder celui-ci. */
  predecessors: string[];
  /** IDs des nœuds pouvant suivre celui-ci. */
  successors: string[];
}

/**
 * Graphe compilé, produit par `buildGraph`.
 *
 * Les listes d'adjacence sont normalisées : dédoublonnées, débarrassées des
 * références vers des nœuds inexistants et des boucles sur soi-même.
 */
export interface Graph {
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly successors: ReadonlyMap<string, readonly string[]>;
  readonly predecessors: ReadonlyMap<string, readonly string[]>;
}

/** Paramètres d'une génération de séquence. */
export interface GenerationOptions {
  /** Sous-ensemble de nœuds autorisés. Les IDs inconnus sont ignorés. */
  knownNodeIds: string[];
  /**
   * Filtre optionnel sur les tags. Un nœud est retenu s'il porte **au moins un**
   * des tags demandés (sémantique « mélanger ces catégories »). Une liste vide
   * ou absente désactive le filtre.
   */
  requiredTags?: string[];
  /** Longueur souhaitée. Une valeur <= 0 produit une séquence vide. */
  targetLength: number;
  /** Nœud de départ imposé. S'il est absent du sous-graphe, le résultat est vide. */
  startNodeId?: string;
  /** Nombre de marches aléatoires tentées avant de retenir la meilleure. */
  maxAttempts?: number;
  /**
   * Graine de la source pseudo-aléatoire. À graine égale, mêmes options et même
   * graphe, la séquence produite est identique — de quoi écrire des tests sur
   * des séquences exactes côté application. Absente, la génération utilise
   * `Math.random` et n'est pas reproductible.
   */
  seed?: number | string;
  /**
   * Poids par nœud, appliqués au tirage du point de départ et au choix du
   * successeur suivant. Valeur par défaut : `1`. Voir {@link tagWeights} pour
   * les règles de composition et de validation.
   */
  nodeWeights?: Record<string, number>;
  /**
   * Poids par tag, appliqués aux mêmes tirages que {@link nodeWeights}.
   *
   * Composition : les poids des tags portés par un nœud sont **multipliés**
   * entre eux, puis par le poids du nœud. Un nœud portant deux tags valorisés
   * cumule donc les deux préférences.
   *
   * Ces poids ne filtrent rien — c'est le rôle de {@link requiredTags} : un
   * poids nul relègue le nœud en dernier recours sans jamais l'exclure d'un
   * chemin où il est le seul passage possible. Un poids négatif est ramené à
   * `0`, une valeur non finie est ignorée.
   */
  tagWeights?: Record<string, number>;
}

/** Résultat d'une génération. Jamais d'exception : au pire une séquence vide. */
export interface GenerationResult {
  /** IDs ordonnés, sans répétition (chemin simple). */
  sequence: string[];
  requestedLength: number;
  achievedLength: number;
  /** `true` si `achievedLength < requestedLength`. */
  truncated: boolean;
}
