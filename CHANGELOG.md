# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet adhère
au [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

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
- Couverture des cas limites : graphe vide, nœud unique, nœud isolé, cycle simple,
  composantes disjointes, filtre excluant tous les nœuds, longueur nulle ou négative.

### Notes

- La génération utilise `Math.random` : elle n'est pas reproductible. Une stratégie
  déterministe seedable est prévue en 0.3.
- Les `tsconfig` évitent `moduleResolution: node` (alias `node10`), déprécié depuis
  TypeScript 6 et supprimé en TypeScript 7, au profit de `nodenext` — avec une sortie
  `esnext` + `bundler` pour le seul build ESM. Le projet reste compilé en TypeScript 5.x
  tant que `ts-jest` n'accepte pas TypeScript 6.
