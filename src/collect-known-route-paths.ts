export function sortRoutePaths(paths: string[]): string[] {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b))
}
