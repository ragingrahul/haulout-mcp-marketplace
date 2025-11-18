-- =====================================================
-- MCP Marketplace Database Schema
-- =====================================================
-- This schema creates the endpoints table with proper
-- Row Level Security (RLS) for multi-tenant isolation
-- =====================================================

-- =====================================================
-- Utility Functions (must be defined first)
-- =====================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- User Profiles Table
-- =====================================================
-- Central profile data linking auth.users to all other tables

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    
    -- Wallet addresses
    wallet_address TEXT, -- User's personal Base wallet for receiving payments
    
    -- Role and permissions
    role TEXT NOT NULL DEFAULT 'developer' CHECK (role IN ('developer', 'consumer', 'admin')),
    
    -- Statistics (could be computed, but stored for performance)
    total_endpoints_created INTEGER DEFAULT 0,
    total_api_calls_made INTEGER DEFAULT 0,
    total_earnings_eth TEXT DEFAULT '0',
    
    -- Settings
    email_notifications BOOLEAN DEFAULT true,
    public_profile BOOLEAN DEFAULT true,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address ON public.profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Public profiles are viewable by everyone"
    ON public.profiles
    FOR SELECT
    USING (public_profile = true);

CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Grant access
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT INSERT ON public.profiles TO authenticated;

-- Comments
COMMENT ON TABLE public.profiles IS 'User profile data that ties together all user-related information';
COMMENT ON COLUMN public.profiles.wallet_address IS 'User wallet address for receiving payments (stored in endpoint_pricing per endpoint)';

