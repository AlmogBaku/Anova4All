import { Link, NavLink, Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { cn } from "@/lib/utils.ts";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-2 py-1 text-sm hover:underline",
    isActive && "font-semibold",
  );

export function Layout() {
  const { user } = useAuth();
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:p-2"
      >
        Skip to content
      </a>
      <header className="border-b">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3"
        >
          <Link to="/" className="font-semibold">
            Anova4All
          </Link>
          {user && (
            <div className="ml-auto flex items-center gap-2">
              <NavLink to="/" end className={navClass}>
                Cookers
              </NavLink>
              <NavLink to="/account" className={navClass}>
                Account
              </NavLink>
            </div>
          )}
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
      <Toaster position="bottom-center" />
    </div>
  );
}
