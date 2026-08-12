import { buildGraph, findDanglingReferences } from '../src';
import { chain, node } from './fixtures/graphs';

describe('buildGraph', () => {
  it('accepte un graphe vide', () => {
    const graph = buildGraph([]);

    expect(graph.nodes.size).toBe(0);
    expect(graph.successors.size).toBe(0);
    expect(graph.predecessors.size).toBe(0);
  });

  it('indexe les nœuds et leurs adjacences', () => {
    const graph = buildGraph(chain);

    expect([...graph.nodes.keys()]).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(graph.successors.get('c1')).toEqual(['c2']);
    expect(graph.successors.get('c4')).toEqual([]);
    expect(graph.predecessors.get('c2')).toEqual(['c1']);
    expect(graph.predecessors.get('c1')).toEqual([]);
  });

  it('conserve les attributs et tags du nœud source', () => {
    const graph = buildGraph([node('n1', { tags: ['a'], attributes: { duree: 5 } })]);

    expect(graph.nodes.get('n1')?.tags).toEqual(['a']);
    expect(graph.nodes.get('n1')?.attributes).toEqual({ duree: 5 });
  });

  it('rejette les identifiants dupliqués', () => {
    expect(() => buildGraph([node('x'), node('x')])).toThrow(/dupliqué/);
  });

  it('crée une arête déclarée dans un seul sens (successors)', () => {
    const graph = buildGraph([node('a', { successors: ['b'] }), node('b')]);

    expect(graph.successors.get('a')).toEqual(['b']);
    expect(graph.predecessors.get('b')).toEqual(['a']);
  });

  it('crée une arête déclarée dans un seul sens (predecessors)', () => {
    const graph = buildGraph([node('a'), node('b', { predecessors: ['a'] })]);

    expect(graph.successors.get('a')).toEqual(['b']);
    expect(graph.predecessors.get('b')).toEqual(['a']);
  });

  it('ne duplique pas une arête déclarée des deux côtés', () => {
    const graph = buildGraph([
      node('a', { successors: ['b'] }),
      node('b', { predecessors: ['a'] }),
    ]);

    expect(graph.successors.get('a')).toEqual(['b']);
    expect(graph.predecessors.get('b')).toEqual(['a']);
  });

  it('déduplique les arêtes répétées dans une même liste', () => {
    const graph = buildGraph([node('a', { successors: ['b', 'b', 'b'] }), node('b')]);

    expect(graph.successors.get('a')).toEqual(['b']);
  });

  it('ignore les références vers des nœuds inexistants', () => {
    const graph = buildGraph([
      node('a', { successors: ['fantome'] }),
      node('b', { predecessors: ['fantome'] }),
    ]);

    expect(graph.successors.get('a')).toEqual([]);
    expect(graph.predecessors.get('b')).toEqual([]);
    expect(graph.nodes.has('fantome')).toBe(false);
  });

  it('supprime les boucles sur soi-même', () => {
    const graph = buildGraph([node('a', { successors: ['a'], predecessors: ['a'] })]);

    expect(graph.successors.get('a')).toEqual([]);
    expect(graph.predecessors.get('a')).toEqual([]);
  });

  it("conserve l'ordre de déclaration des successeurs", () => {
    const graph = buildGraph([
      node('a', { successors: ['c', 'b'] }),
      node('b'),
      node('c'),
    ]);

    expect(graph.successors.get('a')).toEqual(['c', 'b']);
  });
});

describe('findDanglingReferences', () => {
  it('ne signale rien sur un catalogue cohérent', () => {
    expect(findDanglingReferences(chain)).toEqual([]);
  });

  it('signale les références manquantes dans les deux champs', () => {
    const dangling = findDanglingReferences([
      node('a', { successors: ['absent1'] }),
      node('b', { predecessors: ['absent2'] }),
    ]);

    expect(dangling).toEqual([
      { nodeId: 'a', field: 'successors', missingId: 'absent1' },
      { nodeId: 'b', field: 'predecessors', missingId: 'absent2' },
    ]);
  });
});
