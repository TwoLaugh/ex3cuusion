let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString().padStart(4, "0")}`;
}

export function resetIds() {
  counter = 0;
}
