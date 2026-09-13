import { SignUp } from "@clerk/nextjs";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({ title: "Start your comic feed", path: "/sign-up" });

export default function Page() {
  return (
    <div className="flex justify-center py-8">
      <SignUp path="/sign-up" routing="path" forceRedirectUrl="/onboarding" />
    </div>
  );
}
