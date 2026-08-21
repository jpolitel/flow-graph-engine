import { buildGraph, generateSequence, getMaxReachableLength } from '../src';
import type { Graph } from '../src';
import {
  chain,
  cycle,
  dense,
  isolated,
  largeDense,
  multiTagged,
  node,
  scattered,
  tagged,
  trap,
  twinPaths,
  twoComponents,
} from './fixtures/graphs';

/** Vérifie qu'une séquence est un chemin simple valide du graphe. */
function expectValidPath(graph: Graph, sequence: string[], allowed: string[]): void {
  expect(new Set(sequence).size).toBe(sequence.length);

  for (const id of sequence) {
    expect(allowed).toContain(id);
    expect(graph.nodes.has(id)).toBe(true);
  }

  for (let i = 0; i + 1 < sequence.length; i += 1) {
    const from = sequence[i] as string;
    const to = sequence[i + 1] as string;
    expect(graph.successors.get(from)).toContain(to);
  }
}

const allIds = (ids: { id: string }[]): string[] => ids.map((n) => n.id);

describe('generateSequence — cas nominaux', () => {
  it('produit la chaîne complète quand elle correspond à la longueur demandée', () => {
    const graph = buildGraph(chain);

    // Une seule solution existe, et il faut que le départ tombe sur c1. Le
    // budget de tentatives est relevé pour que la probabilité d'échec soit
    // négligeable plutôt que simplement faible.
    const result = generateSequence(graph, {
      knownNodeIds: allIds(chain),
      targetLength: 4,
      maxAttempts: 300,
    });

    expect(result.sequence).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(result.achievedLength).toBe(4);
    expect(result.requestedLength).toBe(4);
    expect(result.truncated).toBe(false);
  });

  it('produit un sous-chemin valide pour une longueur inférieure', () => {
    const graph = buildGraph(chain);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(chain),
      targetLength: 2,
    });

    expect(result.achievedLength).toBe(2);
    expect(result.truncated).toBe(false);
    expectValidPath(graph, result.sequence, allIds(chain));
  });

  it('reste valide sur de nombreux tirages dans un graphe dense', () => {
    const graph = buildGraph(dense);

    for (let i = 0; i < 50; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(dense),
        targetLength: 4,
      });

      expect(result.achievedLength).toBe(4);
      expectValidPath(graph, result.sequence, allIds(dense));
    }
  });

  it('respecte le nœud de départ imposé', () => {
    const graph = buildGraph(dense);

    for (let i = 0; i < 20; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(dense),
        targetLength: 3,
        startNodeId: 'd3',
      });

      expect(result.sequence[0]).toBe('d3');
      expectValidPath(graph, result.sequence, allIds(dense));
    }
  });
});

describe('generateSequence — troncature', () => {
  it('signale la troncature quand le sous-graphe est trop petit', () => {
    const graph = buildGraph(chain);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(chain),
      targetLength: 10,
    });

    expect(result.requestedLength).toBe(10);
    expect(result.achievedLength).toBe(4);
    expect(result.truncated).toBe(true);
    expectValidPath(graph, result.sequence, allIds(chain));
  });

  it('retourne le plus long chemin disponible parmi des composantes disjointes', () => {
    const graph = buildGraph(twoComponents);

    // Idem : seule la composante a1 -> a2 -> a3 atteint la longueur demandée.
    const result = generateSequence(graph, {
      knownNodeIds: allIds(twoComponents),
      targetLength: 3,
      maxAttempts: 300,
    });

    expect(result.sequence).toEqual(['a1', 'a2', 'a3']);
    expect(result.truncated).toBe(false);
  });

  it('ne dépasse jamais la taille de la composante du départ imposé', () => {
    const graph = buildGraph(twoComponents);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(twoComponents),
      targetLength: 5,
      startNodeId: 'b1',
    });

    expect(result.sequence).toEqual(['b1', 'b2']);
    expect(result.truncated).toBe(true);
  });
});

