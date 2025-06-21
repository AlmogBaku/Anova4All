-- Anova4All Database Initialization Script

-- 1. Enable the pgcrypto extension for password hashing.
-- This is required for the crypt() function used to hash and verify device secret keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the devices table.
-- This table stores information about each Anova device.
CREATE TABLE IF NOT EXISTS public.devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_card TEXT NOT NULL UNIQUE,
    secret_key TEXT NOT NULL, -- Stores the hashed secret key using pgcrypto's crypt()
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- Foreign key to Supabase auth users. Can be NULL for orphaned devices.
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comments to the table and columns for clarity.
COMMENT ON TABLE public.devices IS 'Stores information about Anova sous vide devices.';
COMMENT ON COLUMN public.devices.id_card IS 'The unique identifier card of the device.';
COMMENT ON COLUMN public.devices.secret_key IS 'The hashed secret key for device pairing, managed by pgcrypto.';
COMMENT ON COLUMN public.devices.user_id IS 'The user who has paired with this device. NULL if the device is unpaired.';
COMMENT ON COLUMN public.devices.name IS 'A user-assigned name for the device.';

-- 3. Set up Row-Level Security (RLS) for the devices table.
-- This ensures that users can only access and manage their own devices.

-- Enable RLS on the devices table.
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure a clean slate.
DROP POLICY IF EXISTS "Allow users to view their own devices" ON public.devices;
DROP POLICY IF EXISTS "Allow users to update their own devices" ON public.devices;

-- Create a policy that allows users to SELECT (view) their own devices.
CREATE POLICY "Allow users to view their own devices" 
ON public.devices FOR SELECT
USING (auth.uid() = user_id);

-- Create a policy that allows users to UPDATE their own devices (e.g., for unpairing or renaming).
CREATE POLICY "Allow users to update their own devices"
ON public.devices FOR UPDATE
USING (auth.uid() = user_id);

-- Note: We do not add policies for INSERT or DELETE by default.
-- INSERTs are handled by the backend when a device first connects (it is orphaned).
-- Pairing is an UPDATE operation, covered by the policy above.
-- Unpairing is also an UPDATE (setting user_id to NULL), covered by the policy above.
-- Direct DELETEs are not currently implemented in the backend logic.

-- Grant usage on the schema to the authenticated role.
-- This is necessary for the RLS policies to function correctly.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.devices TO authenticated;


-- 4. Create a trigger to automatically update the updated_at timestamp.
CREATE OR REPLACE FUNCTION public.handle_updated_at() 
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_devices_updated ON public.devices;
CREATE TRIGGER on_devices_updated
BEFORE UPDATE ON public.devices
FOR EACH ROW
EXECUTE PROCEDURE public.handle_updated_at();


-- End of script.
