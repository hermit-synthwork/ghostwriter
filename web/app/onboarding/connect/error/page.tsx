import Link from "next/link";
import { reconnectInstagramAction } from "../../actions";

export default async function ConnectErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const detail = pick("error_message") ?? pick("reason");
  const code = pick("error");

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-zinc-100">Instagram didn&apos;t connect</h1>
      {detail && <p className="text-sm text-zinc-300">{detail}</p>}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-400">
        Ghostwriter can only post to an Instagram <span className="text-zinc-200">Business or Creator</span> account
        linked to a Facebook Page. If yours is a personal account, switch it in Instagram → Settings → Account type
        and tools, link a Facebook Page, then try again.
      </div>
      {code && <p className="text-xs text-zinc-500">Error code: {code}</p>}
      <div className="flex items-center gap-4">
        <form action={reconnectInstagramAction}>
          <button
            type="submit"
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            Try connecting again
          </button>
        </form>
        <Link href="/onboarding" className="text-sm text-zinc-400 hover:text-zinc-200">
          Back
        </Link>
      </div>
    </div>
  );
}
