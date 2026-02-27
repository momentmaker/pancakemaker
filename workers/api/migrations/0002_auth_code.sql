ALTER TABLE auth_tokens ADD COLUMN code TEXT;
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email_code ON auth_tokens(email, code);
