import { buildGraph, generateSequence, getMaxReachableLength } from '../src';
import type { Graph } from '../src';
import {
  chain,
  cycle,
  dense,
  isolated,
  node,
  tagged,
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
});
