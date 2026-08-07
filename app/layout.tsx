import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "LexZim — Legal Practice Management",
  description:
    "LexZim web SaaS for Zimbabwe legal practice management. Multi-tenant LPMS Core platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