describe('generateSequence — cas limites', () => {
  it('gère un graphe vide', () => {
    const result = generateSequence(buildGraph([]), {
      knownNodeIds: [],
      targetLength: 5,
    });

    expect(result.sequence).toEqual([]);
    expect(result.achievedLength).toBe(0);
    expect(result.truncated).toBe(true);
  });

  it('gère un nœud unique isolé', () => {
    const graph = buildGraph(isolated);

    const exact = generateSequence(graph, { knownNodeIds: ['i1'], targetLength: 1 });
    expect(exact.sequence).toEqual(['i1']);
    expect(exact.truncated).toBe(false);

    const tooLong = generateSequence(graph, { knownNodeIds: ['i1'], targetLength: 3 });
    expect(tooLong.sequence).toEqual(['i1']);
    expect(tooLong.truncated).toBe(true);
  });

  it('ne boucle pas sur un cycle simple (chemin sans répétition)', () => {
    const graph = buildGraph(cycle);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(cycle),
      targetLength: 6,
    });

    expect(result.achievedLength).toBe(3);
    expect(result.truncated).toBe(true);
    expectValidPath(graph, result.sequence, allIds(cycle));
  });

  it('retourne une séquence vide quand aucun nœud connu ne subsiste', () => {
    const graph = buildGraph(chain);

    const result = generateSequence(graph, { knownNodeIds: [], targetLength: 3 });

    expect(result.sequence).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it('ignore les identifiants connus absents du graphe', () => {
    const graph = buildGraph(chain);

    const result = generateSequence(graph, {
      knownNodeIds: ['c1', 'c2', 'inconnu'],
      targetLength: 2,
    });

    expect(result.sequence).toEqual(['c1', 'c2']);
    expect(result.truncated).toBe(false);
  });

  it('ne relie pas deux nœuds dont l’intermédiaire est inconnu', () => {
    const graph = buildGraph(chain);

    const result = generateSequence(graph, {
      knownNodeIds: ['c1', 'c3'],
      targetLength: 2,
    });

    expect(result.achievedLength).toBe(1);
    expect(result.truncated).toBe(true);
  });

  it('retourne une séquence vide pour une longueur nulle ou négative', () => {
    const graph = buildGraph(chain);

    for (const targetLength of [0, -3]) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(chain),
        targetLength,
      });

      expect(result.sequence).toEqual([]);
      expect(result.requestedLength).toBe(0);
      expect(result.truncated).toBe(false);
    }
  });

  it('retourne une séquence vide si le départ imposé est hors du sous-graphe', () => {
    const graph = buildGraph(chain);

    const result = generateSequence(graph, {
      knownNodeIds: ['c1', 'c2'],
      targetLength: 2,
      startNodeId: 'c4',
    });

    expect(result.sequence).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it('ramène un maxAttempts nul ou négatif à une seule tentative', () => {
    const graph = buildGraph(chain);

    // Départ imposé : la tentative unique devient déterministe, ce qui permet
    // d'asserter la séquence exacte sans dépendre du tirage du point de départ.
    for (const maxAttempts of [0, -5]) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(chain),
        targetLength: 2,
        startNodeId: 'c1',
        maxAttempts,
      });

      expect(result.sequence).toEqual(['c1', 'c2']);
      expect(result.truncated).toBe(false);
    }
  });

  it('reste valide avec une tentative unique et un départ tiré au sort', () => {
    const graph = buildGraph(chain);

    // Une seule marche peut démarrer sur un cul-de-sac : le résultat est alors
    // légitimement plus court que demandé. Seuls les invariants sont garantis.
    for (let i = 0; i < 30; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(chain),
        targetLength: 4,
        maxAttempts: 1,
      });

      expect(result.achievedLength).toBeGreaterThanOrEqual(1);
      expect(result.achievedLength).toBeLessThanOrEqual(4);
      expect(result.truncated).toBe(result.achievedLength < 4);
      expectValidPath(graph, result.sequence, allIds(chain));
    }
  });
});

