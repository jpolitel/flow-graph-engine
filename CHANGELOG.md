# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet adhère
au [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

## [0.2.0] — 2026-08-21

### Ajouté

- `seed` dans `GenerationOptions` : à graine, graphe et options identiques,
  `generateSequence` et `getMaxReachableLength` produisent toujours le même résultat. Les
  applications consommatrices peuvent ainsi tester des séquences exactes au lieu de se
  limiter à des invariants. Nombre ou chaîne, hachés de la même façon. Sans graine, le
  comportement est inchangé (`Math.random`).
- `nodeWeights` et `tagWeights` dans `GenerationOptions` : pondération du tirage du point de
  départ et du choix du successeur. Les poids **multiplient** le poids structurel issu du
  degré sortant, sans le remplacer ; les poids des tags d'un même nœud se multiplient entre
  eux, puis par le poids du nœud.

### Modifié

- Un candidat de poids nul n'est plus jamais tiré tant qu'un candidat de poids strictement
  positif subsiste. Un poids nul devient donc un « dernier recours » exact — le nœud reste
  empruntable s'il est le seul passage possible. Auparavant, un résidu de calcul en virgule
  flottante pouvait le sélectionner avec une probabilité de l'ordre de 2⁻³².

### Notes

- Un poids ne filtre pas : `requiredTags` reste le seul mécanisme d'exclusion.
- Le générateur pseudo-aléatoire (mulberry32, sans dépendance) est interne et volontairement
  absent de l'API publique.

## [0.1.1] — 2026-08-13

### Modifié

- Publication npm par Trusted Publishing (OIDC) au lieu d'un `NPM_TOKEN` en secret de
  dépôt. Changement d'infrastructure uniquement : le contenu du paquet est identique à
  celui de la 0.1.0.

## [0.1.0] — 2026-08-12

### Ajouté

- `buildGraph(nodes)` : compilation d'une liste de nœuds en graphe orienté, avec union des
  arêtes déclarées via `successors` et `predecessors`, suppression des doublons, des boucles
  sur soi-même et des références vers des nœuds inexistants.
- `generateSequence(graph, options)` : génération d'un chemin simple par marche aléatoire
  pondérée avec backtracking borné. Ne lève jamais d'exception ; retourne le meilleur chemin
  trouvé avec `truncated: true` si la longueur demandée est hors de portée.
- `getMaxReachableLength(graph, options)` : borne heuristique de la longueur atteignable
  dans le sous-graphe autorisé.
- `findDanglingReferences(nodes)` : diagnostic des références d'arêtes cassées, pour les
  scripts de validation de catalogue côté application.
- Filtrage du sous-graphe par `knownNodeIds` et par `requiredTags` (sémantique « au moins un
  tag en commun »).
- Double build CommonJS + ESM avec déclarations de types, sans dépendance runtime.
- Sourcemaps autonomes (`inlineSources`) : les sources TypeScript sont embarquées dans les
  `.map`, `src/` n'étant pas publié. Les stack traces des applications consommatrices
  remontent ainsi au TypeScript d'origine.
- Couverture des cas limites : graphe vide, nœud unique, nœud isolé, cycle simple,
  composantes disjointes, filtre excluant tous les nœuds, longueur nulle ou négative.

### Notes

- La génération utilise `Math.random` : elle n'est pas reproductible. Une stratégie
  déterministe seedable est prévue en 0.3.
- Les `tsconfig` évitent `moduleResolution: node` (alias `node10`), déprécié depuis
  TypeScript 6 et supprimé en TypeScript 7, au profit de `nodenext` — avec une sortie
  `esnext` + `bundler` pour le seul build ESM. Le projet reste compilé en TypeScript 5.x
  tant que `ts-jest` n'accepte pas TypeScript 6.
