import { Link } from "react-router";

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