describe('generateSequence — filtrage par tags', () => {
  it('ne retient que les nœuds portant au moins un tag demandé', () => {
    const graph = buildGraph(tagged);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(tagged),
      requiredTags: ['doux'],
      targetLength: 2,
    });

    expect(result.sequence).toEqual(['t1', 't3']);
    expect(result.truncated).toBe(false);
  });

  it('mélange les styles quand plusieurs tags sont demandés', () => {
    const graph = buildGraph(tagged);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(tagged),
      requiredTags: ['doux', 'intense'],
      targetLength: 4,
    });

    expect(result.achievedLength).toBe(4);
    expectValidPath(graph, result.sequence, allIds(tagged));
  });

  it('traite une liste de tags vide comme une absence de filtre', () => {
    const graph = buildGraph(tagged);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(tagged),
      requiredTags: [],
      targetLength: 4,
    });

    expect(result.achievedLength).toBe(4);
  });

  it('retourne une séquence vide si aucun nœud ne porte le tag', () => {
    const graph = buildGraph(tagged);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(tagged),
      requiredTags: ['inexistant'],
      targetLength: 3,
    });

    expect(result.sequence).toEqual([]);
    expect(result.truncated).toBe(true);
  });
});

describe('generateSequence — graine', () => {
  // Les assertions portent sur la reproductibilité, jamais sur une séquence
  // littérale attendue pour une graine donnée : figer une sortie exacte
  // reviendrait à figer l'algorithme, que la roadmap prévoit de faire évoluer.

  it('produit la même séquence à graine, graphe et options identiques', () => {
    const graph = buildGraph(dense);
    const options = { knownNodeIds: allIds(dense), targetLength: 4, seed: 'graine' };

    const reference = generateSequence(graph, options);

    for (let i = 0; i < 5; i += 1) {
      expect(generateSequence(graph, options).sequence).toEqual(reference.sequence);
    }
    expectValidPath(graph, reference.sequence, allIds(dense));
  });

  it('accepte une graine numérique comme une graine textuelle', () => {
    const graph = buildGraph(dense);

    for (const seed of [7, 'sept']) {
      const first = generateSequence(graph, {
        knownNodeIds: allIds(dense),
        targetLength: 4,
        seed,
      });
      const second = generateSequence(graph, {
        knownNodeIds: allIds(dense),
        targetLength: 4,
        seed,
      });

      expect(first.sequence).toEqual(second.sequence);
    }
  });

  it('explore réellement des séquences différentes selon la graine', () => {
    const graph = buildGraph(dense);

    const produced = new Set(
      Array.from({ length: 20 }, (_unused, i) =>
        generateSequence(graph, {
          knownNodeIds: allIds(dense),
          targetLength: 4,
          seed: `graine-${i}`,
        }).sequence.join(),
      ),
    );

    // 120 chemins de longueur 4 existent dans ce graphe : une graine qui ne
    // changerait rien se verrait immédiatement.
    expect(produced.size).toBeGreaterThan(1);
  });

  it('reste non reproductible en l’absence de graine', () => {
    const graph = buildGraph(dense);

    const produced = new Set(
      Array.from({ length: 50 }, () =>
        generateSequence(graph, {
          knownNodeIds: allIds(dense),
          targetLength: 4,
        }).sequence.join(),
      ),
    );

    expect(produced.size).toBeGreaterThan(1);
  });

  it('rend aussi getMaxReachableLength reproductible', () => {
    const graph = buildGraph(twoComponents);
    const options = { knownNodeIds: allIds(twoComponents), seed: 'borne' };

    expect(getMaxReachableLength(graph, options)).toBe(
      getMaxReachableLength(graph, options),
    );
  });
});

