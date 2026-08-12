import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JsonStore<T> {
  constructor(
    readonly filename: string,
    readonly fallback: () => T,
    readonly normalize: (source: Record<string, unknown>) => T,
  ) {}

  async read(): Promise<T> {
    try {
      const content = await readFile(this.filename, 'utf8');
      return this.normalize(JSON.parse(content) as Record<string, unknown>);
    } catch {
      return this.fallback();
    }
  }

  async write(value: T): Promise<void> {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, this.filename);
  }
}