-- Create endpoints table
CREATE TABLE IF NOT EXISTS public.endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
    description TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
    headers JSONB,
    timeout INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique endpoint names per user
    CONSTRAINT unique_user_endpoint_name UNIQUE (user_id, name)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_endpoints_user_id ON public.endpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_created_at ON public.endpoints(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.endpoints ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own endpoints" ON public.endpoints;
DROP POLICY IF EXISTS "Users can insert their own endpoints" ON public.endpoints;
DROP POLICY IF EXISTS "Users can update their own endpoints" ON public.endpoints;
DROP POLICY IF EXISTS "Users can delete their own endpoints" ON public.endpoints;

-- RLS Policies: Users can only access their own endpoints
CREATE POLICY "Anyone can view all endpoints" 
    ON public.endpoints 
    FOR SELECT 
    USING (true);

CREATE POLICY "Users can insert their own endpoints"
    ON public.endpoints
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own endpoints"
    ON public.endpoints
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own endpoints"
    ON public.endpoints
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create trigger to auto-update updated_at on row update
DROP TRIGGER IF EXISTS update_endpoints_updated_at ON public.endpoints;
CREATE TRIGGER update_endpoints_updated_at
    BEFORE UPDATE ON public.endpoints
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Optional: Create a view for endpoint statistics per user
CREATE OR REPLACE VIEW public.user_endpoint_stats AS
SELECT 
    user_id,
    COUNT(*) as total_endpoints,
    COUNT(CASE WHEN method = 'GET' THEN 1 END) as get_endpoints,
    COUNT(CASE WHEN method = 'POST' THEN 1 END) as post_endpoints,
    COUNT(CASE WHEN method = 'PUT' THEN 1 END) as put_endpoints,
    COUNT(CASE WHEN method = 'DELETE' THEN 1 END) as delete_endpoints,
    COUNT(CASE WHEN method = 'PATCH' THEN 1 END) as patch_endpoints,
    MAX(created_at) as last_endpoint_created
FROM public.endpoints
GROUP BY user_id;

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoints TO authenticated;
GRANT SELECT ON public.user_endpoint_stats TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.endpoints IS 'Stores REST API endpoints that are converted to MCP tools';
COMMENT ON COLUMN public.endpoints.user_id IS 'The developer/user who created this endpoint';
COMMENT ON COLUMN public.endpoints.name IS 'Unique endpoint name (unique per user, becomes MCP tool name)';
COMMENT ON COLUMN public.endpoints.parameters IS 'JSON array of parameter definitions';
COMMENT ON COLUMN public.endpoints.headers IS 'Optional HTTP headers to include in requests';
COMMENT ON COLUMN public.endpoints.timeout IS 'Request timeout in seconds';

-- =====================================================
-- Payment System Tables
-- =====================================================

-- Table: endpoint_pricing
-- Stores pricing information for paid endpoints
CREATE TABLE IF NOT EXISTS public.endpoint_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
    price_per_call_eth TEXT NOT NULL, -- Stored as string to preserve precision
    developer_wallet_address TEXT NOT NULL, -- Base wallet address
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One pricing record per endpoint
    CONSTRAINT unique_endpoint_pricing UNIQUE (endpoint_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_endpoint_pricing_endpoint_id ON public.endpoint_pricing(endpoint_id);

-- Enable RLS
ALTER TABLE public.endpoint_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies for endpoint_pricing
DROP POLICY IF EXISTS "Anyone can view pricing" ON public.endpoint_pricing;
DROP POLICY IF EXISTS "Developers can manage their endpoint pricing" ON public.endpoint_pricing;

CREATE POLICY "Anyone can view pricing"
    ON public.endpoint_pricing
    FOR SELECT
    USING (true);

CREATE POLICY "Developers can manage their endpoint pricing"
    ON public.endpoint_pricing
    FOR ALL
    USING (
        endpoint_id IN (
            SELECT id FROM public.endpoints WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        endpoint_id IN (
            SELECT id FROM public.endpoints WHERE user_id = auth.uid()
        )
    );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_endpoint_pricing_updated_at ON public.endpoint_pricing;
CREATE TRIGGER update_endpoint_pricing_updated_at
    BEFORE UPDATE ON public.endpoint_pricing
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Table: user_balances
-- Tracks user balances in the platform wallet (internal accounting)
CREATE TABLE IF NOT EXISTS public.user_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    balance_eth TEXT NOT NULL DEFAULT '0', -- User's balance in platform wallet
    total_deposited_eth TEXT NOT NULL DEFAULT '0', -- Total amount deposited
    total_spent_eth TEXT NOT NULL DEFAULT '0', -- Total amount spent on tools
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- One balance record per user
    CONSTRAINT unique_user_balance UNIQUE (user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON public.user_balances(user_id);

-- Enable RLS
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_balances
DROP POLICY IF EXISTS "Users can view their own balance" ON public.user_balances;
DROP POLICY IF EXISTS "System can manage balances" ON public.user_balances;

CREATE POLICY "Users can view their own balance"
    ON public.user_balances
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can manage balances"
    ON public.user_balances
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_user_balances_updated_at ON public.user_balances;
CREATE TRIGGER update_user_balances_updated_at
    BEFORE UPDATE ON public.user_balances
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Table: payment_transactions
-- Audit trail of all payment transactions
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT NOT NULL UNIQUE, -- pay_xxx format
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
    from_wallet TEXT NOT NULL,
    to_wallet TEXT NOT NULL,
    amount_eth TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
    blockchain_tx_hash TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_transactions_payment_id ON public.payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_endpoint_id ON public.payment_transactions(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tx_hash ON public.payment_transactions(blockchain_tx_hash);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);

-- Enable RLS
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_transactions
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "System can create transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "System can update transactions" ON public.payment_transactions;

CREATE POLICY "Users can view their own transactions"
    ON public.payment_transactions
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "System can create transactions"
    ON public.payment_transactions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update transactions"
    ON public.payment_transactions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_pricing TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_balances TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.endpoint_pricing IS 'Stores pricing configuration for paid API endpoints';
COMMENT ON TABLE public.user_balances IS 'Tracks user balances in the platform wallet (internal accounting)';
COMMENT ON TABLE public.payment_transactions IS 'Audit trail of all payment transactions';

-- =====================================================
-- OAuth 2.1 Authorization Tables
-- =====================================================

-- Table: oauth_clients
-- Stores OAuth client credentials for MCP access
CREATE TABLE IF NOT EXISTS public.oauth_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id TEXT UNIQUE NOT NULL,
    client_secret_hash TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Nullable for DCR clients (assigned on first authorization)
    client_name TEXT,
    scopes TEXT[] DEFAULT ARRAY['mcp:tools', 'mcp:resources'],
    redirect_uris TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked BOOLEAN DEFAULT FALSE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_oauth_clients_user_id ON public.oauth_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id ON public.oauth_clients(client_id) WHERE NOT revoked;

-- Enable RLS
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for oauth_clients
DROP POLICY IF EXISTS "Users can view their own OAuth clients" ON public.oauth_clients;
DROP POLICY IF EXISTS "Users can create their own OAuth clients" ON public.oauth_clients;
DROP POLICY IF EXISTS "Users can update their own OAuth clients" ON public.oauth_clients;

CREATE POLICY "Users can view their own OAuth clients"
    ON public.oauth_clients
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own OAuth clients"
    ON public.oauth_clients
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OAuth clients"
    ON public.oauth_clients
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_oauth_clients_last_used ON public.oauth_clients;

-- Table: authorization_codes
-- Temporary storage for OAuth authorization codes
CREATE TABLE IF NOT EXISTS public.authorization_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL CHECK (code_challenge_method IN ('S256')),
    scopes TEXT[] NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_authorization_codes_code ON public.authorization_codes(code) WHERE NOT used;
CREATE INDEX IF NOT EXISTS idx_authorization_codes_expires ON public.authorization_codes(expires_at) WHERE NOT used;

-- Enable RLS
ALTER TABLE public.authorization_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authorization_codes (service account only)
DROP POLICY IF EXISTS "Service can manage authorization codes" ON public.authorization_codes;

CREATE POLICY "Service can manage authorization codes"
    ON public.authorization_codes
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Table: refresh_tokens
-- Storage for refresh tokens
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    scopes TEXT[] NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON public.refresh_tokens(token_hash) WHERE NOT revoked;

-- Enable RLS
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for refresh_tokens
DROP POLICY IF EXISTS "Users can view their own refresh tokens" ON public.refresh_tokens;

CREATE POLICY "Users can view their own refresh tokens"
    ON public.refresh_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.oauth_clients TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.authorization_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.refresh_tokens TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.oauth_clients IS 'OAuth 2.1 client credentials for MCP server access';
COMMENT ON TABLE public.authorization_codes IS 'Temporary storage for OAuth authorization codes (10 minute expiry)';
COMMENT ON TABLE public.refresh_tokens IS 'Long-lived refresh tokens for obtaining new access tokens';

-- Cleanup function for expired authorization codes (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_auth_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM public.authorization_codes
    WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS user_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  endpoint_object_id TEXT NOT NULL,
  endpoint_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(endpoint_object_id)
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_user_endpoints_wallet ON user_endpoints(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_endpoints_user ON user_endpoints(user_id);
CREATE INDEX IF NOT EXISTS idx_user_endpoints_object_id ON user_endpoints(endpoint_object_id);

-- Enable RLS
ALTER TABLE user_endpoints ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own mappings
CREATE POLICY "Users can read their own endpoint mappings"
  ON user_endpoints FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own mappings (via authenticated backend)
CREATE POLICY "Users can insert their own endpoint mappings"
  ON user_endpoints FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own mappings
CREATE POLICY "Users can delete their own endpoint mappings"
  ON user_endpoints FOR DELETE
  USING (auth.uid() = user_id);

-- Comment
COMMENT ON TABLE user_endpoints IS 'Maps users to their blockchain endpoint objects. Quick fix for endpoint ownership.';