describe('generateSequence — pondération', () => {
  it('écarte un nœud de poids nul tant qu’une alternative existe', () => {
    const graph = buildGraph(dense);

    // 5 nœuds, 4 demandés : d5 n'est jamais nécessaire pour atteindre la
    // longueur, un poids nul doit donc suffire à l'éviter à chaque tirage.
    for (let i = 0; i < 30; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(dense),
        targetLength: 4,
        nodeWeights: { d5: 0 },
      });

      expect(result.sequence).not.toContain('d5');
      expect(result.achievedLength).toBe(4);
    }
  });

  it('n’exclut jamais un nœud de poids nul qui est le seul passage', () => {
    const graph = buildGraph(chain);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(chain),
      targetLength: 4,
      startNodeId: 'c1',
      nodeWeights: { c3: 0 },
    });

    // Un poids nul relègue, il ne filtre pas : sans c3, pas de chemin de 4.
    expect(result.sequence).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(result.truncated).toBe(false);
  });

  it('oriente fortement le tirage vers les nœuds valorisés', () => {
    const graph = buildGraph(dense);

    let favoured = 0;
    for (let i = 0; i < 200; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(dense),
        targetLength: 2,
        startNodeId: 'd1',
        nodeWeights: { d5: 1000 },
      });

      if (result.sequence[1] === 'd5') favoured += 1;
    }

    // Poids 1000 contre 1 pour chacun des trois autres candidats : l'espérance
    // dépasse 199 sur 200. Le seuil laisse une marge très large.
    expect(favoured).toBeGreaterThan(180);
  });

  it('applique les poids de tags', () => {
    const graph = buildGraph(tagged);

    // t1 mène à t2 (intense) et t3 (doux) : annuler un tag force l'autre.
    const versDoux = generateSequence(graph, {
      knownNodeIds: allIds(tagged),
      targetLength: 2,
      startNodeId: 't1',
      tagWeights: { intense: 0 },
    });
    expect(versDoux.sequence).toEqual(['t1', 't3']);

    const versIntense = generateSequence(graph, {
      knownNodeIds: allIds(tagged),
      targetLength: 2,
      startNodeId: 't1',
      tagWeights: { doux: 0 },
    });
    expect(versIntense.sequence).toEqual(['t1', 't2']);
  });

  it('multiplie les poids des tags portés par un même nœud', () => {
    const graph = buildGraph(multiTagged);

    // m2 porte (doux, rapide) et m3 (intense, lent) : annuler un seul des deux
    // tags d'un nœud suffit à annuler son poids, ce qui n'est vrai que si les
    // poids se multiplient.
    const versM3 = generateSequence(graph, {
      knownNodeIds: allIds(multiTagged),
      targetLength: 2,
      startNodeId: 'm1',
      tagWeights: { rapide: 0 },
    });
    expect(versM3.sequence).toEqual(['m1', 'm3']);

    const versM2 = generateSequence(graph, {
      knownNodeIds: allIds(multiTagged),
      targetLength: 2,
      startNodeId: 'm1',
      tagWeights: { lent: 0 },
    });
    expect(versM2.sequence).toEqual(['m1', 'm2']);
  });

  it('combine poids de nœud et poids de tag', () => {
    const graph = buildGraph(multiTagged);

    // Le tag valorise m2, le poids de nœud l'annule : le produit l'emporte.
    const result = generateSequence(graph, {
      knownNodeIds: allIds(multiTagged),
      targetLength: 2,
      startNodeId: 'm1',
      tagWeights: { rapide: 100 },
      nodeWeights: { m2: 0 },
    });

    expect(result.sequence).toEqual(['m1', 'm3']);
  });

  it('ramène un poids négatif à zéro', () => {
    const graph = buildGraph(tagged);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(tagged),
      targetLength: 2,
      startNodeId: 't1',
      nodeWeights: { t2: -10 },
    });

    expect(result.sequence).toEqual(['t1', 't3']);
  });

  it('ignore les poids non finis et les identifiants inconnus', () => {
    const graph = buildGraph(chain);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(chain),
      targetLength: 4,
      startNodeId: 'c1',
      nodeWeights: { c2: Number.NaN, inconnu: 5 },
      tagWeights: { absent: Number.POSITIVE_INFINITY },
    });

    // Poids inexploitables : la génération se comporte comme sans pondération.
    expect(result.sequence).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(result.truncated).toBe(false);
  });

  it('tolère une pondération qui annule tous les candidats', () => {
    const graph = buildGraph(dense);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(dense),
      targetLength: 3,
      nodeWeights: Object.fromEntries(allIds(dense).map((id) => [id, 0])),
    });

    // Plus aucun poids ne départage : le tirage redevient uniforme, sans échec.
    expect(result.achievedLength).toBe(3);
    expectValidPath(graph, result.sequence, allIds(dense));
  });

  it('laisse la pondération sans effet sur la validité des chemins', () => {
    const graph = buildGraph(dense);

    for (let i = 0; i < 30; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(dense),
        targetLength: 4,
        nodeWeights: { d1: 9, d2: 0.5 },
        tagWeights: { inexistant: 3 },
      });

      expectValidPath(graph, result.sequence, allIds(dense));
    }
  });
});

