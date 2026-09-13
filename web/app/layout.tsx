import { Geist } from "next/font/google";
import Link from "next/link";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { buildMetadata } from "@/lib/seo";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata = buildMetadata();

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/85 px-4 py-3 backdrop-blur">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-100 hover:text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.svg" alt="" width={24} height={24} className="h-6 w-6" />
              Ghostwriter
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/about" className="text-sm text-zinc-400 hover:text-zinc-100">
                About
              </Link>
              <UserButton />
            </div>
          </header>
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
