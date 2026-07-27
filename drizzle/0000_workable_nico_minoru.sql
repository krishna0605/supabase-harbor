CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"supabase_user_id" text NOT NULL,
	"primary_email" text NOT NULL,
	"token_ciphertext" "bytea" NOT NULL,
	"token_nonce" "bytea" NOT NULL,
	"token_tag" "bytea" NOT NULL,
	"token_fingerprint" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_token_fingerprint_unique" UNIQUE("token_fingerprint")
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"project_ref" text NOT NULL,
	"action_type" text NOT NULL,
	"status" text NOT NULL,
	"upstream_status" text,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"account_id" text NOT NULL,
	"supabase_org_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'unknown' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_account_id_supabase_org_id_pk" PRIMARY KEY("account_id","supabase_org_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"account_id" text NOT NULL,
	"project_ref" text NOT NULL,
	"supabase_org_id" text NOT NULL,
	"organization_slug" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"cloud_provider" text DEFAULT 'unknown' NOT NULL,
	"raw_status" text NOT NULL,
	"lifecycle_status" text NOT NULL,
	"health_status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "projects_account_id_project_ref_pk" PRIMARY KEY("account_id","project_ref")
);
--> statement-breakpoint
CREATE TABLE "service_health" (
	"account_id" text NOT NULL,
	"project_ref" text NOT NULL,
	"service_name" text NOT NULL,
	"healthy" boolean NOT NULL,
	"raw_status" text NOT NULL,
	"version" text,
	"error_summary" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_health_account_id_project_ref_service_name_pk" PRIMARY KEY("account_id","project_ref","service_name")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"project_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vault_metadata" (
	"id" integer PRIMARY KEY NOT NULL,
	"format_version" integer NOT NULL,
	"kdf_salt" "bytea" NOT NULL,
	"kdf_parameters" text NOT NULL,
	"wrapped_dek" "bytea" NOT NULL,
	"wrapped_dek_nonce" "bytea" NOT NULL,
	"wrapped_dek_tag" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_project_fk" FOREIGN KEY ("account_id","project_ref") REFERENCES "public"."projects"("account_id","project_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_health" ADD CONSTRAINT "service_health_project_fk" FOREIGN KEY ("account_id","project_ref") REFERENCES "public"."projects"("account_id","project_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_enabled_label_idx" ON "accounts" USING btree ("enabled","label");--> statement-breakpoint
CREATE INDEX "actions_account_started_idx" ON "actions" USING btree ("account_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "projects_account_removed_name_idx" ON "projects" USING btree ("account_id","removed_at","name");--> statement-breakpoint
CREATE INDEX "sync_runs_account_started_idx" ON "sync_runs" USING btree ("account_id","started_at" DESC NULLS LAST);--> statement-breakpoint
INSERT INTO "settings" ("key", "value") VALUES
  ('refresh_interval_minutes', '5'),
  ('idle_timeout_minutes', '30')
ON CONFLICT ("key") DO NOTHING;
