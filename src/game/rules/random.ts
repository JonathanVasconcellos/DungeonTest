/** Retorna somente inteiros, incluindo os dois limites. */
export function randomInt(min: number, max: number): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  if (upper < lower) throw new RangeError('O limite máximo precisa ser maior ou igual ao mínimo.');
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

/** Chance percentual com precisão de 0,01%; o valor sorteado continua inteiro. */
export function randomChance(percent: number): boolean {
  const threshold = Math.max(0, Math.min(10000, Math.round(percent * 100)));
  return randomInt(0, 9999) < threshold;
}

/** Sorteia dentro da faixa inclusiva de dano, sem valores fracionários. */
export function randomDamage(min: number, max: number): number {
  return randomInt(min, max);
}
