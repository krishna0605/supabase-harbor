import { z } from "zod";

export const profileSchema = z
  .object({
    id: z.string(),
    primary_email: z.string().optional(),
    email: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

export const organizationSchema = z
  .object({
    id: z.string(),
    slug: z.string().optional(),
    name: z.string(),
    plan: z.string().optional(),
  })
  .passthrough();

export const organizationsSchema = z.array(organizationSchema);

export const projectSchema = z
  .object({
    id: z.string().optional(),
    ref: z.string().optional(),
    organization_id: z.string().optional(),
    organization_slug: z.string().optional(),
    name: z.string(),
    region: z.string().default("unknown"),
    cloud_provider: z.string().optional(),
    created_at: z.string().optional(),
    status: z.string(),
  })
  .passthrough()
  .transform((project) => ({
    ...project,
    ref: project.ref ?? project.id ?? "",
  }));

export const projectsSchema = z.array(projectSchema);

export const serviceHealthSchema = z.array(
  z
    .object({
      name: z.string(),
      healthy: z.boolean(),
      status: z.string().default("UNKNOWN"),
      info: z
        .object({
          version: z.string().optional(),
        })
        .passthrough()
        .optional(),
      error: z.string().nullable().optional(),
    })
    .passthrough(),
);

export const projectApiKeySchema = z
  .object({
    id: z.string().optional(),
    api_key: z.string().optional(),
    type: z.string(),
    name: z.string().optional(),
    secret_jwt_template: z
      .object({
        role: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const projectApiKeysSchema = z.array(projectApiKeySchema);

export type SupabaseProfile = z.infer<typeof profileSchema>;
export type SupabaseOrganization = z.infer<typeof organizationSchema>;
export type SupabaseProject = z.infer<typeof projectSchema>;
export type SupabaseServiceHealth = z.infer<typeof serviceHealthSchema>[number];
export type SupabaseProjectApiKey = z.infer<typeof projectApiKeySchema>;
