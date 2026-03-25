"use client";

import { useState, useCallback, useEffect } from "react";
import {
} from "wagmi";
import { createPublicClient, http } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { REGISTRY_ABI, REGISTRY_ADDRESS, CATEGORIES } from "@/lib/contracts";
import { relaySubmitReportForOrg } from "@/lib/relayer";
import { initPoseidon } from "@/lib/poseidon";
import { buildMerkleTree } from "@/lib/merkle";
import { generateZKProof, type FormattedProof } from "@/lib/zkProof";
import { decryptSecret, type MemberKeyFile } from "@/lib/secretGen";
import { encryptReportForOrgPublicKey } from "@/lib/encryption";
import { uploadEncryptedReport } from "@/lib/ipfs";
import { getDemoMembers, type DemoMember } from "@/lib/demoOrg";
import { getCurrentEpoch, formatEpochRange } from "@/lib/epoch";
import { useOrg } from "@/providers/OrgProvider";
import { getOrgPublicKeyConfig } from "@/lib/orgKeys";

const SUBMIT_REPORT_GAS_LIMIT = 12_000_000n;
const APP_NETWORK = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
const APP_CHAIN = APP_NETWORK === "sepolia" ? sepolia : hardhat;
const appPublicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

const VERIFIER_ABI = [
  {
    type: "function",
    name: "verifyProof",
    stateMutability: "view",
    inputs: [
      { name: "_pA", type: "uint256[2]" },
      { name: "_pB", type: "uint256[2][2]" },
      { name: "_pC", type: "uint256[2]" },
      { name: "_pubSignals", type: "uint256[3]" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

function Step({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-8 w-8 items-center justify-center text-xs font-black font-mono
          ${done ? "bg-white text-black" : active ? "border-2 border-white text-white" : "border border-white/20 text-slate-500"}`}
      >
        {done ? "✓" : String(n).padStart(2, "0")}
      </div>
      <span
        className={`text-sm uppercase tracking-wider font-bold ${done ? "text-white" : active ? "text-white" : "text-slate-500"}`}
      >
        {label}
      </span>
    </div>
  );
}

export default function SubmitPage() {
  const { selectedOrgId } = useOrg();
  const [keyFileJson, setKeyFileJson] = useState("");
  const [keyFilePassword, setKeyFilePassword] = useState("");
  const [keyImportStatus, setKeyImportStatus] = useState<
    "idle" | "decrypting" | "done" | "error"
  >("idle");
  const [keyImportError, setKeyImportError] = useState("");
  const [demoMembers, setDemoMembers] = useState<DemoMember[]>([]);
  const [selectedDemoId, setSelectedDemoId] = useState("");
  const [demoLoadMessage, setDemoLoadMessage] = useState("");

  const [secret, setSecret] = useState("");
  const [leafIndex, setLeafIndex] = useState("0");
  const [orgSecrets, setOrgSecrets] = useState("");
  const [externalNullifier, setExternalNullifier] = useState("42");
  const [encryptedCID, setEncryptedCID] = useState("");
  const [category, setCategory] = useState<0 | 1 | 2 | 3>(0);

  const [reportText, setReportText] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState("");

  const [proofStatus, setProofStatus] = useState<
    "idle" | "generating" | "ready" | "error"
  >("idle");
  const [proofLog, setProofLog] = useState<string[]>([]);
  const [proof, setProof] = useState<FormattedProof | null>(null);
  const [proofError, setProofError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitPending, setSubmitPending] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submittedTxHash, setSubmittedTxHash] = useState<`0x${string}` | "">("");

  const log = (msg: string) =>
    setProofLog((l) => [...l, `${new Date().toLocaleTimeString()} ${msg}`]);

  useEffect(() => {
    const members = getDemoMembers(selectedOrgId);
    setDemoMembers(members);
    if (members.length && !selectedDemoId) {
      setSelectedDemoId(members[0].id);
    }
  }, [selectedDemoId, selectedOrgId]);

  useEffect(() => {
    setExternalNullifier(getCurrentEpoch().toString());
  }, []);

  const handleLoadDemoContext = useCallback(() => {
    const members = getDemoMembers(selectedOrgId);
    setDemoMembers(members);
    setDemoLoadMessage("");

    if (!members.length) {
      setDemoLoadMessage("No demo members found. Join on the Join Org page first.");
      return;
    }

    const selected = members.find((m) => m.id === selectedDemoId) ?? members[0];
    const commitments = members.map((m) => m.commitment);
    const idx = commitments.findIndex((c) => c === selected.commitment);

    setSelectedDemoId(selected.id);
    setSecret(selected.secret);
    setLeafIndex(String(idx));
    setOrgSecrets(commitments.join("\n"));
    setDemoLoadMessage(
      `Loaded ${members.length} demo commitments. Selected member ${selected.id} at index ${idx}.`
    );
  }, [selectedDemoId, selectedOrgId]);

  const handleKeyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setKeyFileJson((ev.target?.result as string) ?? "");
    reader.readAsText(file);
    setKeyImportStatus("idle");
    setKeyImportError("");
  };

  const handleDecryptKeyFile = useCallback(async () => {
    setKeyImportError("");
    setKeyImportStatus("decrypting");
    try {
      const parsed: MemberKeyFile = JSON.parse(keyFileJson);
      if (!parsed.encrypted || !parsed.commitment)
        throw new Error("Not a valid key file.");
      const decrypted = await decryptSecret(parsed.encrypted, keyFilePassword);
      setSecret(decrypted.toString());
      setKeyImportStatus("done");
    } catch (e: unknown) {
      setKeyImportError(e instanceof Error ? e.message : String(e));
      setKeyImportStatus("error");
    }
  }, [keyFileJson, keyFilePassword]);

  const handleEncryptAndUpload = useCallback(async () => {
    setUploadError("");
    setUploadStatus("working");
    try {
      const { keyB64, keyVersion } = getOrgPublicKeyConfig(selectedOrgId);
      const blob = await encryptReportForOrgPublicKey(reportText, selectedOrgId, keyB64, keyVersion);
      const cid = await uploadEncryptedReport(blob);
      setEncryptedCID(cid);
      setUploadStatus("done");
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : String(e));
      setUploadStatus("error");
    }
  }, [reportText, selectedOrgId]);

  const handleGenerateProof = useCallback(async () => {
    setProofError("");
    setProof(null);
    setProofLog([]);
    setProofStatus("generating");

    try {
      log("Initialising Poseidon hasher…");
      await initPoseidon();

      const secretBig = BigInt(secret.trim());
      const leafIdx = parseInt(leafIndex, 10);
      const extNull = BigInt(externalNullifier.trim() || "42");

      // Each line is a commitment already hashed by the admin — paste from manifest.json as-is
      const lines = orgSecrets
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!lines.length) throw new Error("Enter at least one organisation commitment");
      const commitments = lines.map((s) => BigInt(s));

      log(`Building Merkle tree (${commitments.length} members)…`);
      const tree = buildMerkleTree(commitments);
      log(`Root: ${tree.root}`);

      log("Fetching circuit artifacts from /circuits/…");
      log("Generating Groth16 proof (this can take 20–40 s)…");

      const result = await generateZKProof({
        root: tree.root,
        secret: secretBig,
        leafIndex: leafIdx,
        externalNullifier: extNull,
        tree,
      });

      log("Proof generated ✓");
      setProof(result);
      setProofStatus("ready");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setProofError(msg);
      setProofStatus("error");
      log(`Error: ${msg}`);
    }
  }, [secret, leafIndex, orgSecrets, externalNullifier]);

  const mapContractError = (msg: string): string => {
    if (msg.includes("UnknownMerkleRoot")) {
      return "Merkle root is not active on-chain. Add this root from Admin page, then retry.";
    }
    if (msg.includes("NullifierAlreadyUsed")) {
      return "This identity already submitted for the selected epoch. Use a new epoch or different member.";
    }
    if (msg.includes("InvalidCategory")) {
      return "Category must be one of 0..3.";
    }
    if (msg.includes("InvalidZKProof")) {
      return "Proof verification failed. Ensure secret, leaf index, commitments list, and epoch exactly match the registered root. If this persists, your deployed verifier may not match the frontend zkey artifacts.";
    }
    if (
      msg.includes("exceeds transaction gas cap") ||
      msg.includes("Transaction gas limit")
    ) {
      return "Tx gas exceeded local node cap. Retry submit. If it still fails, the proof or inputs are invalid.";
    }
    if (msg.includes("Internal error")) {
      return "RPC returned an internal error while simulating or sending the tx. Most common cause is an invalid proof/public inputs mismatch. Re-generate proof after reloading the exact root + epoch context.";
    }
    if (msg.includes("Failed to fetch") || msg.includes("HTTP request failed")) {
      return "RPC connection failed. Set NEXT_PUBLIC_NETWORK_NAME=sepolia and NEXT_PUBLIC_RPC_URL in frontend/.env.local, then restart frontend.";
    }
    return msg;
  };

  const handleSubmit = async () => {
    if (!proof) return;
    setSubmitError("");
    setSubmitSuccess(false);
    if (!encryptedCID.trim()) {
      setSubmitError("Upload encrypted report first to get CID.");
      return;
    }

    setSubmitPending(true);
    const encoded = new TextEncoder().encode(encryptedCID);
    const cidHex = `0x${Array.from(encoded).map(b => b.toString(16).padStart(2, '0')).join('')}`;
    const submitArgs = [
      BigInt(selectedOrgId),
      proof.pA,
      proof.pB,
      proof.pC,
      proof.root,
      proof.nullifierHash,
      proof.externalNullifier,
      cidHex as `0x${string}`,
      category,
    ] as const;

    try {
      const rootActive = await appPublicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "orgRoots",
        args: [BigInt(selectedOrgId), proof.root],
      });
      if (!rootActive) {
        setSubmitError(mapContractError("UnknownMerkleRoot"));
        return;
      }

      const nullifierUsed = await appPublicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "orgUsedNullifiers",
        args: [BigInt(selectedOrgId), proof.nullifierHash],
      });
      if (nullifierUsed) {
        setSubmitError(mapContractError("NullifierAlreadyUsed"));
        return;
      }

      const verifierAddress = await appPublicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "verifier",
      });

      const verifierAcceptsProof = await appPublicClient.readContract({
        address: verifierAddress,
        abi: VERIFIER_ABI,
        functionName: "verifyProof",
        args: [
          proof.pA,
          proof.pB,
          proof.pC,
          [proof.root, proof.nullifierHash, proof.externalNullifier],
        ],
      });

      if (!verifierAcceptsProof) {
        setSubmitError(
          "Proof is locally valid but rejected by deployed verifier. Your on-chain verifier and frontend circuit artifacts are out of sync. Regenerate artifacts, redeploy contracts, update NEXT_PUBLIC_REGISTRY_ADDRESS, then retry."
        );
        return;
      }

      // Preflight simulation catches verifier/custom errors before relaying a paid tx.
      await appPublicClient.simulateContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "submitReportForOrg",
        args: submitArgs,
      });

      const { txHash } = await relaySubmitReportForOrg({
        orgId: String(selectedOrgId),
        pA: [proof.pA[0].toString(), proof.pA[1].toString()],
        pB: [
          [proof.pB[0][0].toString(), proof.pB[0][1].toString()],
          [proof.pB[1][0].toString(), proof.pB[1][1].toString()],
        ],
        pC: [proof.pC[0].toString(), proof.pC[1].toString()],
        root: proof.root.toString(),
        nullifierHash: proof.nullifierHash.toString(),
        externalNullifier: proof.externalNullifier.toString(),
        encryptedCIDHex: cidHex as `0x${string}`,
        category,
      });

      setSubmittedTxHash(txHash);
      await appPublicClient.waitForTransactionReceipt({ hash: txHash });
      setSubmitSuccess(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitError(mapContractError(msg));
    } finally {
      setSubmitPending(false);
    }
  };

  const currentStep =
    submitSuccess ? 3 : proof ? 2 : proofStatus === "idle" ? 0 : 1;

  return (
    <div className="space-y-12">
      <div className="mb-8">
        <h1 className="text-white text-4xl font-black leading-none tracking-tighter mb-3 uppercase italic">
          Submit Anonymous Report
        </h1>
        <div className="flex items-center gap-4">
          <span className="px-2 py-1 bg-green-500 text-black text-[10px] font-bold uppercase tracking-widest">
            ZK Enabled
          </span>
          <p className="text-slate-500 text-sm font-mono tracking-tight">
            Proof generation runs entirely in your browser
          </p>
        </div>
        <p className="text-slate-500 text-xs font-mono tracking-tight mt-2">
          Active org: {selectedOrgId}
        </p>
      </div>

      <div className="flex gap-8">
        <Step n={1} label="Fill form" active={currentStep === 0} done={currentStep > 0} />
        <Step n={2} label="Generate proof" active={currentStep === 1} done={currentStep > 1} />
        <Step n={3} label="Submit on-chain" active={currentStep === 2} done={currentStep > 2} />
      </div>

      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">01_INITIATION</p>
            <h2 className="section-heading">Membership Verification</h2>
          </div>
          <span className="material-symbols-outlined text-white/20">verified_user</span>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-4 bg-white/[0.03] border border-white/10 p-4 space-y-3">
              <p className="label">Import key file (optional)</p>
              <p className="text-[10px] font-mono text-slate-600">
                Upload the <span className="text-slate-400">{'<id>.json'}</span>{" "}
                file you received from your admin — your secret is decrypted
                locally and auto-fills the field below.
              </p>
              <input
                type="file"
                accept=".json,application/json"
                className="text-xs font-mono text-slate-400 file:mr-3 file:border file:border-white/20
                  file:bg-transparent file:text-white file:text-xs file:font-bold file:uppercase
                  file:tracking-wider file:px-3 file:py-1 file:cursor-pointer
                  hover:file:border-white hover:file:text-white cursor-pointer"
                onChange={handleKeyFileChange}
                disabled={proofStatus === "generating"}
              />
              {keyFileJson && (
                <>
                  <div className="flex gap-2">
                    <input
                      className="input font-mono text-xs py-2 flex-1"
                      type="password"
                      placeholder="Your password"
                      value={keyFilePassword}
                      onChange={(e) => setKeyFilePassword(e.target.value)}
                      disabled={proofStatus === "generating"}
                    />
                    <button
                      className="btn-ghost text-xs px-4 py-2 shrink-0"
                      onClick={handleDecryptKeyFile}
                      disabled={
                        keyImportStatus === "decrypting" ||
                        proofStatus === "generating"
                      }
                    >
                      {keyImportStatus === "decrypting"
                        ? "Decrypting…"
                        : "Decrypt"}
                    </button>
                  </div>
                  {keyImportStatus === "done" && (
                    <p className="text-xs text-green-400 font-mono">
                      ✓ Secret decrypted and filled below.
                    </p>
                  )}
                  {keyImportStatus === "error" && (
                    <p className="text-xs text-red-400 font-mono">
                      {keyImportError}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="mb-4 bg-white/[0.03] border border-white/10 p-4 space-y-3">
              <p className="label">Load from Join Org (demo)</p>
              <p className="text-[10px] font-mono text-slate-600">
                Pull members saved in this browser. This auto-fills secret,
                leaf index, and the organisation commitments list.
              </p>
              <p className="text-[10px] font-mono text-slate-500">
                Source org: {selectedOrgId}
              </p>

              <div className="flex gap-2">
                <select
                  className="input font-mono text-xs py-2 flex-1"
                  value={selectedDemoId}
                  onChange={(e) => setSelectedDemoId(e.target.value)}
                  disabled={!demoMembers.length || proofStatus === "generating"}
                >
                  {demoMembers.length === 0 && (
                    <option value="">No demo members</option>
                  )}
                  {demoMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>

                <button
                  className="btn-ghost text-xs px-4 py-2 shrink-0"
                  onClick={handleLoadDemoContext}
                  disabled={proofStatus === "generating"}
                >
                  Load Demo Context
                </button>
              </div>

              {demoLoadMessage && (
                <p className="text-[10px] font-mono text-slate-400">{demoLoadMessage}</p>
              )}
            </div>

            <label className="label">Your secret</label>
            <input
              className="input font-mono text-xs"
              placeholder="e.g. 123456789"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              disabled={proofStatus === "generating"}
            />
            <p className="mt-1 text-[10px] font-mono text-slate-600">
              commitment = Poseidon(secret)
            </p>
          </div>
          <div>
            <label className="label">Your leaf index</label>
            <input
              className="input"
              type="number"
              min={0}
              placeholder="0"
              value={leafIndex}
              onChange={(e) => setLeafIndex(e.target.value)}
              disabled={proofStatus === "generating"}
            />
            <p className="mt-1 text-[10px] font-mono text-slate-600">
              Position in the member list (0-based)
            </p>
          </div>
        </div>

        <div>
          <label className="label">Epoch (external nullifier)</label>
          <input
            className="input font-mono"
            placeholder="epoch"
            value={externalNullifier}
            onChange={(e) => setExternalNullifier(e.target.value)}
            disabled={proofStatus === "generating"}
          />
          <p className="mt-1 text-[10px] font-mono text-slate-600">
            Current epoch: {formatEpochRange(getCurrentEpoch())} — allows one submission per 24h period
          </p>
        </div>


        <div>
          <label className="label">All organisation commitments (from manifest.json)</label>
          <textarea
            className="input h-24 resize-none font-mono text-xs"
            placeholder={"Paste the \"commitments\" array from manifest.json\n(one commitment per line)"}
            value={orgSecrets}
            onChange={(e) => setOrgSecrets(e.target.value)}
            disabled={proofStatus === "generating"}
          />
          <p className="mt-1 text-[10px] font-mono text-slate-600">
            Admin shares <span className="text-slate-400">manifest.json</span>{" "}
            after generating secrets. Paste the commitment values here —
            used locally to compute your Merkle path, never sent anywhere.
          </p>
        </div>
      </section>

      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">02_EVIDENCE_PAYLOAD</p>
            <h2 className="section-heading">Report Details</h2>
          </div>
          <span className="material-symbols-outlined text-white/20">article</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="label">Report text</label>
              <textarea
                className="input h-28 resize-none text-sm"
                placeholder="Describe the wrongdoing in detail…"
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                disabled={proofStatus === "generating" || uploadStatus === "working"}
              />
            </div>
            <div>
              <label className="label">Encryption mode</label>
              <div className="input font-mono text-xs py-3 text-slate-400">
                Organization public-key encryption (no shared password)
              </div>
              <p className="mt-1 text-[10px] font-mono text-slate-600">
                Your report is encrypted in-browser with the org public key.
                Only reviewers with org private key can decrypt.
              </p>
            </div>
            <button
              className="btn-ghost text-xs px-4 py-2"
              onClick={handleEncryptAndUpload}
              disabled={
                !reportText ||
                uploadStatus === "working" || uploadStatus === "done" ||
                proofStatus === "generating"
              }
            >
              {uploadStatus === "working"
                ? "ENCRYPTING & UPLOADING…"
                : uploadStatus === "done"
                  ? "UPLOADED ✓"
                  : "ENCRYPT & UPLOAD TO IPFS"}
            </button>
            {uploadStatus === "done" && encryptedCID && (
              <p className="text-[10px] font-mono text-green-400 break-all">
                ✓ CID: {encryptedCID}
              </p>
            )}
            {uploadStatus === "error" && (
              <p className="text-[10px] font-mono text-red-400">{uploadError}</p>
            )}
          </div>
          <div>
            <label className="label">Category</label>
            <select
              className="input bg-primary"
              value={category}
              onChange={(e) => setCategory(Number(e.target.value) as 0 | 1 | 2 | 3)}
              disabled={proofStatus === "generating"}
            >
              {CATEGORIES.map((c, i) => (
                <option key={i} value={i}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {proofStatus === "generating" && (
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>CONSTRUCTING MERKLE PATH...</span>
              <span className="animate-pulse">WORKING</span>
            </div>
            <div className="w-full h-1 bg-white/10">
              <div className="h-full bg-white animate-pulse w-[78%]"></div>
            </div>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleGenerateProof}
          disabled={
            proofStatus === "generating" ||
            !secret ||
            !orgSecrets ||
            proofStatus === "ready"
          }
        >
          {proofStatus === "generating"
            ? "GENERATING ZK PROOF…"
            : proofStatus === "ready"
              ? "PROOF READY ✓"
              : "GENERATE ZK PROOF"}
        </button>

        {proofStatus !== "idle" && (
          <div className="bg-black/40 border border-white/10 p-4 font-mono text-xs">
            <p className="mb-2 text-[10px] text-slate-500 uppercase tracking-widest">Execution Log</p>
            {proofLog.map((l, i) => (
              <p
                key={i}
                className={l.includes("Error") ? "text-red-400" : "text-slate-400"}
              >
                {l}
              </p>
            ))}
            {proofStatus === "generating" && (
              <p className="mt-1 animate-pulse text-yellow-400">Working…</p>
            )}
          </div>
        )}

        {proofError && (
          <p className="bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-400">
            {proofError}
          </p>
        )}
      </section>

      {proof && (
        <section className="card space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="step-label">03_VERIFICATION</p>
              <h2 className="section-heading">Proof Summary</h2>
            </div>
            <span className="material-symbols-outlined text-white/20">verified</span>
          </div>

          <div className="space-y-2 font-mono text-xs text-slate-400">
            <p>
              <span className="text-slate-500">root:</span>{" "}
              {proof?.root.toString()}
            </p>
            <p>
              <span className="text-slate-500">nullifierHash:</span>{" "}
              {proof?.nullifierHash.toString()}
            </p>
            <p>
              <span className="text-slate-500">externalNullifier:</span>{" "}
              {proof?.externalNullifier.toString()}
            </p>
          </div>

          <div className="py-6">
            <button
              className="btn-cta"
              onClick={handleSubmit}
              disabled={submitPending || submitSuccess || !encryptedCID}
            >
              <span>
                {submitPending
                  ? "SUBMITTING…"
                  : submitSuccess
                    ? "SUBMITTED ✓"
                    : "SUBMIT TO BLOCKCHAIN"}
              </span>
              <span className="material-symbols-outlined">database</span>
            </button>
            <p className="mt-4 text-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              Warning: This action is irreversible once broadcast to the network.
            </p>
          </div>

          {submittedTxHash && (
            <div className="bg-white p-4 border-l-4 border-green-500 flex items-center gap-4">
              <div className="size-10 bg-black flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-sm">check_circle</span>
              </div>
              <div>
                <p className="text-black font-black text-xs uppercase tracking-tight leading-none mb-1">
                  Transaction {submitSuccess ? "Mined" : "Pending"}
                </p>
                <p className="text-slate-500 font-mono text-[10px] break-all">
                  HASH: {submittedTxHash}
                </p>
              </div>
            </div>
          )}
          {submitSuccess && (
            <p className="bg-green-900/30 border border-green-500/30 p-3 text-xs text-green-400">
              Report submitted successfully! The contract verified your ZK
              proof and stored the report for org {selectedOrgId}.
            </p>
          )}
          {submitError && (
            <p className="bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-400">
              {submitError}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
