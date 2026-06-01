import { z } from "zod";
import type { Collection } from "../src/core/collection.ts";

/**
 * The projects collection — Loom's second collection, and the test of the
 * Collection abstraction. Where blog rides markdown+frontmatter, projects
 * rides JSON: the source data (in enspyrco-site's old `lib/projects.ts`) is
 * pure structured records with no long-form prose body, so the natural
 * on-disk form is one JSON file per project.
 *
 * The store doesn't know any of this — it just calls `serialize`/`parse` on
 * the Collection. Format choice is a Collection concern, not a store concern.
 */

const PROJECT_ORGS = [
  "enspyrco",
  "nickmeinhold",
  "10xdeca",
  "imagineering-cc",
  "d3lk1ch1",
  "raggedr",
] as const;

const PROJECT_CATEGORIES = [
  "Education",
  "AI",
  "Social",
  "Robotics",
  "Simulation",
  "Dev Tools",
  "Creative Coding",
  "Gaming",
  "Experimental",
  "Infrastructure",
  "Community",
  "Research",
] as const;

export const projectOrgSchema = z.enum(PROJECT_ORGS);
export const projectCategorySchema = z.enum(PROJECT_CATEGORIES);

/**
 * Slug rule for projects: allow both kebab-case (`virtual-creatures`) and
 * snake_case (`tech_world`, `github_desktop_flutter`) because the existing
 * corpus uses both. Per-collection slug rules are why slug lives in the
 * input schema rather than the store.
 */
const projectSlug = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/,
    "slug must be lowercase alphanumeric with - or _ separators",
  );

export const projectInputSchema = z.object({
  slug: projectSlug,
  name: z.string().min(1, "name is required"),
  org: projectOrgSchema,
  description: z.string().min(1, "description is required"),
  categories: z.array(projectCategorySchema).min(1, "at least one category"),
  languages: z.array(z.string()).default([]),
  tech: z.array(z.string()).default([]),
  githubUrl: z.string().url("githubUrl must be a URL"),
  imageUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  featured: z.boolean().default(false),
  note: z.string().optional(),
});

/** Projects have no derived fields — output shape equals input shape. */
export const projectSchema = projectInputSchema;

export const projectUpdateSchema = projectInputSchema.omit({ slug: true }).partial();

export type ProjectOrg = z.infer<typeof projectOrgSchema>;
export type ProjectCategory = z.infer<typeof projectCategorySchema>;
export type ProjectInput = z.input<typeof projectInputSchema>;
export type Project = z.output<typeof projectSchema>;
export type ProjectUpdate = z.input<typeof projectUpdateSchema>;

export const PROJECTS_COLLECTION: Collection<ProjectInput, Project> = {
  name: "projects",
  dir: "content/projects",
  ext: ".json",
  inputSchema: projectInputSchema,
  outputSchema: projectSchema,
  updateSchema: projectUpdateSchema,

  serialize(input) {
    const validated = projectInputSchema.parse(input);
    const { slug: _slug, ...rest } = validated;
    return JSON.stringify(rest, null, 2) + "\n";
  },

  parse(slug, raw) {
    const data = JSON.parse(raw);
    return projectSchema.parse({ slug, ...data });
  },

  listSort: (a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1;
    return a.name.localeCompare(b.name);
  },
};
