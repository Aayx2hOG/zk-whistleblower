import Link from "next/link";

const CARDS = [
  {
    href: "/admin",
    icon: "admin_panel_settings",
    step: "01",
    title: "Admin",
    description:
      "Register Merkle roots of employee commitments onchain. Revoke roots when membership changes.",
    action: "MANAGE ROOTS",
  },
  {
    href: "/submit",
    icon: "lock",
    step: "02",
    title: "Submit Anonymously",
    description:
      "Prove you are a member without revealing your identity. Generate a ZK proof locally, then submit your encrypted report.",
    action: "SUBMIT REPORT",
  },
  {
    href: "/reviewer",
    icon: "description",
    step: "03",
    title: "Reviewer",
    description:
      "Browse all submitted reports. Fetch encrypted evidence from IPFS and decrypt locally.",
    action: "VIEW REPORTS",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="mb-12">
        <h1 className="text-white text-5xl font-black leading-none tracking-tighter mb-4 uppercase italic">
          Whistleblower Submission Portal
        </h1>
        <div className="flex flex-wrap items-center gap-4">
          <span className="px-2 py-1 bg-green-500 text-black text-[10px] font-bold uppercase tracking-widest">
            Active Connection
          </span>
          <p className="text-slate-500 text-sm font-mono tracking-tight">
            Zero-Knowledge Protocol Enabled // AES-256-GCM Hardware Encrypted
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="card space-y-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">PROTOCOL_OVERVIEW</p>
            <h2 className="section-heading">How It Works</h2>
          </div>
          <span className="material-symbols-outlined text-white/20">info</span>
        </div>
        <ol className="space-y-3 text-sm text-slate-400">
          <li className="flex gap-3">
            <span className="text-white font-black font-mono text-xs w-6 shrink-0">01</span>
            Admin registers employee <em>commitments</em> as a Merkle tree root on-chain.
          </li>
          <li className="flex gap-3">
            <span className="text-white font-black font-mono text-xs w-6 shrink-0">02</span>
            Whistleblower generates a ZK proof locally — proves they know a secret matching a leaf, without revealing which one.
          </li>
          <li className="flex gap-3">
            <span className="text-white font-black font-mono text-xs w-6 shrink-0">03</span>
            The smart contract verifies the proof, checks the nullifier, and stores an encrypted IPFS CID.
          </li>
          <li className="flex gap-3">
            <span className="text-white font-black font-mono text-xs w-6 shrink-0">04</span>
            Authorised reviewers read events and decrypt evidence locally.
          </li>
        </ol>
      </section>

      {/* Cards */}
      <section className="grid gap-6 sm:grid-cols-3">
        {CARDS.map(({ href, icon, step, title, description, action }) => (
          <Link
            key={href}
            href={href}
            className="card flex flex-col gap-4 hover:border-white/30 transition-colors group"
          >
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-mono text-white/40">{step}_MODULE</p>
              <span className="material-symbols-outlined text-white/20 group-hover:text-white/40 transition-colors">
                {icon}
              </span>
            </div>
            <div>
              <h3 className="font-black text-white uppercase text-lg">{title}</h3>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">{description}</p>
            </div>
            <span className="mt-auto text-xs font-black text-white uppercase tracking-widest border-t border-white/10 pt-3">
              {action} →
            </span>
          </Link>
        ))}
      </section>

      {/* Warning */}
      <p className="text-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
        Warning: All submissions are irreversible once broadcast to the network.
      </p>
    </div>
  );
}
