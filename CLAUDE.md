# CLAUDE.md — flow-graph-engine

> Ce fichier pilote le développement assisté par Claude Code sur ce dépôt.
> Nom de dépôt proposé : `flow-graph-engine` (à renommer si tu préfères).

## 1. Rôle du projet

Moteur **générique** de génération de séquences via parcours de graphe orienté.

Le cas d'usage initial est une application de figures de shibari (dépôt séparé `RopeR`),
mais **ce moteur ne doit jamais contenir de vocabulaire ou de logique spécifique au shibari**.
Il doit rester assez neutre pour être réutilisé plus tard par une app de flow yoga, une
app de chorégraphie, un générateur de recettes en étapes, etc.

**Règle d'or : si un nom de variable, un type, ou un commentaire mentionne "figure",
"corde", "position assise/debout", "shibari" ou tout terme du domaine → c'est un signal
que ce code n'a rien à faire dans ce dépôt.** Le domaine (shibari, yoga, ...) vit dans
l'app consommatrice, pas ici.

## 2. Stack technique

- **TypeScript pur**, compilé en CommonJS + ESM (double build) pour compat large.
- Aucune dépendance à React Native, Node-only APIs interdites (le package doit pouvoir
  tourner dans un moteur JS mobile comme dans Node pour les tests).
- Package **installable via npm** sous le nom scopé `@syncopelab/flow-graph-engine`
  (le dépôt garde le nom `flow-graph-engine`). Le scope nécessite `--access public` à la
  publication, déjà présent dans le workflow.
- Node.js LTS pour le dev (aligné sur tes autres projets) — voir `.nvmrc` (Node 22),
  Node 18 minimum.
- Tests : Jest.
- Linting : ESLint + Prettier (config stricte, `noImplicitAny` activé).
- **TypeScript reste en 5.x** tant que `ts-jest` n'accepte pas TypeScript 6
  (`peerDependencies: typescript >=4.3 <6`). Les `tsconfig` sont malgré tout écrits pour
  être valides sous TypeScript 6 : `moduleResolution: node` (node10) y est déprécié et
  disparaît en TypeScript 7, on utilise donc `nodenext` partout, sauf pour le build ESM
  qui force `esnext` + `bundler`. Détail du raisonnement dans le README.

## 3. Modèle de données abstrait

Le moteur manipule des **nœuds génériques**, jamais des "figures" :

```typescript
interface GraphNode {
  id: string;
  tags: string[]; // ex: styles, catégories — domaine-agnostique
  attributes?: Record<string, unknown>; // métadonnées libres, ignorées par le moteur
  predecessors: string[]; // IDs des nœuds qui peuvent précéder
  successors: string[]; // IDs des nœuds qui peuvent suivre
}

interface GenerationOptions {
  knownNodeIds: string[]; // sous-ensemble de nœuds "autorisés"
  requiredTags?: string[]; // filtre optionnel sur les tags à mélanger
  targetLength: number; // longueur souhaitée (via le curseur côté app)
  startNodeId?: string; // optionnel, sinon départ aléatoire pondéré
  maxAttempts?: number; // nb de tentatives de recherche (défaut raisonnable)
  seed?: number | string; // graine : génération reproductible (0.2)
  nodeWeights?: Record<string, number>; // poids par nœud, défaut 1 (0.2)
  tagWeights?: Record<string, number>; // poids par tag, multipliés entre eux (0.2)
}

interface GenerationResult {
  sequence: string[]; // IDs ordonnés
  requestedLength: number;
  achievedLength: number;
  truncated: boolean; // true si achievedLength < requestedLength
}
```

## 4. Algorithme de génération

- Construire le **sous-graphe induit** par `knownNodeIds` (+ filtre `requiredTags` si fourni).
- Recherche d'un chemin de longueur `targetLength` par **marche aléatoire pondérée avec
  backtracking borné** (pas de recherche exhaustive du plus long chemin — NP-difficile en
  général — mais plusieurs tentatives randomisées avec `maxAttempts`, on garde le meilleur
  résultat trouvé).
- Le sous-graphe est découpé en **composantes faiblement connexes** (0.3). Leur taille
  majore la longueur des chemins qu'elles contiennent : celles qui ne peuvent plus dépasser
  le meilleur chemin trouvé sont écartées, et la recherche s'arrête quand il n'en reste
  aucune. C'est cet invariant, et non une heuristique, qui autorise l'élagage.
- Si les marches échouent à atteindre `targetLength`, les composantes d'au plus 14 nœuds
  sont explorées **exhaustivement**, sous budget d'expansions borné (0.3). L'ordre de
  parcours y est tiré au sort : sans cela, la garantie de trouver un chemin existant se
  paierait d'une séquence toujours identique — ce qui, pour une app de génération, serait
  une régression fonctionnelle, pas une amélioration.
