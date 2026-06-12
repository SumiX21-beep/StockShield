export function bullMqJobId(...parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part): part is string | number => part !== null && part !== undefined)
    .map((part) => toBullMqJobId(String(part)))
    .join("__");
}

export function toBullMqJobId(value: string) {
  return value.replace(/:/g, "_");
}
