import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ghostwriter Review",
  description: "Review and approve generated comic episodes before they post.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/85 px-4 py-3 backdrop-blur">
          <Link href="/" className="text-sm font-semibold tracking-tight text-zinc-200 hover:text-white">
            Ghostwriter <span className="text-zinc-500">/ review</span>
          </Link>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