- **Ne jamais planter en cas de cul-de-sac ou de sous-graphe trop petit** : retourner le
  meilleur chemin trouvé avec `truncated: true` et `achievedLength` réel. C'est à l'app
  consommatrice d'afficher le message ("longueur max avec tes figures : N").
- Fonction dédiée `getMaxReachableLength(subgraph, options)` que l'app peut appeler pour
  afficher une borne avant génération. Exacte sur les composantes explorées exhaustivement,
  minorante au-delà.
- Cas limites à couvrir explicitement dans les tests : graphe vide, un seul nœud, nœud
  isolé (pas de successeur), cycle simple, sous-graphe déconnecté (composantes multiples),
  `knownNodeIds` filtrant tout le graphe.

## 5. API publique du package

```typescript
export function buildGraph(nodes: GraphNode[]): Graph;
export function generateSequence(
  graph: Graph,
  options: GenerationOptions,
): GenerationResult;
export function getMaxReachableLength(
  graph: Graph,
  options: Omit<GenerationOptions, "targetLength">,
): number;

// Diagnostic destiné aux scripts de validation de catalogue des apps consommatrices.
export function findDanglingReferences(
  nodes: GraphNode[],
): { nodeId: string; field: "predecessors" | "successors"; missingId: string }[];
```

Garder la surface d'API minimale. Toute logique interne (construction du sous-graphe,
backtracking, pondération) reste privée.

### Règles de construction du graphe (décidées en 0.1)

- Une arête `a -> b` existe si `a` déclare `b` dans ses `successors` **ou** si `b` déclare
  `a` dans ses `predecessors` (union des deux sens) : déclarer un enchaînement d'un seul
  côté suffit, ce qui évite d'imposer la double saisie aux catalogues.
- Les références vers des IDs inexistants sont **ignorées silencieusement** (le moteur ne
  doit pas planter sur un catalogue imparfait) ; `findDanglingReferences` sert à les
  détecter en amont, côté app.
- Les boucles sur soi-même sont supprimées, les doublons d'adjacence aussi, l'ordre de
  déclaration est conservé.
- `buildGraph` ne lève d'exception que sur un identifiant dupliqué : c'est une erreur de
  programmation, pas une donnée imparfaite.
- Les séquences générées sont des **chemins simples** : aucun nœud n'est répété. Un cycle
  de 3 nœuds plafonne donc à une longueur de 3.
- `requiredTags` retient un nœud dès qu'il porte **au moins un** des tags demandés
  (sémantique « mélanger ces catégories »). Liste vide ou absente = pas de filtre.

### Règles de pondération (décidées en 0.2)

- Les poids **multiplient** le poids structurel (degré sortant + 1), ils ne le remplacent
  pas : la pondération de l'appelant infléchit la marche sans casser la préférence pour les
  nœuds qui ouvrent le plus de chemins.
- Les poids des tags portés par un même nœud se multiplient entre eux, puis par son
  `nodeWeights`. Un nœud cumulant deux préférences cumule les deux facteurs.
- Un poids **ne filtre pas** : `requiredTags` reste le seul mécanisme d'exclusion. Un poids
  nul relègue en dernier recours, sans jamais rendre un nœud inatteignable.
- Poids négatif ramené à `0`, valeur non finie ignorée : même philosophie que le reste du
  moteur, aucune donnée imparfaite ne doit provoquer d'exception.
- Le générateur pseudo-aléatoire reste **interne** (`src/random.ts`, mulberry32) : `seed`
  suffit à l'appelant, exposer le générateur élargirait l'API sans besoin identifié.

## 6. Structure de dossier

```
flow-graph-engine/
├── src/
│   ├── graph.ts        # construction et structures de graphe
│   ├── generate.ts     # algorithme de génération
│   ├── types.ts
│   └── index.ts         # exports publics
├── tests/
│   ├── graph.test.ts
│   ├── generate.test.ts
│   └── fixtures/         # petits graphes de test réutilisables
├── .github/workflows/
│   └── ci.yml            # lint + test + build sur push/PR, publish npm sur tag
├── package.json
├── tsconfig.json
└── README.md
```

## 7. CI/CD — GitHub Actions