describe('generateSequence — composantes et exhaustivité', () => {
  it('trouve le chemin long malgré une tentative unique et des culs-de-sac', () => {
    const graph = buildGraph(trap);

    // Une seule marche part le plus souvent d'un cul-de-sac. Sans exploration
    // exhaustive de la composante, ce test serait instable par construction.
    for (let i = 0; i < 30; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(trap),
        targetLength: 5,
        maxAttempts: 1,
      });

      expect(result.sequence).toEqual(['h', 'p1', 'p2', 'p3', 'p4']);
      expect(result.truncated).toBe(false);
    }
  });

  it('atteint la meilleure composante même en une seule tentative', () => {
    const graph = buildGraph(twoComponents);

    for (let i = 0; i < 30; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(twoComponents),
        targetLength: 3,
        maxAttempts: 1,
      });

      expect(result.sequence).toEqual(['a1', 'a2', 'a3']);
    }
  });

  it('ne fige pas la séquence quand plusieurs chemins optimaux existent', () => {
    const graph = buildGraph(twinPaths);

    const produced = new Set<string>();
    for (let i = 0; i < 60; i += 1) {
      const result = generateSequence(graph, {
        knownNodeIds: allIds(twinPaths),
        targetLength: 4,
        maxAttempts: 1,
      });

      expect(result.achievedLength).toBe(4);
      expectValidPath(graph, result.sequence, allIds(twinPaths));
      produced.add(result.sequence.join());
    }

    // L'ordre de parcours de l'exploration exhaustive est tiré au sort : les
    // deux branches doivent apparaître.
    expect(produced).toContain('h,a1,a2,a3');
    expect(produced).toContain('h,b1,b2,b3');
  });

  it('reste reproductible sous graine malgré l’exploration exhaustive', () => {
    const graph = buildGraph(twinPaths);
    const options = {
      knownNodeIds: allIds(twinPaths),
      targetLength: 4,
      maxAttempts: 1,
      seed: 'exhaustif',
    };

    const reference = generateSequence(graph, options).sequence;
    for (let i = 0; i < 10; i += 1) {
      expect(generateSequence(graph, options).sequence).toEqual(reference);
    }
  });

  it('reste heuristique sur une composante trop grande, sans échouer', () => {
    const graph = buildGraph(largeDense);

    // 20 nœuds : au-delà du seuil d'exhaustivité. Le graphe étant dense, les
    // marches suffisent à parcourir tous les nœuds.
    const result = generateSequence(graph, {
      knownNodeIds: allIds(largeDense),
      targetLength: 20,
    });

    expect(result.achievedLength).toBe(20);
    expectValidPath(graph, result.sequence, allIds(largeDense));
  });

  it('gère un sous-graphe entièrement fait de nœuds isolés', () => {
    const graph = buildGraph(scattered);

    const result = generateSequence(graph, {
      knownNodeIds: allIds(scattered),
      targetLength: 2,
    });

    expect(result.achievedLength).toBe(1);
    expect(result.truncated).toBe(true);
  });
});

