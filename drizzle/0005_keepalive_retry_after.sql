CREATE OR REPLACE FUNCTION harbor_internal.fail_keepalive_job(
  p_user_id text,
  p_job_id text,
  p_lease_token text,
  p_worker_id text,
  p_duration_ms integer,
  p_error_code text,
  p_upstream_status integer,
  p_retryable boolean,
  p_retry_after_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  result_status text;
BEGIN
  IF p_retry_after_seconds IS NOT NULL
    AND (p_retry_after_seconds < 0 OR p_retry_after_seconds > 86400) THEN
    RAISE EXCEPTION 'invalid retry-after duration';
  END IF;

  result_status := harbor_internal.fail_keepalive_job(
    p_user_id,
    p_job_id,
    p_lease_token,
    p_worker_id,
    p_duration_ms,
    p_error_code,
    p_upstream_status,
    p_retryable
  );

  IF result_status = 'retry_wait' AND p_retry_after_seconds IS NOT NULL THEN
    UPDATE public.keepalive_jobs
    SET available_at = greatest(
          available_at,
          now() + make_interval(secs => p_retry_after_seconds)
        ),
        updated_at = now()
    WHERE user_id = p_user_id
      AND id = p_job_id
      AND status = 'retry_wait';
  END IF;

  RETURN result_status;
END
$function$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION harbor_internal.fail_keepalive_job(
  text, text, text, text, integer, text, integer, boolean
) FROM harbor_worker;
--> statement-breakpoint
REVOKE ALL ON FUNCTION harbor_internal.fail_keepalive_job(
  text, text, text, text, integer, text, integer, boolean, integer
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION harbor_internal.fail_keepalive_job(
  text, text, text, text, integer, text, integer, boolean, integer
) TO harbor_worker;
