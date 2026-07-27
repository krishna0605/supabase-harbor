CREATE TABLE "keepalive_attempts" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"job_id" text NOT NULL,
	"account_id" text NOT NULL,
	"project_ref" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"upstream_status" integer,
	"worker_id" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "keepalive_attempts_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "keepalive_attempts_status_check" CHECK ("keepalive_attempts"."status" in ('succeeded', 'failed')),
	CONSTRAINT "keepalive_attempts_values_check" CHECK ("keepalive_attempts"."attempt_number" > 0 and "keepalive_attempts"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "keepalive_enrollments" (
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"project_ref" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"credential_ciphertext" "bytea" NOT NULL,
	"credential_nonce" "bytea" NOT NULL,
	"credential_tag" "bytea" NOT NULL,
	"credential_fingerprint" text NOT NULL,
	"credential_type" text NOT NULL,
	"credential_source" text NOT NULL,
	"credential_key_id" text,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_code" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keepalive_enrollments_user_id_account_id_project_ref_pk" PRIMARY KEY("user_id","account_id","project_ref"),
	CONSTRAINT "keepalive_enrollments_credential_type_check" CHECK ("keepalive_enrollments"."credential_type" in ('publishable', 'legacy_anon')),
	CONSTRAINT "keepalive_enrollments_credential_source_check" CHECK ("keepalive_enrollments"."credential_source" in ('automatic', 'manual')),
	CONSTRAINT "keepalive_enrollments_failures_check" CHECK ("keepalive_enrollments"."consecutive_failures" >= 0)
);
--> statement-breakpoint
CREATE TABLE "keepalive_jobs" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"project_ref" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"worker_id" text,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 4 NOT NULL,
	"last_error_code" text,
	"last_upstream_status" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keepalive_jobs_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "keepalive_jobs_trigger_check" CHECK ("keepalive_jobs"."trigger" in ('scheduled', 'manual', 'enrollment_validation')),
	CONSTRAINT "keepalive_jobs_status_check" CHECK ("keepalive_jobs"."status" in ('pending', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "keepalive_jobs_attempts_check" CHECK ("keepalive_jobs"."attempt_count" >= 0 and "keepalive_jobs"."max_attempts" > 0 and "keepalive_jobs"."attempt_count" <= "keepalive_jobs"."max_attempts")
);
--> statement-breakpoint
ALTER TABLE "keepalive_attempts" ADD CONSTRAINT "keepalive_attempts_job_fk" FOREIGN KEY ("user_id","job_id") REFERENCES "public"."keepalive_jobs"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keepalive_enrollments" ADD CONSTRAINT "keepalive_enrollments_project_fk" FOREIGN KEY ("user_id","account_id","project_ref") REFERENCES "public"."projects"("user_id","account_id","project_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keepalive_jobs" ADD CONSTRAINT "keepalive_jobs_enrollment_fk" FOREIGN KEY ("user_id","account_id","project_ref") REFERENCES "public"."keepalive_enrollments"("user_id","account_id","project_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keepalive_attempts_user_job_started_idx" ON "keepalive_attempts" USING btree ("user_id","job_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "keepalive_enrollments_user_project_fingerprint_unique" ON "keepalive_enrollments" USING btree ("user_id","account_id","project_ref","credential_fingerprint");--> statement-breakpoint
CREATE INDEX "keepalive_enrollments_user_enabled_next_idx" ON "keepalive_enrollments" USING btree ("user_id","enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "keepalive_jobs_user_project_slot_unique" ON "keepalive_jobs" USING btree ("user_id","account_id","project_ref","trigger","scheduled_for");--> statement-breakpoint
CREATE INDEX "keepalive_jobs_due_idx" ON "keepalive_jobs" USING btree ("status","available_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "keepalive_jobs_user_project_scheduled_idx" ON "keepalive_jobs" USING btree ("user_id","account_id","project_ref","scheduled_for" DESC NULLS LAST);
--> statement-breakpoint
REVOKE ALL ON TABLE "keepalive_enrollments", "keepalive_jobs", "keepalive_attempts" FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "keepalive_enrollments", "keepalive_jobs", "keepalive_attempts"
TO harbor_runtime;
--> statement-breakpoint
ALTER TABLE "keepalive_enrollments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "keepalive_enrollments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "keepalive_enrollments_tenant_policy" ON "keepalive_enrollments"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "keepalive_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "keepalive_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "keepalive_jobs_tenant_policy" ON "keepalive_jobs"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
ALTER TABLE "keepalive_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "keepalive_attempts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "keepalive_attempts_tenant_policy" ON "keepalive_attempts"
  USING ("user_id" = current_setting('harbor.user_id', true))
  WITH CHECK ("user_id" = current_setting('harbor.user_id', true));
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS harbor_internal;
--> statement-breakpoint
REVOKE ALL ON SCHEMA harbor_internal FROM PUBLIC;
--> statement-breakpoint
DO $worker_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'harbor_worker') THEN
    CREATE ROLE harbor_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOBYPASSRLS;
  END IF;
END
$worker_role$;
--> statement-breakpoint
DO $worker_membership$
BEGIN
  EXECUTE format(
    'GRANT harbor_worker TO %I WITH SET TRUE',
    current_user
  );
END
$worker_membership$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA harbor_internal TO harbor_worker;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.enqueue_due_keepalive_jobs(
  p_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  inserted_count integer;
BEGIN
  IF p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'invalid enqueue limit';
  END IF;

  WITH due AS (
    SELECT enrollment.user_id, enrollment.account_id,
      enrollment.project_ref, enrollment.next_run_at
    FROM public.keepalive_enrollments AS enrollment
    JOIN public.accounts AS account
      ON account.user_id = enrollment.user_id
     AND account.id = enrollment.account_id
    JOIN public.projects AS project
      ON project.user_id = enrollment.user_id
     AND project.account_id = enrollment.account_id
     AND project.project_ref = enrollment.project_ref
    WHERE enrollment.enabled = true
      AND enrollment.next_run_at <= now()
      AND account.enabled = true
      AND project.removed_at IS NULL
      AND project.lifecycle_status = 'active'
    ORDER BY enrollment.next_run_at
    FOR UPDATE OF enrollment SKIP LOCKED
    LIMIT p_limit
  )
  INSERT INTO public.keepalive_jobs (
    user_id, id, account_id, project_ref, trigger, status,
    scheduled_for, available_at
  )
  SELECT due.user_id, gen_random_uuid()::text, due.account_id,
    due.project_ref, 'scheduled', 'pending', due.next_run_at, now()
  FROM due
  ON CONFLICT (
    user_id, account_id, project_ref, trigger, scheduled_for
  ) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.claim_keepalive_jobs(
  p_worker_id text,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  user_id text,
  job_id text,
  account_id text,
  project_ref text,
  trigger text,
  lease_token text,
  attempt_count integer,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) < 1 OR length(p_worker_id) > 120 THEN
    RAISE EXCEPTION 'invalid worker id';
  END IF;
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid claim limit';
  END IF;
  IF p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'invalid lease duration';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.user_id, job.id
    FROM public.keepalive_jobs AS job
    JOIN public.keepalive_enrollments AS enrollment
      ON enrollment.user_id = job.user_id
     AND enrollment.account_id = job.account_id
     AND enrollment.project_ref = job.project_ref
    JOIN public.accounts AS account
      ON account.user_id = job.user_id
     AND account.id = job.account_id
    WHERE enrollment.enabled = true
      AND account.enabled = true
      AND job.attempt_count < job.max_attempts
      AND (
        (job.status IN ('pending', 'retry_wait') AND job.available_at <= now())
        OR
        (job.status = 'running' AND job.lease_expires_at < now())
      )
    ORDER BY job.available_at, job.created_at
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.keepalive_jobs AS claimed
  SET status = 'running',
      worker_id = p_worker_id,
      lease_token = gen_random_uuid()::text,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = claimed.attempt_count + 1,
      started_at = COALESCE(claimed.started_at, now()),
      updated_at = now()
  FROM candidates
  WHERE claimed.user_id = candidates.user_id
    AND claimed.id = candidates.id
  RETURNING claimed.user_id, claimed.id, claimed.account_id,
    claimed.project_ref, claimed.trigger, claimed.lease_token,
    claimed.attempt_count, claimed.max_attempts;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.get_keepalive_job_payload(
  p_user_id text,
  p_job_id text,
  p_lease_token text
)
RETURNS TABLE (
  account_token_ciphertext bytea,
  account_token_nonce bytea,
  account_token_tag bytea,
  credential_ciphertext bytea,
  credential_nonce bytea,
  credential_tag bytea,
  credential_type text,
  credential_source text,
  credential_key_id text,
  wrapped_dek bytea,
  wrapped_dek_nonce bytea,
  wrapped_dek_tag bytea,
  root_key_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT account.token_ciphertext, account.token_nonce, account.token_tag,
    enrollment.credential_ciphertext, enrollment.credential_nonce,
    enrollment.credential_tag, enrollment.credential_type,
    enrollment.credential_source, enrollment.credential_key_id,
    vault.wrapped_dek, vault.wrapped_dek_nonce, vault.wrapped_dek_tag,
    vault.root_key_version
  FROM public.keepalive_jobs AS job
  JOIN public.keepalive_enrollments AS enrollment
    ON enrollment.user_id = job.user_id
   AND enrollment.account_id = job.account_id
   AND enrollment.project_ref = job.project_ref
  JOIN public.accounts AS account
    ON account.user_id = job.user_id
   AND account.id = job.account_id
  JOIN public.user_vaults AS vault
    ON vault.user_id = job.user_id
  WHERE job.user_id = p_user_id
    AND job.id = p_job_id
    AND job.status = 'running'
    AND job.lease_token = p_lease_token
    AND job.lease_expires_at > now()
    AND enrollment.enabled = true
    AND account.enabled = true
  LIMIT 1
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.complete_keepalive_job(
  p_user_id text,
  p_job_id text,
  p_lease_token text,
  p_worker_id text,
  p_duration_ms integer,
  p_upstream_status integer,
  p_pinged_at timestamp with time zone
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  claimed public.keepalive_jobs%ROWTYPE;
  jitter_seconds integer;
BEGIN
  IF p_duration_ms < 0 OR p_duration_ms > 240000 THEN
    RAISE EXCEPTION 'invalid attempt duration';
  END IF;

  SELECT * INTO claimed
  FROM public.keepalive_jobs
  WHERE user_id = p_user_id
    AND id = p_job_id
    AND status = 'running'
    AND lease_token = p_lease_token
    AND worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  jitter_seconds :=
    mod(hashtextextended(claimed.project_ref, 0) & 9223372036854775807, 7201);

  INSERT INTO public.keepalive_attempts (
    user_id, id, job_id, account_id, project_ref, attempt_number,
    status, upstream_status, worker_id, duration_ms, started_at, completed_at
  ) VALUES (
    claimed.user_id, gen_random_uuid()::text, claimed.id, claimed.account_id,
    claimed.project_ref, claimed.attempt_count, 'succeeded', p_upstream_status,
    p_worker_id, p_duration_ms, now() - make_interval(secs => p_duration_ms / 1000.0),
    now()
  );

  UPDATE public.keepalive_jobs
  SET status = 'succeeded',
      last_error_code = NULL,
      last_upstream_status = p_upstream_status,
      completed_at = now(),
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE user_id = claimed.user_id AND id = claimed.id;

  UPDATE public.keepalive_enrollments
  SET last_attempt_at = now(),
      last_success_at = p_pinged_at,
      last_error_code = NULL,
      consecutive_failures = 0,
      needs_attention = false,
      next_run_at = now() + interval '24 hours'
        + make_interval(secs => jitter_seconds),
      updated_at = now()
  WHERE user_id = claimed.user_id
    AND account_id = claimed.account_id
    AND project_ref = claimed.project_ref;

  RETURN true;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.fail_keepalive_job(
  p_user_id text,
  p_job_id text,
  p_lease_token text,
  p_worker_id text,
  p_duration_ms integer,
  p_error_code text,
  p_upstream_status integer,
  p_retryable boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  claimed public.keepalive_jobs%ROWTYPE;
  next_status text;
  retry_delay interval;
BEGIN
  IF p_duration_ms < 0 OR p_duration_ms > 240000 THEN
    RAISE EXCEPTION 'invalid attempt duration';
  END IF;
  IF p_error_code IS NULL OR length(p_error_code) < 1 OR length(p_error_code) > 100 THEN
    RAISE EXCEPTION 'invalid error code';
  END IF;

  SELECT * INTO claimed
  FROM public.keepalive_jobs
  WHERE user_id = p_user_id
    AND id = p_job_id
    AND status = 'running'
    AND lease_token = p_lease_token
    AND worker_id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'lease_lost';
  END IF;

  IF p_retryable AND claimed.attempt_count < claimed.max_attempts THEN
    next_status := 'retry_wait';
    retry_delay := CASE claimed.attempt_count
      WHEN 1 THEN interval '15 minutes'
      WHEN 2 THEN interval '1 hour'
      ELSE interval '6 hours'
    END;
  ELSE
    next_status := 'failed';
    retry_delay := interval '0 seconds';
  END IF;

  INSERT INTO public.keepalive_attempts (
    user_id, id, job_id, account_id, project_ref, attempt_number,
    status, error_code, upstream_status, worker_id, duration_ms,
    started_at, completed_at
  ) VALUES (
    claimed.user_id, gen_random_uuid()::text, claimed.id, claimed.account_id,
    claimed.project_ref, claimed.attempt_count, 'failed', p_error_code,
    p_upstream_status, p_worker_id, p_duration_ms,
    now() - make_interval(secs => p_duration_ms / 1000.0), now()
  );

  UPDATE public.keepalive_jobs
  SET status = next_status,
      available_at = CASE
        WHEN next_status = 'retry_wait' THEN now() + retry_delay
        ELSE available_at
      END,
      last_error_code = p_error_code,
      last_upstream_status = p_upstream_status,
      completed_at = CASE WHEN next_status = 'failed' THEN now() ELSE NULL END,
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE user_id = claimed.user_id AND id = claimed.id;

  UPDATE public.keepalive_enrollments
  SET last_attempt_at = now(),
      last_error_code = p_error_code,
      consecutive_failures = consecutive_failures + 1,
      needs_attention = next_status = 'failed',
      updated_at = now()
  WHERE user_id = claimed.user_id
    AND account_id = claimed.account_id
    AND project_ref = claimed.project_ref;

  RETURN next_status;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.cleanup_keepalive_history(
  p_cutoff timestamp with time zone
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  IF p_cutoff > now() - interval '1 day' THEN
    RAISE EXCEPTION 'cleanup cutoff is too recent';
  END IF;

  DELETE FROM public.keepalive_jobs
  WHERE status IN ('succeeded', 'failed', 'cancelled')
    AND completed_at < p_cutoff;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  harbor_internal.enqueue_due_keepalive_jobs(integer),
  harbor_internal.claim_keepalive_jobs(text, integer, integer),
  harbor_internal.get_keepalive_job_payload(text, text, text),
  harbor_internal.complete_keepalive_job(text, text, text, text, integer, integer, timestamp with time zone),
  harbor_internal.fail_keepalive_job(text, text, text, text, integer, text, integer, boolean),
  harbor_internal.cleanup_keepalive_history(timestamp with time zone)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  harbor_internal.enqueue_due_keepalive_jobs(integer),
  harbor_internal.claim_keepalive_jobs(text, integer, integer),
  harbor_internal.get_keepalive_job_payload(text, text, text),
  harbor_internal.complete_keepalive_job(text, text, text, text, integer, integer, timestamp with time zone),
  harbor_internal.fail_keepalive_job(text, text, text, text, integer, text, integer, boolean),
  harbor_internal.cleanup_keepalive_history(timestamp with time zone)
TO harbor_worker;
