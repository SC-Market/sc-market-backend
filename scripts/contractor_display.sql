CREATE TABLE IF NOT EXISTS user_contractor_settings(
  user_id UUID NOT NULL REFERENCES accounts(user_id),
  contractor_id UUID NOT NULL REFERENCES contractors(contractor_id),
  display_membership BOOLEAN NOT NULL DEFAULT TRUE
);