# flow-graph-engine

Moteur générique de génération de séquences via parcours de graphe orienté.

Vous décrivez un ensemble de nœuds et les enchaînements autorisés entre eux ; le moteur
produit une séquence ordonnée respectant ces enchaînements, en tirant au hasard parmi les
chemins possibles. Aucun vocabulaire métier : le moteur ne sait rien de ce que représentent
vos nœuds.

## Installation

```bash
npm install @syncopelab/flow-graph-engine
```

Package TypeScript, double build CommonJS + ESM, sans aucune dépendance runtime. Aucune API
Node-only : utilisable en Node comme dans un moteur JS mobile (React Native / Hermes).

## Utilisation

```typescript
import { buildGraph, generateSequence } from '@syncopelab/flow-graph-engine';

const graph = buildGraph([
  { id: 'a', tags: ['doux'], predecessors: [], successors: ['b', 'c'] },
  { id: 'b', tags: ['intense'], predecessors: [], successors: ['c'] },
  { id: 'c', tags: ['doux'], predecessors: [], successors: [] },
]);

const result = generateSequence(graph, {
  knownNodeIds: ['a', 'b', 'c'],
  requiredTags: ['doux', 'intense'],
  targetLength: 3,
});

// { sequence: ['a', 'b', 'c'], requestedLength: 3, achievedLength: 3, truncated: false }
```

## API

### `buildGraph(nodes: GraphNode[]): Graph`

Compile une liste de nœuds en graphe exploitable.

Une arête `a -> b` existe si `a` déclare `b` dans ses `successors` **ou** si `b` déclare `a`
dans ses `predecessors` : déclarer un enchaînement d'un seul côté suffit. Les références vers
des IDs inexistants et les boucles sur soi-même sont ignorées, les doublons supprimés.

Lève une exception uniquement en cas d'identifiant dupliqué (erreur de programmation).

### `generateSequence(graph: Graph, options: GenerationOptions): GenerationResult`

Produit un **chemin simple** (aucun nœud répété) dans le sous-graphe induit par
`knownNodeIds`, filtré par `requiredTags`.

| Option         | Rôle                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| `knownNodeIds` | Nœuds autorisés. Les IDs inconnus du graphe sont ignorés.                         |
| `requiredTags` | Ne garde que les nœuds portant **au moins un** de ces tags. Vide = pas de filtre. |
| `targetLength` | Longueur souhaitée. `<= 0` produit une séquence vide.                             |
| `startNodeId`  | Départ imposé. Hors du sous-graphe, le résultat est vide.                         |
| `maxAttempts`  | Nombre de marches aléatoires tentées (défaut : 50). La meilleure est retenue.     |
| `seed`         | Graine. À graine égale, séquence identique. Absente : `Math.random`.              |
| `nodeWeights`  | Poids par nœud, appliqués aux tirages. Défaut : `1`.                              |
| `tagWeights`   | Poids par tag, multipliés entre eux puis par le poids du nœud.                    |

**La fonction ne lève jamais d'exception.** Si le sous-graphe ne permet pas d'atteindre
`targetLength` (cul-de-sac, composantes trop petites, filtre trop restrictif), le meilleur
chemin trouvé est retourné avec `truncated: true` et `achievedLength` réel — c'est à
l'application d'en informer l'utilisateur.

#### Reproductibilité

Sans `seed`, la génération tire sur `Math.random` et n'est pas reproductible. Avec une
graine, même graphe et mêmes options donnent toujours la même séquence : de quoi tester une
sortie exacte côté application, plutôt que de se limiter à des invariants.

```typescript
const options = { knownNodeIds: ids, targetLength: 4, seed: 'test-1' };
generateSequence(graph, options); // ⟵ identique à chaque appel
```

La graine accepte un nombre ou une chaîne, hachés de la même façon : `7` et `'7'` produisent
donc la même suite. Le générateur (mulberry32) est interne et n'est pas exposé.

#### Pondération

`nodeWeights` et `tagWeights` modulent deux tirages : le choix du point de départ et celui
du successeur suivant. Ils **multiplient** le poids structurel (fondé sur le degré sortant),
sans le remplacer.

