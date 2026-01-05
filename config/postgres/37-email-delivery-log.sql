-- Migration: Create email_delivery_log table (Optional)
-- Description: Logs email delivery status for monitoring and debugging.
--              This table is optional and can be added later if needed.
--              email_id is nullable to preserve historical records even if email is deleted.

BEGIN;

-- Create email_delivery_log table
CREATE TABLE IF NOT EXISTS public.email_delivery_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.accounts(user_id) ON DELETE CASCADE,
  email_id UUID NULL REFERENCES public.user_emails(email_id) ON DELETE SET NULL,
  email email NOT NULL, -- Denormalized for historical records
  notification_type VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'sent', 'delivered', 'bounced', 'failed'
  provider_message_id VARCHAR(255) NULL, -- Provider's message ID (e.g., SES message ID)
  error_message TEXT NULL,
  sent_at TIMESTAMP DEFAULT NOW() NOT NULL,
  delivered_at TIMESTAMP NULL,
  
  CONSTRAINT check_status CHECK (status IN ('sent', 'delivered', 'bounced', 'failed'))
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_delivery_user ON public.email_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_email ON public.email_delivery_log(email_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_status ON public.email_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_sent ON public.email_delivery_log(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_delivery_notification_type ON public.email_delivery_log(notification_type);

-- Add comments for documentation
COMMENT ON TABLE public.email_delivery_log IS 'Logs email delivery status for monitoring and debugging. Optional table - can be added later if needed.';
COMMENT ON COLUMN public.email_delivery_log.log_id IS 'Primary key for log record';
COMMENT ON COLUMN public.email_delivery_log.user_id IS 'Foreign key to accounts table';
COMMENT ON COLUMN public.email_delivery_log.email_id IS 'Foreign key to user_emails table (nullable to preserve historical records)';
COMMENT ON COLUMN public.email_delivery_log.email IS 'Email address (denormalized for historical records)';
COMMENT ON COLUMN public.email_delivery_log.notification_type IS 'Type of notification that was sent';
COMMENT ON COLUMN public.email_delivery_log.status IS 'Delivery status: sent, delivered, bounced, or failed';
COMMENT ON COLUMN public.email_delivery_log.provider_message_id IS 'Message ID from email provider (e.g., AWS SES message ID)';
COMMENT ON COLUMN public.email_delivery_log.error_message IS 'Error message if delivery failed';

-- Set table owner
ALTER TABLE public.email_delivery_log OWNER TO scmarket;

COMMIT;
