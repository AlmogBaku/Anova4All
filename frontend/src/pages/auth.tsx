import { useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  type Location,
} from "react-router";
import { AuthCard } from "@/components/auth/auth-card.tsx";
import { Field } from "@/components/field.tsx";
import { ErrorAlert, Loading, Notice } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { useAction } from "@/hooks/use-action.ts";
import {
  sendPasswordReset,
  signIn,
  signUp,
  updatePassword,
  validatePassword,
} from "@/lib/auth.ts";
import { INITIAL_HASH, authErrorFromHash } from "@/lib/initial-hash.ts";

/** Where to go after logging in: the page that sent us here (with its hash), else home. */
function useReturnTo(): { from: Location | null; target: string | Location } {
  const state = useLocation().state as { from?: Location } | null;
  const from = state?.from ?? null;
  return { from, target: from ?? "/" };
}

const isInvite = (from: Location | null) => from?.pathname === "/invite";

export function LoginPage() {
  const { session, loading } = useAuth();
  const { from, target } = useReturnTo();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const action = useAction(async (email: string, password: string) => {
    await signIn(email, password);
    return true;
  });

  if (loading) return <Loading />;
  if (session) return <Navigate to={target} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password)
      return action.setError("Enter your email and password.");
    if (await action.run(email, password)) navigate(target, { replace: true });
  };

  return (
    <AuthCard
      title="Log in"
      description={isInvite(from) ? "Log in to accept the invite." : undefined}
      onSubmit={onSubmit}
      footer={
        <>
          <Link to="/forgot-password" className="underline">
            Forgot your password?
          </Link>
          <span>
            No account?{" "}
            <Link to="/sign-up" state={{ from }} className="underline">
              Sign up
            </Link>
          </span>
        </>
      }
    >
      {action.error && <ErrorAlert>{action.error}</ErrorAlert>}
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={action.busy}>
        {action.busy ? "Logging in…" : "Log in"}
      </Button>
    </AuthCard>
  );
}

export function SignUpPage() {
  const { session, loading } = useAuth();
  const { from, target } = useReturnTo();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const action = useAction(signUp);

  if (loading) return <Loading />;
  if (session) return <Navigate to={target} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validatePassword(password);
    setPasswordError(invalid);
    if (!email) return action.setError("Enter your email.");
    if (invalid) return;
    const result = await action.run(email, password);
    if (!result) return;
    if (result.needsConfirmation) setSent(true);
    else navigate(target, { replace: true });
  };

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        description={`We sent a confirmation link to ${email}.`}
      >
        <p className="text-sm">
          Open the link to finish creating your account.
        </p>
        {isInvite(from) && (
          <p className="text-sm">
            After you confirm, open the invite link again to join the cooker.
          </p>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign up"
      description={
        isInvite(from) ? "Create an account to accept the invite." : undefined
      }
      onSubmit={onSubmit}
      footer={
        <span>
          Already have an account?{" "}
          <Link to="/login" state={{ from }} className="underline">
            Log in
          </Link>
        </span>
      }
    >
      {action.error && <ErrorAlert>{action.error}</ErrorAlert>}
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        error={passwordError}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={action.busy}>
        {action.busy ? "Signing up…" : "Sign up"}
      </Button>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const action = useAction(async (email: string) => {
    await sendPasswordReset(email);
    return true;
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) return action.setError("Enter your email.");
    // Same answer whether or not the account exists.
    if (await action.run(email)) setSent(true);
  };

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        footer={
          <Link to="/login" className="underline">
            Back to log in
          </Link>
        }
      >
        <p className="text-sm">
          If an account exists for {email}, we sent a link to reset the
          password.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to set a new password."
      onSubmit={onSubmit}
      footer={
        <Link to="/login" className="underline">
          Back to log in
        </Link>
      }
    >
      {action.error && <ErrorAlert>{action.error}</ErrorAlert>}
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" disabled={action.busy}>
        {action.busy ? "Sending…" : "Send reset link"}
      </Button>
    </AuthCard>
  );
}

/** Opened from the reset email; the link signs the user in (recovery session). */
export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const action = useAction(async (password: string) => {
    await updatePassword(password);
    return true;
  });
  const [done, setDone] = useState(false);

  if (loading) return <Loading />;
  if (!session) {
    return (
      <AuthCard
        title="Reset link not valid"
        footer={
          <Link to="/forgot-password" className="underline">
            Send a new link
          </Link>
        }
      >
        <ErrorAlert>
          {authErrorFromHash(INITIAL_HASH) ??
            "This reset link is invalid or has expired."}
        </ErrorAlert>
      </AuthCard>
    );
  }
  if (done) {
    return (
      <AuthCard title="Password updated">
        <Button onClick={() => navigate("/", { replace: true })}>
          Go to your cookers
        </Button>
      </AuthCard>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validatePassword(password);
    setInvalid(err);
    if (err) return;
    if (await action.run(password)) setDone(true);
  };

  return (
    <AuthCard title="Set a new password" onSubmit={onSubmit}>
      {action.error && <ErrorAlert>{action.error}</ErrorAlert>}
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={invalid}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={action.busy}>
        {action.busy ? "Saving…" : "Save password"}
      </Button>
    </AuthCard>
  );
}

/** Landing page of the email confirmation link. */
export function ConfirmPage() {
  const { session, loading } = useAuth();
  if (loading) return <Loading label="Confirming…" />;
  if (session) return <Navigate to="/" replace />;
  return (
    <AuthCard
      title="Couldn't confirm your email"
      footer={
        <Link to="/login" className="underline">
          Log in
        </Link>
      }
    >
      <ErrorAlert>
        {authErrorFromHash(INITIAL_HASH) ??
          "This confirmation link is invalid or has expired."}
      </ErrorAlert>
      <Notice>If you already confirmed, log in.</Notice>
    </AuthCard>
  );
}
