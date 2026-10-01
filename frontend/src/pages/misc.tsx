import { Link, useSearchParams } from "react-router";
import { ErrorAlert } from "@/components/status.tsx";

export function NotFoundPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="underline">
        Go to your cookers
      </Link>
    </div>
  );
}

/**
 * /oauth/consent?authorization_id=… deep link. Placeholder until the OAuth
 * consent flow lands; the route exists so the link resolves on GitHub Pages.
 */
export function OAuthConsentPage() {
  const [params] = useSearchParams();
  const hasRequest = !!params.get("authorization_id");
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Connect an app</h1>
      <ErrorAlert>
        {hasRequest
          ? "Connecting apps isn't available yet. Nothing was shared."
          : "This link is missing its authorization request."}
      </ErrorAlert>
      <Link to="/account" className="underline">
        Go to your account
      </Link>
    </div>
  );
}
