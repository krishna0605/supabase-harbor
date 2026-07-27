DO $phase3_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "accounts" LIMIT 1)
    OR EXISTS (SELECT 1 FROM "organizations" LIMIT 1)
    OR EXISTS (SELECT 1 FROM "projects" LIMIT 1)
    OR EXISTS (SELECT 1 FROM "service_health" LIMIT 1)
    OR EXISTS (SELECT 1 FROM "sync_runs" LIMIT 1)
    OR EXISTS (SELECT 1 FROM "actions" LIMIT 1)
  THEN
    RAISE EXCEPTION
      'Phase 3 requires empty Harbor data tables; migrate existing tenants explicitly before continuing';
  END IF;
END
$phase3_guard$;
--> statement-breakpoint
TRUNCATE TABLE "settings";
--> statement-breakpoint
CREATE TABLE "user_vaults" (
  "user_id" text PRIMARY KEY NOT NULL,
  "wrapped_dek" bytea NOT NULL,
  "wrapped_dek_nonce" bytea NOT NULL,
  "wrapped_dek_tag" bytea NOT NULL,
  "root_key_version" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_token_fingerprint_unique";
--> statement-breakpoint
ALTER TABLE "actions" DROP CONSTRAINT "actions_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "actions" DROP CONSTRAINT "actions_project_fk";
--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "service_health" DROP CONSTRAINT "service_health_project_fk";
--> statement-breakpoint
ALTER TABLE "sync_runs" DROP CONSTRAINT "sync_runs_account_id_accounts_id_fk";
--> statement-breakpoint
DROP INDEX "accounts_enabled_label_idx";
--> statement-breakpoint
DROP INDEX "actions_account_started_idx";
--> statement-breakpoint
DROP INDEX "projects_account_removed_name_idx";
--> statement-breakpoint
DROP INDEX "sync_runs_account_started_idx";
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_pkey";
--> statement-breakpoint
ALTER TABLE "actions" DROP CONSTRAINT "actions_pkey";
--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_account_id_supabase_org_id_pk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_account_id_project_ref_pk";
--> statement-breakpoint
ALTER TABLE "service_health" DROP CONSTRAINT "service_health_account_id_project_ref_service_name_pk";
--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";
--> statement-breakpoint
ALTER TABLE "sync_runs" DROP CONSTRAINT "sync_runs_pkey";
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "service_health" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "actions" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_health" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_user_id_id_pk" PRIMARY KEY ("user_id", "id");
--> statement-breakpoint
ALTER TABLE "actions"
  ADD CONSTRAINT "actions_user_id_id_pk" PRIMARY KEY ("user_id", "id");
--> statement-breakpoint
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_user_id_account_id_supabase_org_id_pk"
  PRIMARY KEY ("user_id", "account_id", "supabase_org_id");
--> statement-breakpoint
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_user_id_account_id_project_ref_pk"
  PRIMARY KEY ("user_id", "account_id", "project_ref");
--> statement-breakpoint
ALTER TABLE "service_health"
  ADD CONSTRAINT "service_health_user_id_account_id_project_ref_service_name_pk"
  PRIMARY KEY ("user_id", "account_id", "project_ref", "service_name");
--> statement-breakpoint
ALTER TABLE "settings"
  ADD CONSTRAINT "settings_user_id_key_pk" PRIMARY KEY ("user_id", "key");
--> statement-breakpoint
ALTER TABLE "sync_runs"
  ADD CONSTRAINT "sync_runs_user_id_id_pk" PRIMARY KEY ("user_id", "id");
--> statement-breakpoint
ALTER TABLE "actions"
  ADD CONSTRAINT "actions_project_fk"
  FOREIGN KEY ("user_id", "account_id", "project_ref")
  REFERENCES "projects" ("user_id", "account_id", "project_ref")
  ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_account_fk"
  FOREIGN KEY ("user_id", "account_id")
  REFERENCES "accounts" ("user_id", "id")
  ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_account_fk"
  FOREIGN KEY ("user_id", "account_id")
  REFERENCES "accounts" ("user_id", "id")
  ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "service_health"
  ADD CONSTRAINT "service_health_project_fk"
  FOREIGN KEY ("user_id", "account_id", "project_ref")
  REFERENCES "projects" ("user_id", "account_id", "project_ref")
  ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "sync_runs"
  ADD CONSTRAINT "sync_runs_account_fk"
  FOREIGN KEY ("user_id", "account_id")
  REFERENCES "accounts" ("user_id", "id")
  ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_token_fingerprint_unique"
  ON "accounts" ("user_id", "token_fingerprint");
--> statement-breakpoint
CREATE INDEX "accounts_user_enabled_label_idx"
  ON "accounts" ("user_id", "enabled", "label");
--> statement-breakpoint
CREATE INDEX "actions_user_account_started_idx"
  ON "actions" ("user_id", "account_id", "started_at" DESC);
--> statement-breakpoint
CREATE INDEX "projects_user_account_removed_name_idx"
  ON "projects" ("user_id", "account_id", "removed_at", "name");
--> statement-breakpoint
CREATE INDEX "sync_runs_user_account_started_idx"
  ON "sync_runs" ("user_id", "account_id", "started_at" DESC);
--> statement-breakpoint
DO $runtime_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'harbor_runtime') THEN
    CREATE ROLE harbor_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  END IF;
END
$runtime_role$;
--> statement-breakpoint
DO $runtime_membership$
BEGIN
  EXECUTE format(
    'GRANT harbor_runtime TO %I WITH SET TRUE',
    current_user
  );
END
$runtime_membership$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO harbor_runtime;
--> statement-breakpoint
REVOKE ALL ON TABLE
  "user_vaults", "accounts", "organizations", "projects",
  "service_health", "sync_runs", "actions", "settings"
FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "user_vaults", "accounts", "organizations", "projects",
  "service_health", "sync_runs", "actions", "settings"
TO harbor_runtime;
--> statement-breakpoint
DO $identity_function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'neon_auth'
  ) THEN
    EXECUTE $create_identity$
      CREATE OR REPLACE FUNCTION public.harbor_github_id(auth_user_id text)
      RETURNS text
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $identity$
        SELECT account."accountId"
        FROM neon_auth.account AS account
        WHERE account."userId"::text = auth_user_id
          AND account."providerId" = 'github'
        LIMIT 1
      $identity$
    $create_identity$;
  ELSE
    EXECUTE $create_test_identity$
      CREATE OR REPLACE FUNCTION public.harbor_github_id(auth_user_id text)
      RETURNS text
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $identity$
        SELECT NULL::text
      $identity$
    $create_test_identity$;
  END IF;
END
$identity_function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.harbor_github_id(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.harbor_github_id(text) TO harbor_runtime;
--> statement-breakpoint
ALTER TABLE "user_vaults" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_vaults" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_vaults_tenant_policy" ON "user_vaults"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "accounts_tenant_policy" ON "accounts"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "organizations_tenant_policy" ON "organizations"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "projects_tenant_policy" ON "projects"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "service_health" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_health" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "service_health_tenant_policy" ON "service_health"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_runs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "sync_runs_tenant_policy" ON "sync_runs"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "actions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "actions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "actions_tenant_policy" ON "actions"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "settings_tenant_policy" ON "settings"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
