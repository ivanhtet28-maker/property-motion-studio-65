-- Fix: Enable security_invoker on the users view so RLS on user_preferences
-- is enforced. Without this, the view runs as the owner (postgres) and
-- bypasses RLS, allowing any authenticated user to read all rows.
ALTER VIEW users SET (security_invoker = true);
