// Marque chaque dossier de build avec son système de modules, afin que Node
// interprète correctement les .js émis par tsc (le package racine est CommonJS).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const [folder, type] of [
  ['cjs', 'commonjs'],
  ['esm', 'module'],
]) {
  writeFileSync(
    join(root, 'dist', folder, 'package.json'),
    `${JSON.stringify({ type }, null, 2)}\n`,
  );
}
