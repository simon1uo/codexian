import * as path from 'path';

export function parseEnvVariables(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
    const idx = withoutExport.indexOf('=');
    if (idx <= 0) {
      continue;
    }
    let key = withoutExport.slice(0, idx).trim();
    const value = withoutExport.slice(idx + 1).trim();
    if (!key) {
      continue;
    }
    if (key.endsWith('+')) {
      key = key.slice(0, -1).trim();
      if (!key) continue;
      const current = result[key] || process.env[key] || '';
      const sep = current ? path.delimiter : '';
      result[key] = `${current}${sep}${value}`;
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function resolveDefaultModel(models: Array<{ id?: string; model?: string; isDefault?: boolean }>): string | undefined {
  if (models.length === 0) return undefined;
  const preferred = models.find((entry) => entry.isDefault) ?? models[0];
  if (!preferred) return undefined;
  return preferred.id || preferred.model;
}

export function normalizeModelSelection(
  current: string | undefined,
  models: Array<{ id?: string; model?: string; isDefault?: boolean }>
): string | undefined {
  if (!current) {
    return resolveDefaultModel(models);
  }
  const exists = models.some((entry) => entry.id === current || entry.model === current);
  if (exists) return current;
  return resolveDefaultModel(models);
}
