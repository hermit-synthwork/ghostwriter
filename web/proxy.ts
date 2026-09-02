import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Protected-first: everything needs a session except Clerk's own auth routes.
// "/" is deliberately NOT public — the episode queue is the thing being gated.
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:ico|png|jpg|jpeg|webp|svg|css|js|woff2?|ttf)).*)",
    "/(api|trpc)(.*)",
  ],
};
