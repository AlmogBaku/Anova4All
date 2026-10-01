import { createBrowserRouter, Outlet } from "react-router";
import { RouterProvider } from "react-router/dom";
import { Layout } from "@/components/layout.tsx";
import { ProtectedRoute } from "@/components/protected-route.tsx";
import { AuthProvider } from "@/contexts/auth.tsx";
import { BASENAME } from "@/lib/env.ts";
import { AccountPage } from "@/pages/account.tsx";
import {
  ConfirmPage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SignUpPage,
} from "@/pages/auth.tsx";
import { DeviceSettingsPage } from "@/pages/device-settings.tsx";
import { DevicePage } from "@/pages/device.tsx";
import { HomePage } from "@/pages/home.tsx";
import { InvitePage } from "@/pages/invite.tsx";
import { NotFoundPage } from "@/pages/misc.tsx";
import { OAuthConsentPage } from "@/pages/oauth-consent.tsx";
import { SetupPage } from "@/pages/setup.tsx";

// Every route works as a deep link: GitHub Pages serves index.html as 404.html.
const router = createBrowserRouter(
  [
    {
      element: (
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      ),
      children: [
        {
          element: <Layout />,
          children: [
            { path: "login", element: <LoginPage /> },
            { path: "sign-up", element: <SignUpPage /> },
            { path: "forgot-password", element: <ForgotPasswordPage /> },
            // Public: the reset link itself signs the user in.
            { path: "reset-password", element: <ResetPasswordPage /> },
            { path: "auth/confirm", element: <ConfirmPage /> },
            {
              element: <ProtectedRoute />,
              children: [
                { index: true, element: <HomePage /> },
                { path: "setup", element: <SetupPage /> },
                { path: "invite", element: <InvitePage /> },
                { path: "devices/:deviceId", element: <DevicePage /> },
                {
                  path: "devices/:deviceId/settings",
                  element: <DeviceSettingsPage />,
                },
                { path: "account", element: <AccountPage /> },
                { path: "oauth/consent", element: <OAuthConsentPage /> },
              ],
            },
            { path: "*", element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ],
  { basename: BASENAME },
);

export function App() {
  return <RouterProvider router={router} />;
}
