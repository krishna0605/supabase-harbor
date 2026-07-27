CREATE OR REPLACE FUNCTION harbor_internal.replace_keepalive_credential(
  p_user_id text,
  p_job_id text,
  p_lease_token text,
  p_credential_ciphertext bytea,
  p_credential_nonce bytea,
  p_credential_tag bytea,
  p_credential_fingerprint text,
  p_credential_type text,
  p_credential_key_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  changed integer;
BEGIN
  IF p_credential_type NOT IN ('publishable', 'legacy_anon') THEN
    RAISE EXCEPTION 'invalid credential type';
  END IF;

  UPDATE public.keepalive_enrollments AS enrollment
  SET credential_ciphertext = p_credential_ciphertext,
      credential_nonce = p_credential_nonce,
      credential_tag = p_credential_tag,
      credential_fingerprint = p_credential_fingerprint,
      credential_type = p_credential_type,
      credential_key_id = p_credential_key_id,
      last_error_code = NULL,
      needs_attention = false,
      updated_at = now()
  FROM public.keepalive_jobs AS job
  WHERE job.user_id = p_user_id
    AND job.id = p_job_id
    AND job.status = 'running'
    AND job.lease_token = p_lease_token
    AND enrollment.user_id = job.user_id
    AND enrollment.account_id = job.account_id
    AND enrollment.project_ref = job.project_ref
    AND enrollment.credential_source = 'automatic';

  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$function$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION harbor_internal.replace_keepalive_credential(
  text, text, text, bytea, bytea, bytea, text, text, text
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION harbor_internal.replace_keepalive_credential(
  text, text, text, bytea, bytea, bytea, text, text, text
) TO harbor_worker;
