import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Protected-first: everything needs a session except Clerk's own auth routes,
// the crawler files (robots/sitemap/llms.txt — a redirect to sign-in would hide
// them), and the Stripe webhook (a server-to-server POST with no Clerk session).
// Images, including og.jpg and the icons, skip middleware via the matcher below.
// "/" is deliberately NOT public — the episode queue is the thing being gated.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/about",
  "/api/stripe/webhook",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isPublicRoute(req)) return;
    // Redirect explicitly rather than relying on auth.protect(), which falls back
    // to a 404 when it can't resolve a sign-in destination.
    const { isAuthenticated, redirectToSignIn } = await auth();
    if (!isAuthenticated) return redirectToSignIn({ returnBackUrl: req.url });
  },
  // Server-side redirects read these, not ClerkProvider's props in layout.tsx —
  // without them redirectToSignIn still goes to Clerk's hosted portal.
  { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:ico|png|jpg|jpeg|webp|svg|css|js|woff2?|ttf)).*)",
    "/(api|trpc)(.*)",
  ],
};
