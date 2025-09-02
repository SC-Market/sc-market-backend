--
-- PostgreSQL database dump for Admin Alerts feature
--

-- Add new notification action for admin alerts
INSERT INTO public.notification_actions (action_type_id, action, entity) 
VALUES (21, 'admin_alert', 'admin_alerts');

-- Create admin_alerts table
CREATE TABLE public.admin_alerts (
    alert_id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(200) NOT NULL,
    content text NOT NULL,
    link character varying(500),
    target_type character varying(30) NOT NULL,
    target_contractor_id uuid,
    created_by uuid NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true NOT NULL
);

-- Add constraints
ALTER TABLE public.admin_alerts
    ADD CONSTRAINT admin_alerts_target_type_check 
    CHECK (target_type IN ('all_users', 'org_members', 'org_owners', 'admins_only', 'specific_org'));

-- Add foreign key constraints
ALTER TABLE public.admin_alerts
    ADD CONSTRAINT admin_alerts_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES public.accounts(user_id) ON DELETE CASCADE;

ALTER TABLE public.admin_alerts
    ADD CONSTRAINT admin_alerts_target_contractor_id_fkey 
    FOREIGN KEY (target_contractor_id) REFERENCES public.contractors(contractor_id) ON DELETE CASCADE;

-- Add indexes for performance
CREATE INDEX idx_admin_alerts_target_type ON public.admin_alerts(target_type);
CREATE INDEX idx_admin_alerts_target_contractor_id ON public.admin_alerts(target_contractor_id);
CREATE INDEX idx_admin_alerts_created_at ON public.admin_alerts(created_at);
CREATE INDEX idx_admin_alerts_active ON public.admin_alerts(active);

-- Add comments
COMMENT ON TABLE public.admin_alerts IS 'Stores admin-created alerts that are sent to users as notifications';
COMMENT ON COLUMN public.admin_alerts.target_type IS 'Type of users to target: all_users, org_members, org_owners, admins_only, specific_org';
COMMENT ON COLUMN public.admin_alerts.target_contractor_id IS 'Specific contractor ID when target_type is specific_org';
COMMENT ON COLUMN public.admin_alerts.content IS 'Markdown-formatted alert content';
COMMENT ON COLUMN public.admin_alerts.link IS 'Optional URL link to include with the alert';
