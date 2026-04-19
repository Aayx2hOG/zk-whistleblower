import Link from "next/link";
import { Icon } from "@zk-whistleblower/ui";

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

      {/* landing page info card*/}
      <section className="card space-y-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">PROTOCOL_OVERVIEW</p>
            <h2 className="section-heading">How It Works</h2>
          </div>
          <Icon name="info" className="text-white/20 text-2xl" />
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

      {/* Action CTA */}
      <section>
          <Link
            href="/submit"
            className="card flex flex-col gap-5 hover:border-white/30 transition-all duration-300 hover:bg-white/[0.03] hover:-translate-y-1 group"
          >
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-mono text-white/40">01_MODULE</p>
              <Icon name="lock" className="text-white/20 group-hover:text-white/40 transition-colors text-3xl" />
            </div>
            <div>
              <h3 className="font-black text-white uppercase text-2xl">Submit Anonymously</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-xl">
                Prove you are a member without revealing your identity. Generate a ZK proof locally, then submit your encrypted report to the blockchain.
              </p>
            </div>
            <div className="mt-2 border-t border-white/10 pt-4">
              <span className="inline-block text-sm font-black text-white uppercase tracking-widest group-hover:translate-x-2 transition-transform">
                SUBMIT REPORT →
              </span>
            </div>
          </Link>
      </section>

      {/* footer */}
      <p className="text-center text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-8">
        Warning: All submissions are irreversible once broadcast to the network.
      </p>
    </div>
  );
}
