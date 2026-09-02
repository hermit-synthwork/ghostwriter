import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Protected-first: everything needs a session except Clerk's own auth routes.
// "/" is deliberately NOT public — the episode queue is the thing being gated.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  // Redirect explicitly rather than relying on auth.protect(), which falls back
  // to a 404 when it can't resolve a sign-in destination — the app has no local
  // /sign-in route, so sign-in lives on the Clerk accounts portal.
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn({ returnBackUrl: req.url });
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:ico|png|jpg|jpeg|webp|svg|css|js|woff2?|ttf)).*)",
    "/(api|trpc)(.*)",
  ],
};
