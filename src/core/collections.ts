import { BLOG_COLLECTION } from "../../schemas/blog.ts";
import { PROJECTS_COLLECTION } from "../../schemas/project.ts";
import type { Collection } from "./collection.ts";

/**
 * The collection registry. The CLI (and later the REST surface) look up a
 * Collection by name; adding a new collection is one line here plus a schema
 * file. The store layer never appears in this file because the store layer
 * doesn't know about specific collections.
 */
export const COLLECTIONS = {
  blog: BLOG_COLLECTION,
  projects: PROJECTS_COLLECTION,
} as const satisfies Record<string, Collection<any, any>>;

export type CollectionName = keyof typeof COLLECTIONS;

export function getCollection(name: string): Collection<any, any> | undefined {
  return (COLLECTIONS as Record<string, Collection<any, any>>)[name];
}

export function collectionNames(): string[] {
  return Object.keys(COLLECTIONS);
}
