CREATE SCHEMA IF NOT EXISTS harbor_security;
--> statement-breakpoint
REVOKE ALL ON SCHEMA harbor_security FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE harbor_security.rate_limit_buckets (
  scope text NOT NULL,
  actor_digest text NOT NULL,
  bucket_start timestamp with time zone NOT NULL,
  hits integer NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  PRIMARY KEY (scope, actor_digest, bucket_start),
  CONSTRAINT rate_limit_scope_check
    CHECK (scope ~ '^[a-z][a-z0-9-]{0,63}$'),
  CONSTRAINT rate_limit_actor_digest_check
    CHECK (actor_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT rate_limit_hits_check CHECK (hits > 0)
);
--> statement-breakpoint
CREATE INDEX rate_limit_buckets_expiry_idx
  ON harbor_security.rate_limit_buckets (expires_at);
--> statement-breakpoint
REVOKE ALL ON TABLE harbor_security.rate_limit_buckets FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_security.consume_rate_limit(
  p_scope text,
  p_actor_digest text,
  p_window_seconds integer,
  p_limit integer
)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  current_time timestamp with time zone := clock_timestamp();
  current_bucket timestamp with time zone;
  current_hits integer;
  bucket_end timestamp with time zone;
BEGIN
  IF p_scope IS NULL OR p_scope !~ '^[a-z][a-z0-9-]{0,63}$' THEN
    RAISE EXCEPTION 'invalid rate-limit scope';
  END IF;
  IF p_actor_digest IS NULL OR p_actor_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid rate-limit actor';
  END IF;
  IF p_window_seconds < 10 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate-limit window';
  END IF;
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid rate-limit maximum';
  END IF;

  current_bucket := to_timestamp(
    floor(extract(epoch FROM current_time) / p_window_seconds)
      * p_window_seconds
  );
  bucket_end := current_bucket + make_interval(secs => p_window_seconds);

  INSERT INTO harbor_security.rate_limit_buckets (
    scope, actor_digest, bucket_start, hits, expires_at
  ) VALUES (
    p_scope, p_actor_digest, current_bucket, 1, bucket_end + interval '1 hour'
  )
  ON CONFLICT (scope, actor_digest, bucket_start)
  DO UPDATE SET
    hits = harbor_security.rate_limit_buckets.hits + 1,
    expires_at = excluded.expires_at
  RETURNING hits INTO current_hits;

  RETURN QUERY SELECT
    current_hits <= p_limit,
    greatest(p_limit - current_hits, 0),
    greatest(ceil(extract(epoch FROM bucket_end - current_time))::integer, 1);
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_security.cleanup_rate_limits(
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
  IF p_cutoff > now() THEN
    RAISE EXCEPTION 'cleanup cutoff cannot be in the future';
  END IF;
  DELETE FROM harbor_security.rate_limit_buckets
  WHERE expires_at < p_cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$function$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA harbor_security TO harbor_runtime;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  harbor_security.consume_rate_limit(text, text, integer, integer),
  harbor_security.cleanup_rate_limits(timestamp with time zone)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  harbor_security.consume_rate_limit(text, text, integer, integer)
TO harbor_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  harbor_security.cleanup_rate_limits(timestamp with time zone)
TO harbor_worker;
--> statement-breakpoint
CREATE TABLE harbor_internal.worker_sweeps (
  id text PRIMARY KEY,
  worker_id text NOT NULL,
  deployment_environment text NOT NULL,
  status text NOT NULL,
  enqueued_count integer NOT NULL DEFAULT 0,
  claimed_count integer NOT NULL DEFAULT 0,
  succeeded_count integer NOT NULL DEFAULT 0,
  retried_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  deleted_count integer NOT NULL DEFAULT 0,
  error_code text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT worker_sweeps_status_check
    CHECK (status IN ('running', 'succeeded', 'failed')),
  CONSTRAINT worker_sweeps_environment_check
    CHECK (deployment_environment ~ '^[a-z][a-z0-9-]{0,31}$'),
  CONSTRAINT worker_sweeps_counts_check
    CHECK (
      enqueued_count >= 0 AND claimed_count >= 0
      AND succeeded_count >= 0 AND retried_count >= 0
      AND failed_count >= 0 AND deleted_count >= 0
    )
);
--> statement-breakpoint
CREATE INDEX worker_sweeps_started_idx
  ON harbor_internal.worker_sweeps (started_at DESC);
--> statement-breakpoint
REVOKE ALL ON TABLE harbor_internal.worker_sweeps FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.start_worker_sweep(
  p_worker_id text,
  p_environment text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  sweep_id text := gen_random_uuid()::text;
BEGIN
  IF p_worker_id IS NULL OR length(p_worker_id) < 1 OR length(p_worker_id) > 120 THEN
    RAISE EXCEPTION 'invalid worker id';
  END IF;
  IF p_environment IS NULL OR p_environment !~ '^[a-z][a-z0-9-]{0,31}$' THEN
    RAISE EXCEPTION 'invalid deployment environment';
  END IF;
  INSERT INTO harbor_internal.worker_sweeps (
    id, worker_id, deployment_environment, status
  ) VALUES (sweep_id, p_worker_id, p_environment, 'running');
  RETURN sweep_id;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.finish_worker_sweep(
  p_sweep_id text,
  p_worker_id text,
  p_status text,
  p_enqueued integer,
  p_claimed integer,
  p_succeeded integer,
  p_retried integer,
  p_failed integer,
  p_deleted integer,
  p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  changed integer;
BEGIN
  IF p_status NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'invalid sweep status';
  END IF;
  IF least(
    p_enqueued, p_claimed, p_succeeded, p_retried, p_failed, p_deleted
  ) < 0 THEN
    RAISE EXCEPTION 'invalid sweep counts';
  END IF;
  IF p_error_code IS NOT NULL AND length(p_error_code) > 100 THEN
    RAISE EXCEPTION 'invalid sweep error code';
  END IF;

  UPDATE harbor_internal.worker_sweeps
  SET status = p_status,
      enqueued_count = p_enqueued,
      claimed_count = p_claimed,
      succeeded_count = p_succeeded,
      retried_count = p_retried,
      failed_count = p_failed,
      deleted_count = p_deleted,
      error_code = p_error_code,
      completed_at = now()
  WHERE id = p_sweep_id
    AND worker_id = p_worker_id
    AND status = 'running';
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.get_worker_status()
RETURNS TABLE (
  status text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  result text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    CASE
      WHEN sweep.completed_at IS NULL THEN 'unknown'
      WHEN sweep.completed_at >= now() - interval '45 minutes' THEN 'healthy'
      ELSE 'delayed'
    END,
    sweep.started_at,
    sweep.completed_at,
    CASE WHEN sweep.status = 'running' THEN NULL ELSE sweep.status END
  FROM harbor_internal.worker_sweeps AS sweep
  ORDER BY sweep.started_at DESC
  LIMIT 1
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION harbor_internal.cleanup_worker_sweeps(
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
  DELETE FROM harbor_internal.worker_sweeps
  WHERE completed_at < p_cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$function$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA harbor_internal TO harbor_runtime;
--> statement-breakpoint
REVOKE ALL ON FUNCTION
  harbor_internal.start_worker_sweep(text, text),
  harbor_internal.finish_worker_sweep(
    text, text, text, integer, integer, integer, integer, integer, integer, text
  ),
  harbor_internal.get_worker_status(),
  harbor_internal.cleanup_worker_sweeps(timestamp with time zone)
FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  harbor_internal.start_worker_sweep(text, text),
  harbor_internal.finish_worker_sweep(
    text, text, text, integer, integer, integer, integer, integer, integer, text
  ),
  harbor_internal.cleanup_worker_sweeps(timestamp with time zone)
TO harbor_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION harbor_internal.get_worker_status()
TO harbor_runtime;
