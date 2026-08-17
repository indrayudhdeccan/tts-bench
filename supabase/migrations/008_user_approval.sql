-- User approval gate: new signups pending until admin approves.

DO $$ BEGIN
  CREATE TYPE user_approval_status AS ENUM ('pending', 'approved', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approval_status user_approval_status NOT NULL DEFAULT 'pending';

-- Grandfather all existing accounts; only new signups after this migration start as pending.
UPDATE profiles SET approval_status = 'approved';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, approval_status)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'user'
    ),
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- Decrement vote_count when admin deletes a vote row.
CREATE OR REPLACE FUNCTION decrement_profile_vote_count()
RETURNS trigger AS $$
BEGIN
  UPDATE profiles SET vote_count = GREATEST(0, vote_count - 1) WHERE id = OLD.user_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_vote_delete ON votes;
CREATE TRIGGER on_vote_delete
  AFTER DELETE ON votes
  FOR EACH ROW EXECUTE FUNCTION decrement_profile_vote_count();
