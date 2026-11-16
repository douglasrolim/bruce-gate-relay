// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

/** Minimal storage port. Backed by Durable Object storage in production, a Map in tests. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(prefix: string): Promise<Map<string, T>>;
}

/** Adapter over `DurableObjectStorage`. */
export class DurableObjectStore implements KeyValueStore {
  constructor(private readonly storage: DurableObjectStorage) {}

  get<T>(key: string): Promise<T | undefined> {
    return this.storage.get<T>(key);
  }
  put<T>(key: string, value: T): Promise<void> {
    return this.storage.put(key, value);
  }
  delete(key: string): Promise<boolean> {
    return this.storage.delete(key);
  }
  list<T>(prefix: string): Promise<Map<string, T>> {
    return this.storage.list<T>({ prefix });
  }
}

/** In-memory store with structured-clone semantics, for tests and local tools. */
export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
  async list<T>(prefix: string): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const k of [...this.data.keys()].sort()) {
      if (k.startsWith(prefix)) out.set(k, structuredClone(this.data.get(k)) as T);
    }
    return out;
  }
}