```typescript
generateSequence(graph, {
  knownNodeIds: ids,
  targetLength: 5,
  tagWeights: { doux: 3, intense: 0.5 }, // trois fois plus de « doux »
  nodeWeights: { x9: 0 }, // x9 en dernier recours seulement
});
```

Les poids des tags portés par un même nœud sont multipliés entre eux, puis par le poids du
nœud : un nœud cumulant deux préférences cumule les deux facteurs.

> Un poids **ne filtre pas** — c'est le rôle de `requiredTags`. Un poids nul relègue le nœud
> en dernier recours sans jamais l'exclure : s'il est le seul passage vers un chemin de la
> longueur demandée, il est emprunté. Un poids négatif est ramené à `0`, une valeur non
> finie est ignorée.

### `getMaxReachableLength(graph, options): number`

Longueur maximale atteignable dans le sous-graphe autorisé, pour afficher une borne avant
génération.

> Valeur **heuristique** : un minorant obtenu par les mêmes marches aléatoires, pas
> l'optimum exact — la recherche du plus long chemin est NP-difficile.

### `findDanglingReferences(nodes): { nodeId, field, missingId }[]`

Utilitaire de diagnostic : liste les références d'arêtes pointant vers des nœuds inexistants.
Destiné aux scripts de validation de catalogue des applications consommatrices.

## Algorithme

Marche aléatoire pondérée avec backtracking borné :

- le sous-graphe induit est construit à partir des nœuds autorisés et du filtre de tags ;
- `maxAttempts` marches indépendantes sont lancées, chacune depuis un départ tiré au sort
  (pondéré par le degré sortant, modulé par `nodeWeights` et `tagWeights`), et on retient le
  meilleur chemin ;
- chaque marche est un DFS aléatoire dont le backtracking est borné en nombre d'expansions,
  afin de garder un temps de réponse constant même sur un graphe dense ;
- la recherche s'arrête dès que `targetLength` est atteinte.

Ce n'est délibérément **pas** une recherche exhaustive du plus long chemin.

## Développement

```bash
npm install
npm run lint       # eslint + prettier
npm run typecheck  # tsc --noEmit
npm test           # jest
npm run build      # dist/cjs + dist/esm + dist/types
```

Node 22 LTS recommandé (voir `.nvmrc`), Node 18 minimum.

### Configuration TypeScript

Le double build repose sur trois configurations dérivées de `tsconfig.json` :

| Fichier               | Rôle                           | `module` / `moduleResolution` |
| --------------------- | ------------------------------ | ----------------------------- |
| `tsconfig.json`       | Vérification de types, IDE     | `nodenext` / `nodenext`       |
| `tsconfig.cjs.json`   | Sortie CommonJS                | hérité (`nodenext`)           |
| `tsconfig.esm.json`   | Sortie ES modules              | `esnext` / `bundler`          |
| `tsconfig.types.json` | Déclarations `.d.ts` partagées | hérité (`nodenext`)           |

Deux contraintes expliquent ces choix :

- `moduleResolution: node` (alias `node10`) est déprécié depuis TypeScript 6 et cesse de
  fonctionner en TypeScript 7. `nodenext` est la seule option non dépréciée pour un package
  CommonJS, et c'est aussi celle qui reflète la résolution réelle du package publié.
- `nodenext` émettrait du CommonJS pour les deux builds (le `package.json` racine ne déclare
  pas `"type": "module"`), d'où la sortie ES modules forcée côté ESM. Les imports relatifs
  des sources portent explicitement l'extension `.js`, ce qui rend cette sortie valide en
  ESM natif Node.

> Le projet reste sur TypeScript 5.x tant que `ts-jest` n'accepte pas TypeScript 6
> (`peerDependencies: typescript >=4.3 <6`). Les configurations sont néanmoins déjà
> compatibles TypeScript 6, ce qui évite les erreurs dans les IDE utilisant une version
> plus récente que celle du projet.

## Licence

MIT