describe('getMaxReachableLength', () => {
  it('retourne la longueur de la chaîne complète', () => {
    expect(
      getMaxReachableLength(buildGraph(chain), { knownNodeIds: allIds(chain) }),
    ).toBe(4);
  });

  it('retourne 0 sur un graphe vide', () => {
    expect(getMaxReachableLength(buildGraph([]), { knownNodeIds: [] })).toBe(0);
  });

  it('retourne 1 sur un nœud isolé', () => {
    expect(getMaxReachableLength(buildGraph(isolated), { knownNodeIds: ['i1'] })).toBe(1);
  });

  it('retourne la taille de la plus grande composante accessible', () => {
    expect(
      getMaxReachableLength(buildGraph(twoComponents), {
        knownNodeIds: allIds(twoComponents),
      }),
    ).toBe(3);
  });

  it('tient compte du filtre par tags', () => {
    expect(
      getMaxReachableLength(buildGraph(tagged), {
        knownNodeIds: allIds(tagged),
        requiredTags: ['doux'],
      }),
    ).toBe(2);
  });

  it('borne effectivement la génération : le résultat ne dépasse jamais la borne', () => {
    const graph = buildGraph(twoComponents);
    const bound = getMaxReachableLength(graph, { knownNodeIds: allIds(twoComponents) });

    const result = generateSequence(graph, {
      knownNodeIds: allIds(twoComponents),
      targetLength: 99,
    });

    expect(result.achievedLength).toBeLessThanOrEqual(bound);
  });

  it('gère un nœud unique référencé mais absent du graphe', () => {
    expect(
      getMaxReachableLength(buildGraph([node('seul')]), { knownNodeIds: ['autre'] }),
    ).toBe(0);
  });

  it('donne la borne exacte sur une composante piégeuse, sans dépendre du tirage', () => {
    const graph = buildGraph(trap);

    // Le plus long chemin vaut 5 et part de `h` : une borne obtenue par simples
    // marches serait fluctuante avec une tentative unique.
    for (let i = 0; i < 30; i += 1) {
      expect(
        getMaxReachableLength(graph, { knownNodeIds: allIds(trap), maxAttempts: 1 }),
      ).toBe(5);
    }
  });

  it('retient la plus grande composante et non la première rencontrée', () => {
    // b1 -> b2 est déclarée avant la composante longue : la borne ne doit pas
    // dépendre de l'ordre de déclaration.
    const graph = buildGraph([
      node('b1', { successors: ['b2'] }),
      node('b2'),
      node('a1', { successors: ['a2'] }),
      node('a2', { successors: ['a3'] }),
      node('a3'),
    ]);

    expect(
      getMaxReachableLength(graph, {
        knownNodeIds: ['b1', 'b2', 'a1', 'a2', 'a3'],
        maxAttempts: 1,
      }),
    ).toBe(3);
  });

  it('retourne 1 sur un sous-graphe de nœuds isolés', () => {
    expect(
      getMaxReachableLength(buildGraph(scattered), { knownNodeIds: allIds(scattered) }),
    ).toBe(1);
  });

  it('se limite à la composante du départ imposé', () => {
    const graph = buildGraph(trap);

    // Depuis un cul-de-sac, aucune arête sortante : la borne vaut 1, alors que
    // la composante entière permet 5.
    expect(
      getMaxReachableLength(graph, {
        knownNodeIds: allIds(trap),
        startNodeId: 'dead3',
      }),
    ).toBe(1);
  });

  it('reste exploitable sur une composante trop grande pour l’exhaustivité', () => {
    expect(
      getMaxReachableLength(buildGraph(largeDense), {
        knownNodeIds: allIds(largeDense),
      }),
    ).toBe(20);
  });
});
