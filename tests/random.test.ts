import { createRandom } from '../src/random';

/** Tire `count` valeurs successives d'une source. */
function draw(random: () => number, count: number): number[] {
  return Array.from({ length: count }, () => random());
}

describe('createRandom', () => {
  it('produit la même suite pour une même graine', () => {
    expect(draw(createRandom('graine'), 20)).toEqual(draw(createRandom('graine'), 20));
  });

  it('accepte indifféremment un nombre ou une chaîne', () => {
    expect(draw(createRandom(42), 10)).toEqual(draw(createRandom(42), 10));
    // 42 et '42' passent par la même conversion en chaîne : suites identiques.
    expect(draw(createRandom(42), 10)).toEqual(draw(createRandom('42'), 10));
  });

  it('décorrèle des graines voisines', () => {
    // Le hachage de la graine existe précisément pour ça : sans lui, des états
    // initiaux voisins donneraient des premiers tirages voisins.
    for (const [a, b] of [
      [1, 2],
      ['test-a', 'test-b'],
    ] as const) {
      const first = draw(createRandom(a), 5);
      const second = draw(createRandom(b), 5);
      expect(first).not.toEqual(second);
      expect(Math.abs((first[0] as number) - (second[0] as number))).toBeGreaterThan(
        0.01,
      );
    }
  });

  it('reste dans [0, 1[', () => {
    const random = createRandom('bornes');

    for (const value of draw(random, 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('ne dégénère pas : moyenne proche de 0,5 et valeurs distinctes', () => {
    const values = draw(createRandom('distribution'), 2000);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(new Set(values).size).toBeGreaterThan(1900);
  });
});
