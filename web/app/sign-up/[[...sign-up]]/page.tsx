import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex justify-center py-8">
      <SignUp path="/sign-up" routing="path" forceRedirectUrl="/onboarding" />
    </div>
  );
}
