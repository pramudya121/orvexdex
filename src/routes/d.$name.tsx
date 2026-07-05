import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { namehash, isAddress } from "viem";
import { Copy, ExternalLink, Globe, Twitter, Github, MessageCircle, ArrowLeftRight, Wallet } from "lucide-react";
import { ADDR, DOMAIN_TLD, explorerAddr } from "@/lib/chain";
import { domainRegistryAbi } from "@/lib/abis/domainRegistry";
import { domainResolverAbi } from "@/lib/abis/domainResolver";
import { useToast } from "@/components/ui/toaster";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

function computeNode(label: string): `0x${string}` {
  // node = keccak256(namehash(TLD) || keccak256(label))
  return namehash(`${label}.${DOMAIN_TLD}`);
}

export const Route = createFileRoute("/d/$name")({
  component: DomainProfilePage,
  head: ({ params }) => {
    const full = `${(params as any).name}.${DOMAIN_TLD}`;
    return {
      meta: [
        { title: `${full} — ORVEX Domain` },
        { name: "description", content: `Public profile of ${full} on the ORVEX name service.` },
        { property: "og:title", content: `${full} — ORVEX Domain` },
        { property: "og:description", content: `Public profile of ${full} on the ORVEX name service.` },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
});

function DomainProfilePage() {
  const { name } = Route.useParams();
  const label = name.replace(/\.orvex$/i, "").toLowerCase();
  const full = `${label}.${DOMAIN_TLD}`;
  const valid = /^[a-z0-9-]{3,32}$/.test(label);
  const node = useMemo(() => (valid ? computeNode(label) : ("0x" + "0".repeat(64)) as `0x${string}`), [label, valid]);

  const owner = useReadContract({
    address: ADDR.domainRegistry as `0x${string}`,
    abi: domainRegistryAbi,
    functionName: "owner",
    args: [node],
    query: { enabled: valid },
  });
  const resolverAddr = useReadContract({
    address: ADDR.domainRegistry as `0x${string}`,
    abi: domainRegistryAbi,
    functionName: "resolver",
    args: [node],
    query: { enabled: valid },
  });

  const activeResolver = (resolverAddr.data as `0x${string}` | undefined) && resolverAddr.data !== ZERO
    ? (resolverAddr.data as `0x${string}`)
    : (ADDR.domainResolver as `0x${string}`);

  const textKeys = ["avatar", "description", "url", "com.twitter", "com.github", "com.discord", "email"] as const;
  const records = useReadContracts({
    contracts: [
      ...textKeys.map((k) => ({
        address: activeResolver, abi: domainResolverAbi,
        functionName: "getText" as const, args: [label, k] as const,
      })),
      { address: activeResolver, abi: domainResolverAbi, functionName: "getAddress" as const, args: [label, "zkltc"] as const },
      { address: activeResolver, abi: domainResolverAbi, functionName: "getContentHash" as const, args: [label] as const },
    ],
    query: { enabled: valid, refetchInterval: 30000 },
  });

  const text = (i: number) => (records.data?.[i]?.result as string | undefined) ?? "";
  const avatar = text(0);
  const description = text(1);
  const url = text(2);
  const twitter = text(3);
  const github = text(4);
  const discord = text(5);
  const email = text(6);
  const zkltcAddr = (records.data?.[textKeys.length]?.result as string | undefined) ?? "";
  const contentHash = (records.data?.[textKeys.length + 1]?.result as string | undefined) ?? "";

  const ownerAddr = owner.data as `0x${string}` | undefined;
  const registered = !!ownerAddr && ownerAddr !== ZERO;
  const { push } = useToast();

  if (!valid) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="glass-strong rounded-3xl p-10">
          <h1 className="text-2xl font-bold mb-2">Invalid domain</h1>
          <p className="text-muted-foreground text-sm">Names are 3–32 chars, a–z, 0–9, hyphen.</p>
          <Link to="/domains" className="inline-block mt-4 text-accent hover:underline text-sm">← Back to Domains</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative max-w-3xl mx-auto px-4 py-12">
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[420px] overflow-hidden -z-10">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full blur-3xl animate-aurora" style={{ background: "var(--gradient-luxe)" }} />
        <div className="absolute top-10 right-10 h-80 w-80 rounded-full blur-3xl animate-aurora-2" style={{ background: "var(--gradient-gold)" }} />
      </div>

      <Link to="/domains" className="text-xs text-muted-foreground hover:text-accent">← Domains</Link>

      <div className="glass-strong rounded-3xl p-6 md:p-8 mt-4 animate-rise">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="h-24 w-24 rounded-2xl bg-gradient-luxe overflow-hidden shrink-0 ring-2 ring-border">
            {avatar ? (
              // eslint-disable-next-line jsx-a11y/img-redundant-alt
              <img src={avatar} alt={`${full} avatar`} className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-3xl font-black text-primary-foreground">
                {label.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-1">ORVEX Name Service</div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gradient-luxe break-all">{full}</h1>
            {description && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{description}</p>}
            <div className="mt-3 inline-flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${registered ? "bg-accent animate-pulse" : "bg-muted"}`} />
              <span className="text-muted-foreground">{registered ? "Registered on-chain" : "Not registered yet"}</span>
            </div>
          </div>
        </div>

        {registered && (
          <div className="grid md:grid-cols-2 gap-3 mt-6">
            <InfoRow icon={<Wallet className="h-3.5 w-3.5" />} label="Owner" value={ownerAddr!} onCopy={() => { navigator.clipboard.writeText(ownerAddr!); push({ title: "Copied", description: "Owner address copied." }); }} link={explorerAddr(ownerAddr!)} mono />
            {zkltcAddr && isAddress(zkltcAddr) && (
              <InfoRow icon={<Wallet className="h-3.5 w-3.5" />} label="zkLTC Address" value={zkltcAddr} onCopy={() => { navigator.clipboard.writeText(zkltcAddr); push({ title: "Copied", description: "Resolver address copied." }); }} link={explorerAddr(zkltcAddr)} mono />
            )}
            {contentHash && (
              <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Content Hash" value={contentHash} onCopy={() => { navigator.clipboard.writeText(contentHash); push({ title: "Copied", description: "Content hash copied." }); }} mono />
            )}
            <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Resolver" value={activeResolver} onCopy={() => { navigator.clipboard.writeText(activeResolver); push({ title: "Copied", description: "Resolver copied." }); }} link={explorerAddr(activeResolver)} mono />
          </div>
        )}

        {registered && (url || twitter || github || discord || email) && (
          <div className="flex flex-wrap gap-2 mt-5">
            {url && <SocialChip icon={<Globe className="h-3.5 w-3.5" />} label={url.replace(/^https?:\/\//, "")} href={url} />}
            {twitter && <SocialChip icon={<Twitter className="h-3.5 w-3.5" />} label={`@${twitter.replace(/^@/, "")}`} href={`https://twitter.com/${twitter.replace(/^@/, "")}`} />}
            {github && <SocialChip icon={<Github className="h-3.5 w-3.5" />} label={github} href={`https://github.com/${github}`} />}
            {discord && <SocialChip icon={<MessageCircle className="h-3.5 w-3.5" />} label={discord} />}
            {email && <SocialChip icon={<MessageCircle className="h-3.5 w-3.5" />} label={email} href={`mailto:${email}`} />}
          </div>
        )}

        {!registered && !owner.isLoading && (
          <div className="mt-6 glass rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-semibold">This name is available.</div>
              <div className="text-muted-foreground text-xs mt-0.5">Claim it on the Domains page — commit, wait, then register.</div>
            </div>
            <Link to="/domains" search={{ q: label } as any} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-luxe text-primary-foreground font-bold text-sm shadow-neon hover:opacity-90 transition">
              <ArrowLeftRight className="h-4 w-4" /> Claim {full}
            </Link>
          </div>
        )}

        {owner.isLoading && (
          <div className="mt-6 text-sm text-muted-foreground animate-pulse">Loading on-chain data…</div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, onCopy, link, mono }: {
  icon: React.ReactNode; label: string; value: string; onCopy?: () => void; link?: string; mono?: boolean;
}) {
  return (
    <div className="glass rounded-xl p-3 flex items-center gap-2 min-w-0">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className={`text-xs truncate ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      {onCopy && <button onClick={onCopy} className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground"><Copy className="h-3.5 w-3.5" /></button>}
      {link && <a href={link} target="_blank" rel="noreferrer" className="p-1.5 rounded-md hover:bg-surface-2 text-muted-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
    </div>
  );
}

function SocialChip({ icon, label, href }: { icon: React.ReactNode; label: string; href?: string }) {
  const inner = (
    <>
      {icon}
      <span className="text-xs font-medium truncate max-w-[180px]">{label}</span>
    </>
  );
  const cls = "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg glass hover:bg-surface-2 transition";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
