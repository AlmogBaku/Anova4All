import { useState, type FormEvent } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  type Location,
} from "react-router";
import { AuthCard, QuietLink } from "@/components/auth/auth-card.tsx";
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

/** What this is, for someone who landed here from a link. */
function About({ invite }: { invite?: string }) {
  return (
    <>
      {invite && <p className="font-semibold">{invite}</p>}
      <p>Control your Anova Precision Cooker Wi-Fi from anywhere.</p>
      <p className="text-sm text-ink-soft">
        Anova4All is an independent open-source project, not affiliated with
        Anova.
      </p>
    </>
  );
}

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
      description={
        <About
          invite={isInvite(from) ? "Log in to accept the invite." : undefined}
        />
      }
      onSubmit={onSubmit}
      action={
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={action.busy}
        >
          {action.busy ? "Logging in…" : "Log in"}
        </Button>
      }
      footer={
        <>
          <QuietLink to="/forgot-password">Forgot your password?</QuietLink>
          <span className="inline-flex min-h-11 items-center gap-1">
            No account?{" "}
            <QuietLink to="/sign-up" state={{ from }}>
              Sign up
            </QuietLink>
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
        description={
          <p>
            We sent a confirmation link to{" "}
            <span className="font-semibold break-all">{email}</span>.
          </p>
        }
      >
        <p>Open the link to finish creating your account.</p>
        {isInvite(from) && (
          <p className="text-ink-soft">
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
        <About
          invite={
            isInvite(from)
              ? "Create an account to accept the invite."
              : undefined
          }
        />
      }
      onSubmit={onSubmit}
      action={
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={action.busy}
        >
          {action.busy ? "Signing up…" : "Sign up"}
        </Button>
      }
      footer={
        <span className="inline-flex min-h-11 items-center gap-1">
          Already have an account?{" "}
          <QuietLink to="/login" state={{ from }}>
            Log in
          </QuietLink>
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
        footer={<QuietLink to="/login">Back to log in</QuietLink>}
      >
        <p className="leading-relaxed">
          If an account exists for{" "}
          <span className="font-semibold break-all">{email}</span>, we sent a
          link to reset the password.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description={<p>We'll email you a link to set a new password.</p>}
      onSubmit={onSubmit}
      action={
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={action.busy}
        >
          {action.busy ? "Sending…" : "Send reset link"}
        </Button>
      }
      footer={<QuietLink to="/login">Back to log in</QuietLink>}
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
        footer={<QuietLink to="/forgot-password">Send a new link</QuietLink>}
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
      <AuthCard
        title="Password updated"
        action={
          <Button
            size="lg"
            className="w-full"
            onClick={() => navigate("/", { replace: true })}
          >
            Go to your cookers
          </Button>
        }
      />
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
    <AuthCard
      title="Set a new password"
      onSubmit={onSubmit}
      action={
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={action.busy}
        >
          {action.busy ? "Saving…" : "Save password"}
        </Button>
      }
    >
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
      footer={<QuietLink to="/login">Log in</QuietLink>}
    >
      <ErrorAlert>
        {authErrorFromHash(INITIAL_HASH) ??
          "This confirmation link is invalid or has expired."}
      </ErrorAlert>
      <Notice>If you already confirmed, log in.</Notice>
    </AuthCard>
  );
}
