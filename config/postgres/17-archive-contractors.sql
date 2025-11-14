-- Migration: Introduce contractor archive schema
-- Adds archived flag to contractors and creates contractor_archive_details table

BEGIN;

-- Flag organizations as archived without removing the contractor row
ALTER TABLE public.contractors
    ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false NOT NULL;

-- Store archive metadata while keeping the contractor table lean
CREATE TABLE IF NOT EXISTS public.contractor_archive_details (
    contractor_id uuid PRIMARY KEY,
    archived_at timestamp without time zone DEFAULT now() NOT NULL,
    archived_by uuid NOT NULL,
    archived_label character varying(150) NOT NULL,
    original_name character varying(100) NOT NULL,
    reason character varying(500),
    member_count_removed integer DEFAULT 0 NOT NULL,
    CONSTRAINT contractor_archive_details_contractor_id_fkey
        FOREIGN KEY (contractor_id)
        REFERENCES public.contractors(contractor_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT contractor_archive_details_archived_by_fkey
        FOREIGN KEY (archived_by)
        REFERENCES public.accounts(user_id)
);

-- Helpful indexes for filtering archived contractors and reporting
CREATE INDEX IF NOT EXISTS idx_contractors_archived ON public.contractors(archived);
CREATE INDEX IF NOT EXISTS idx_contractor_archive_details_archived_at ON public.contractor_archive_details(archived_at);
CREATE INDEX IF NOT EXISTS idx_contractor_archive_details_archived_by ON public.contractor_archive_details(archived_by);

-- Documentation comments
COMMENT ON COLUMN public.contractors.archived IS 'Indicates whether the contractor has been archived';
COMMENT ON TABLE public.contractor_archive_details IS 'Archive metadata for contractors (organizations)';
COMMENT ON COLUMN public.contractor_archive_details.archived_label IS 'Display label applied to the contractor name after archiving';
COMMENT ON COLUMN public.contractor_archive_details.original_name IS 'Original contractor name before archiving';
COMMENT ON COLUMN public.contractor_archive_details.reason IS 'Optional free-form reason provided during archiving';
COMMENT ON COLUMN public.contractor_archive_details.member_count_removed IS 'Number of members removed as part of archiving';

-- Minimal audit log storage for archive trail
CREATE TABLE IF NOT EXISTS public.audit_logs (
    audit_log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    action text NOT NULL,
    actor_id uuid,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_subject ON public.audit_logs(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

COMMENT ON TABLE public.audit_logs IS 'Lightweight audit log records for key actions';
COMMENT ON COLUMN public.audit_logs.action IS 'Audit event key (e.g., org.archived)';
COMMENT ON COLUMN public.audit_logs.actor_id IS 'User responsible for the action';
COMMENT ON COLUMN public.audit_logs.metadata IS 'JSON metadata describing the action context';

COMMIT;