- Workflow `ci.yml` : sur chaque push/PR → `npm ci`, `npm run lint`, `npm test`, `npm run build`.
- Publication npm : déclenchée sur un tag `vX.Y.Z` (semver strict), job séparé qui build
  puis publie via le **Trusted Publishing (OIDC)** — aucun secret, aucun `NPM_TOKEN`.
  npm ayant restreint les tokens « bypass 2FA » en août 2026 (ils perdent le droit de
  publier directement), c'est désormais la seule voie viable pour un CI.
  Contraintes : `permissions: id-token: write` dans le job, npm >= 11.5.1 (Node 22 embarque
  npm 10.9, d'où l'étape de mise à jour de npm), et une configuration côté npmjs.com sur
  la page du paquet : *Settings* → *Trusted publisher* → dépôt `jpolitel/flow-graph-engine`
  + fichier de workflow `publish.yml`.
  La provenance est générée automatiquement, sans passer `--provenance`.
- Pas de déploiement, c'est une lib pure — la CI sert uniquement de garde-fou qualité +
  publication.

## 8. Conventions de dev

- Workflow Git identique à tes autres projets : `pull.rebase true`, `rebase.autoStash true`,
  `--force-with-lease` après rebase.
- Commits en français.
- Toute nouvelle fonctionnalité doit être testée avant merge (tests unitaires obligatoires,
  pas d'exception pour "c'est trivial").
- Changelog tenu à jour (`CHANGELOG.md`, format Keep a Changelog) à chaque version publiée.

## 9. Roadmap

- **v0.1 — fait.** `buildGraph` + `generateSequence` (marche aléatoire pondérée avec
  backtracking borné), `getMaxReachableLength` et `findDanglingReferences` livrés en avance
  sur le plan initial. 40 tests, double build CJS/ESM vérifié par smoke test, CI en place.
  Publié sur npm le 12/08/2026 sous `@syncopelab/flow-graph-engine`, avec attestations de
  provenance.
- **v0.1.1 — fait.** Aucun changement de code : première publication par le Trusted
  Publishing OIDC mis en place après la 0.1.0, qui n'avait jamais été exercé.
- **v0.2.0 — fait.** Génération reproductible par `seed`, et pondération configurable
  (`nodeWeights`, `tagWeights`). Ces deux chantiers, initialement planifiés en « v0.3 », sont
  passés devant : sans tirage reproductible, aucune amélioration heuristique de la génération
  n'est mesurable, et les tests des applications consommatrices restaient cantonnés aux
  invariants. Les numéros de version suivent l'ordre de publication, la roadmap a donc été
  renumérotée plutôt que de sauter une version.
- **v0.3.0 — fait.** Découpage explicite en composantes faiblement connexes, avec élagage
  de celles qui ne peuvent plus faire mieux (leur taille majore la longueur des chemins
  qu'elles contiennent), et exploration exhaustive des composantes d'au plus 14 nœuds quand
  les marches échouent. `getMaxReachableLength` devient exact sur ces composantes.
- v0.4+ : rien de tranché. Pistes ouvertes — exposer au consommateur si la borne retournée
  est exacte ou seulement minorante, rendre les seuils d'exhaustivité configurables, ou
  contraindre la génération (nœud d'arrivée imposé, tags interdits).

## 10. État du dépôt

- Sources : `src/types.ts`, `src/graph.ts`, `src/generate.ts`, `src/random.ts`,
  `src/index.ts`.
- Tests : `tests/graph.test.ts`, `tests/generate.test.ts`, `tests/random.test.ts`, fixtures
  dans `tests/fixtures/graphs.ts`. Seuils de couverture appliqués par Jest.
- Les tests de génération vérifient des **invariants** (chemin simple valide, longueurs,
  troncature) plutôt que des séquences exactes, puisque la génération repose par défaut sur
  `Math.random`. Les assertions d'égalité stricte ne portent que sur les graphes où une
  seule solution existe, ou sur des pondérations qui ne laissent qu'un candidat crédible.
- Les tests de graine assertent la **reproductibilité** (deux appels identiques donnent le
  même résultat), jamais une sortie littérale attendue pour une graine donnée : figer une
  sortie exacte reviendrait à figer l'algorithme, que la roadmap prévoit de faire évoluer.
- Les fixtures `trap` et `twinPaths` existent pour éprouver l'exhaustivité : un départ tiré
  au sort y tombe presque toujours sur un cul-de-sac, si bien qu'un test à `maxAttempts: 1`
  échoue sans elle et réussit avec. Vérifié en rejouant les tests contre l'implémentation
  précédente — un test qui passe dans les deux cas ne prouve rien.
- CI : `.github/workflows/ci.yml` (lint, typecheck, tests, build sur Node 20 et 22) et
  `.github/workflows/publish.yml` (publication npm sur tag `vX.Y.Z`, avec vérification de
  cohérence entre le tag et la version du `package.json`).
