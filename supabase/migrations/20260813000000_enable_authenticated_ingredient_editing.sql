-- Ingredient names, notes, amounts, and variations are edited by authenticated
-- recipe owners in the web app. RLS continues to restrict rows by recipe owner.

GRANT INSERT, UPDATE ON TABLE ingredients TO authenticated;
