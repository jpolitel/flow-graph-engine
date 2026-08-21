/**
 * Source pseudo-aléatoire déterministe.
 *
 * Aucune dépendance : le moteur doit tourner dans un moteur JS mobile comme dans
 * Node. `Math.random` reste la source par défaut ; une graine fournie par
 * l'appelant rend la génération reproductible, ce qui permet aux applications
 * consommatrices d'écrire des tests sur des séquences exactes.
 */

/**
 * Dérive un état 32 bits à partir d'une graine arbitraire (xmur3).
 *
 * Les graines sont converties en chaîne avant hachage : deux graines voisines
 * (`1` et `2`, `"test-a"` et `"test-b"`) produisent ainsi des suites franchement
 * décorrélées, là où alimenter directement le générateur avec des états voisins
 * donnerait des premiers tirages proches.
 */
function hashSeed(seed: number | string): number {
  const text = String(seed);
  let h = 1779033703 ^ text.length;

  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Générateur mulberry32 : état de 32 bits, rapide, sans dépendance, de qualité
 * largement suffisante pour des tirages pondérés.
 *
 * @returns une fonction équivalente à `Math.random` (valeurs dans `[0, 1[`),
 * mais reproductible à graine égale.
 */
export function createRandom(seed: number | string): () => number {
  let state = hashSeed(seed);

  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
