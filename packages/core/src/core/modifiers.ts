export interface Modifier {
  source: string;
  type: 'add' | 'mult';
  value: number;
}

export function applyModifiers(base: number, mods: Modifier[]): number {
  const add = mods.filter((m) => m.type === 'add').reduce((s, m) => s + m.value, 0);
  const mult = mods
    .filter((m) => m.type === 'mult')
    .reduce((p, m) => p * (1 + m.value), 1);
  return base * (1 + add) * mult;
}
