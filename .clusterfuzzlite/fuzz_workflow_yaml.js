import { parse as parseYaml } from 'yaml';

function normalizeNeeds(value) {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string');
}

export function fuzz(data) {
  const input = data.toString('utf8');
  if (input.length > 20000) return;

  try {
    const doc = parseYaml(input);
    if (!doc || typeof doc !== 'object') return;

    const jobs = doc.jobs;
    if (!jobs || typeof jobs !== 'object') return;

    for (const [id, job] of Object.entries(jobs)) {
      if (typeof id !== 'string' || !job || typeof job !== 'object') continue;
      const needs = normalizeNeeds(job.needs);
      for (const need of needs) {
        if (typeof need !== 'string') {
          throw new Error('normalizeNeeds returned a non-string value');
        }
      }
    }
  } catch {
    // Keep target robust for malformed random input.
  }
}
