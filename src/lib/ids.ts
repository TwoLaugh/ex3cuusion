let counter = 0;
const processNonce = Math.random().toString(36).slice(2, 8);

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${processNonce}_${counter.toString(36).padStart(4, "0")}`;
}

export function resetIds() {
  counter = 0;
}
