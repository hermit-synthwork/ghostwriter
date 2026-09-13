import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex justify-center py-8">
      <SignIn path="/sign-in" routing="path" forceRedirectUrl="/" />
    </div>
  );
}
