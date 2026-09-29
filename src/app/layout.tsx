import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme-provider";
import { connection } from "next/server";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/branding";
import { runtimeConfigScript, serverRuntimeConfig } from "@/lib/runtime-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `${APP_NAME} | %s` },
  description: APP_DESCRIPTION,
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    type: "website",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Request-time rendering, so INFRAHUB_PLAN etc. are read from the
  // running container rather than frozen at build -- see
  // lib/runtime-config.ts.
  await connection();
  const runtime = serverRuntimeConfig();

  return (
    <html
      lang="en"
      // suppressHydrationWarning: the blocking script below adds/removes
      // the "dark" class before React hydrates, which would otherwise be a
      // legitimate server/client markup mismatch warning on this one
      // attribute -- exactly the tradeoff next-themes documents for the
      // same technique.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before hydration so the correct theme is already applied
            on first paint -- see theme-provider.tsx's own doc comment for
            why this exact script text lives there, not duplicated here. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript(runtime) }} />
      </head>
      <body className="h-full min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
