// Supabase auth actions. Passwords and tokens are never logged.
import { appUrl } from "@/lib/env.ts";
import { supabase } from "@/lib/supabase.ts";

export const PASSWORD_MIN = 8;

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  check(error);
}

/** Email confirmation is on: the user gets a link to /auth/confirm. */
export async function signUp(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appUrl("/auth/confirm") },
  });
  check(error);
  return { needsConfirmation: !data.session };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  check(error);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl("/reset-password"),
  });
  check(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  check(error);
}

export function validatePassword(password: string): string | null {
  return password.length < PASSWORD_MIN
    ? `Use at least ${PASSWORD_MIN} characters.`
    : null;
}
