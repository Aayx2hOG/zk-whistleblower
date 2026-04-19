"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Icon } from "@zk-whistleblower/ui";
import { createPublicClient, http } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { REGISTRY_ABI, REGISTRY_ADDRESS, CATEGORIES } from "@zk-whistleblower/shared/src/contracts";
import { relaySubmitReport, relaySubmitReportForOrg, relayAddRootForOrg } from "@zk-whistleblower/shared/src/relayer";
import { initPoseidon, poseidonHash } from "@zk-whistleblower/shared/src/poseidon";
import { buildMerkleTree } from "@zk-whistleblower/shared/src/merkle";
import { generateZKProof, type FormattedProof } from "@zk-whistleblower/shared/src/zkProof";
import { decryptSecret, type MemberKeyFile, type MemberManifest } from "@zk-whistleblower/shared/src/secretGen";
import { encryptReportForOrgPublicKey } from "@zk-whistleblower/shared/src/encryption";
import { uploadEncryptedReport, uploadEncryptedFile, uploadManifest } from "@zk-whistleblower/shared/src/ipfs";
import { encryptFile, type ReportManifest } from "@zk-whistleblower/shared/src/fileEncryption";

import { getCurrentEpoch, formatEpochRange } from "@zk-whistleblower/shared/src/epoch";
import { useOrg } from "@zk-whistleblower/ui";
import { getOrgPublicKeyConfig } from "@zk-whistleblower/shared/src/orgKeys";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const SUBMIT_REPORT_GAS_LIMIT = 12_000_000n;

const APP_NETWORK = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
const APP_CHAIN = APP_NETWORK === "sepolia" ? sepolia : hardhat;
const APP_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
  (APP_NETWORK === "sepolia" ? "https://rpc.sepolia.org" : "http://127.0.0.1:8545");
const appPublicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: http(APP_RPC_URL),
});

const VERIFIER_ABI = [
  {
    type: "function" as const,
    name: "verifyProof" as const,
    stateMutability: "view" as const,
    inputs: [
      { name: "_pA" as const, type: "uint256[2]" as const },
      { name: "_pB" as const, type: "uint256[2][2]" as const },
      { name: "_pC" as const, type: "uint256[2]" as const },
      { name: "_pubSignals" as const, type: "uint256[3]" as const },
    ],
    outputs: [{ type: "bool" as const }],
  },
] as const;

function WizardStep({
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
        className={`flex h-8 w-8 items-center justify-center text-xs font-black font-mono transition-all
          ${done ? "bg-green-500 text-black border-transparent" : active ? "bg-white text-black scale-110 shadow-[0_0_15px_rgba(255,255,255,0.4)]" : "border border-white/20 text-slate-500"}`}
      >
        {done ? "✓" : String(n).padStart(2, "0")}
      </div>
      <span
        className={`text-sm uppercase tracking-wider font-bold transition-colors ${done ? "text-green-400" : active ? "text-white" : "text-slate-500"}`}
      >
        {label}
      </span>
    </div>
  );
}

export default function SubmitPage() {
  const { selectedOrgId } = useOrg();

  // Step 1: Access Credentials
  const [keyFileJson, setKeyFileJson] = useState("");
  const [keyFilePassword, setKeyFilePassword] = useState("");
  const [keyFileName, setKeyFileName] = useState("");
  const [manifestFileName, setManifestFileName] = useState("");
  
  const [manifestImportStatus, setManifestImportStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [manifestImportError, setManifestImportError] = useState("");
  
  const [keyImportStatus, setKeyImportStatus] = useState<"idle" | "decrypting" | "done" | "error">("idle");
  const [keyImportError, setKeyImportError] = useState("");

  // Hidden Cryptography State
  const [secret, setSecret] = useState("");
  const [leafIndex, setLeafIndex] = useState("0");
  const [orgSecrets, setOrgSecrets] = useState("");
  const [externalNullifier, setExternalNullifier] = useState("42");

  // Step 2: Report Details
  const [category, setCategory] = useState<0 | 1 | 2 | 3>(0);
  const [reportText, setReportText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [availableLeagues, setAvailableLeagues] = useState<{ id: string; name: string }[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState(""); // league id or "" for general

  // Global Submission State
  const [submitPhase, setSubmitPhase] = useState<"idle" | "encrypting" | "anonymizing" | "sending" | "success" | "error">("idle");
  const [submitProgress, setSubmitProgress] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submittedTxHash, setSubmittedTxHash] = useState<`0x${string}` | "">("");

  useEffect(() => {
    const epoch = getCurrentEpoch();
    setExternalNullifier(epoch.toString());
  }, []);

  // Directory File (Manifest) Upload
  const handleManifestFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setManifestFileName("");
      setManifestImportStatus("idle");
      setManifestImportError("");
      return;
    }
    setManifestFileName(file.name);
    setManifestImportStatus("loading");
    setManifestImportError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = String(ev.target?.result ?? "");
        const parsed = JSON.parse(raw) as | (Partial<MemberManifest> & { type?: unknown; textCid?: unknown }) | null;
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.commitments)) {
          throw new Error('Invalid file: this is not an Organization Directory File.');
        }
        const commitments = parsed.commitments.map((value, index) => {
          const commitment = String(value).trim();
          if (!commitment) throw new Error(`Empty data found.`);
          BigInt(commitment);
          return commitment;
        });
        if (commitments.length === 0) throw new Error("File has no data.");
        setOrgSecrets(commitments.join("\n"));
        
        // Extract available leagues/roles from manifest
        if (Array.isArray(parsed.leagues) && parsed.leagues.length > 0) {
          const leagues = parsed.leagues
            .filter((l): l is { id: string; name: string } => 
              typeof l === 'object' && l !== null && typeof l.id === 'string' && typeof l.name === 'string'
            );
          setAvailableLeagues(leagues);
        } else {
          setAvailableLeagues([]);
        }
        
        // Auto leaf index resolution if key file is already loaded
        if (keyFileJson.trim()) {
          try {
            const keyFile = JSON.parse(keyFileJson) as Partial<MemberKeyFile>;
            const keyCommitment = typeof keyFile.commitment === "string" ? keyFile.commitment.trim() : "";
            if (keyCommitment) {
              const idx = commitments.findIndex((c) => c === keyCommitment);
              if (idx >= 0) setLeafIndex(String(idx));
            }
          } catch {}
        }
        setManifestImportStatus("done");
      } catch (err: unknown) {
        setManifestImportStatus("error");
        setManifestImportError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.onerror = () => {
      setManifestImportStatus("error");
      setManifestImportError("Failed to read file.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Personal Access File Upload
  const handleKeyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setKeyFileJson("");
      setKeyFileName("");
      setKeyImportStatus("idle");
      setKeyImportError("");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setKeyFileJson((ev.target?.result as string) ?? "");
    reader.readAsText(file);
    setKeyFileName(file.name);
    setKeyImportStatus("idle");
    setKeyImportError("");
    e.target.value = "";
  };

  const handleDecryptKeyFile = useCallback(async () => {
    setKeyImportError("");
    setKeyImportStatus("decrypting");
    try {
      const parsed: MemberKeyFile = JSON.parse(keyFileJson);
      if (!parsed.encrypted || !parsed.commitment) throw new Error("Invalid organization file.");
      const decrypted = await decryptSecret(parsed.encrypted, keyFilePassword);
      setSecret(decrypted.toString());
      
      // Auto leaf index resolution if manifest is loaded
      if (orgSecrets.trim()) {
        const commitments = orgSecrets.split(/\n+/).map(s => s.trim()).filter(Boolean);
        const idx = commitments.findIndex((c) => c === parsed.commitment.trim());
        if (idx >= 0) setLeafIndex(String(idx));
      }

      setKeyImportStatus("done");
    } catch (e: unknown) {
      setKeyImportError("Incorrect password or invalid file.");
      setKeyImportStatus("error");
    }
  }, [keyFileJson, keyFilePassword, orgSecrets]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files].slice(0, MAX_FILES));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const executeEncryptAndUpload = async (): Promise<string> => {
    const { keyB64, keyVersion } = getOrgPublicKeyConfig(selectedOrgId);
    setSubmitProgress("Encrypting text report locally...");
    const textBlob = await encryptReportForOrgPublicKey(reportText, selectedOrgId, keyB64, keyVersion);
    setSubmitProgress("Uploading encrypted data...");
    const textCid = await uploadEncryptedReport(textBlob);

    // Determine recipient metadata
    const recipientMeta = selectedRecipient
        ? availableLeagues.find(l => l.id === selectedRecipient) ?? undefined
        : undefined;

    if (attachedFiles.length === 0 && !recipientMeta) return textCid;

    const fileMetas: ReportManifest["files"] = [];
    for (let i = 0; i < attachedFiles.length; i++) {
        const file = attachedFiles[i];
        if (file.size > MAX_FILE_SIZE) throw new Error(`File "${file.name}" exceeds 10 MB limit`);
        setSubmitProgress(`Encrypting file ${i + 1}/${attachedFiles.length}: ${file.name}...`);
        const encryptedFile = await encryptFile(file, keyB64, selectedOrgId, keyVersion);
        setSubmitProgress(`Uploading file ${i + 1}/${attachedFiles.length}...`);
        const fileCid = await uploadEncryptedFile(encryptedFile);
        fileMetas.push({ cid: fileCid, filename: file.name, mimeType: file.type || "application/octet-stream", originalSize: file.size });
    }
    
    setSubmitProgress("Generating data manifest...");
    const manifest: ReportManifest = {
        v: 1,
        type: "manifest",
        textCid,
        files: fileMetas,
        createdAt: new Date().toISOString(),
        ...(recipientMeta && { recipient: recipientMeta }),
    };
    return await uploadManifest(manifest);
  };

  const executeGenerateProof = async (): Promise<FormattedProof> => {
    setSubmitProgress("Running cryptographic algorithms...");
    await initPoseidon();
    const secretBig = BigInt(secret.trim());
    const leafIdx = parseInt(leafIndex, 10);
    const extNull = BigInt(externalNullifier.trim() || "42");
    const commitments = orgSecrets.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(s => BigInt(s));
    
    // === DIAGNOSTIC LOGGING ===
    const computedCommitment = poseidonHash([secretBig]);
    console.log("[ZK-Debug] Secret (first 20 chars):", secretBig.toString().slice(0, 20));
    console.log("[ZK-Debug] Computed commitment from secret:", computedCommitment.toString());
    console.log("[ZK-Debug] Leaf index:", leafIdx);
    console.log("[ZK-Debug] Commitments count:", commitments.length);
    console.log("[ZK-Debug] Commitment at leafIdx", leafIdx, ":", commitments[leafIdx]?.toString());
    console.log("[ZK-Debug] Match?", commitments[leafIdx] === computedCommitment);
    if (commitments[leafIdx] !== computedCommitment) {
      // Try to find the actual index
      const actualIdx = commitments.findIndex(c => c === computedCommitment);
      console.error("[ZK-Debug] ❌ MISMATCH! Commitment NOT at leafIdx", leafIdx, ". Actual index:", actualIdx);
      if (actualIdx >= 0) {
        console.log("[ZK-Debug] Auto-correcting leafIndex from", leafIdx, "to", actualIdx);
        // Auto-correct the leaf index
        return await (async () => {
          setSubmitProgress("Constructing secure path...");
          const tree = buildMerkleTree(commitments);
          console.log("[ZK-Debug] Tree root:", tree.root.toString().slice(0, 30) + "...");
          setSubmitProgress("Generating Zero-Knowledge Proof (this keeps you anonymous)...");
          return await generateZKProof({ root: tree.root, secret: secretBig, leafIndex: actualIdx, externalNullifier: extNull, tree });
        })();
      } else {
        console.error("[ZK-Debug] ❌ Computed commitment NOT FOUND in any position in the commitments list!");
        console.error("[ZK-Debug] This means your key file does NOT belong to this organization's manifest.");
        // Log all commitments for comparison
        commitments.forEach((c, i) => console.log(`[ZK-Debug] commitment[${i}]:`, c.toString()));
      }
    }
    // === END DIAGNOSTIC ===
    
    setSubmitProgress("Constructing secure path...");
    const tree = buildMerkleTree(commitments);
    console.log("[ZK-Debug] Tree root:", tree.root.toString().slice(0, 30) + "...");
    
    setSubmitProgress("Generating Zero-Knowledge Proof (this keeps you anonymous)...");
    return await generateZKProof({ root: tree.root, secret: secretBig, leafIndex: leafIdx, externalNullifier: extNull, tree });
  };

  const isMissingFunctionError = (msg: string): boolean => {
    return msg.includes('returned no data ("0x")') || msg.includes("does not have the function") || msg.includes("address is not a contract");
  };

  const mapContractError = (msg: string): string => {
    if (msg.includes("UnknownMerkleRoot")) return "Your directory file is out of date. Ask the admin for the latest Organization Directory File.";
    if (msg.includes("NullifierAlreadyUsed")) return "You have already submitted a report today. Please wait for the next 24h window.";
    if (msg.includes("InvalidZKProof")) return "Your proof could not be verified. Please check that your key file and directory file belong to the same organization, and try again.";
    if (msg.includes("Failed to fetch") || msg.includes("HTTP request failed")) return "Could not connect to network. Ensure you have internet access and the relayer is running.";
    if (msg.includes("exceeds transaction gas cap") || msg.includes("Transaction gas limit")) return "Transaction gas limit exceeded. Try again.";
    if (msg.includes("Internal error")) return "Blockchain node returned an internal error. Verify your files are correct and try again.";
    if (msg.includes('returned no data ("0x")') || msg.includes("does not have the function") || msg.includes("address is not a contract")) return "Contract configuration mismatch. Please contact the administrator.";
    return `Something went wrong: ${msg.slice(0, 200)}`;
  };

  const executeSubmitToChain = async (proof: FormattedProof, cidHex: `0x${string}`) => {
    setSubmitProgress("Verifying access permissions...");
    
    let supportsOrgApis = true;
    let rootActive = false;
    try {
        rootActive = await appPublicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "orgRoots", args: [BigInt(selectedOrgId), proof.root] });
    } catch (e: unknown) {
        if (!isMissingFunctionError(String(e))) throw e;
        supportsOrgApis = false;
        rootActive = await appPublicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "roots", args: [proof.root] });
    }

    if (!rootActive) {
        setSubmitProgress("Syncing organization directory with network...");
        try {
            await relayAddRootForOrg(selectedOrgId, proof.root.toString());
            // Re-verify the root was actually registered
            if (supportsOrgApis) {
                rootActive = await appPublicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "orgRoots", args: [BigInt(selectedOrgId), proof.root] });
            } else {
                rootActive = await appPublicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "roots", args: [proof.root] });
            }
            if (!rootActive) throw new Error("Auto-registration succeeded but root not confirmed. Check relayer.");
        } catch (regErr) {
            if (!String(regErr).includes("RootAlreadyExists")) {
                throw new Error("Failed to sync your organization access list. Relayer might be offline.");
            }
        }
    }

    // Pre-check: nullifier already used?
    setSubmitProgress("Checking submission eligibility...");
    let nullifierUsed = false;
    if (supportsOrgApis) {
        try {
            nullifierUsed = await appPublicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "orgUsedNullifiers", args: [BigInt(selectedOrgId), proof.nullifierHash] });
        } catch (e: unknown) {
            if (!isMissingFunctionError(String(e))) throw e;
            supportsOrgApis = false;
        }
    }
    if (!supportsOrgApis) {
        nullifierUsed = await appPublicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "usedNullifiers", args: [proof.nullifierHash] });
    }
    if (nullifierUsed) throw new Error("NullifierAlreadyUsed");

    // Pre-check: does the verifier accept this proof?
    setSubmitProgress("Running proof verification...");
    const verifierAddress = await appPublicClient.readContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "verifier" });
    const verifierAcceptsProof = await appPublicClient.readContract({
        address: verifierAddress,
        abi: VERIFIER_ABI,
        functionName: "verifyProof",
        args: [proof.pA, proof.pB, proof.pC, [proof.root, proof.nullifierHash, proof.externalNullifier]],
    });
    if (!verifierAcceptsProof) {
        throw new Error("InvalidZKProof — proof rejected by on-chain verifier. Your key file or directory file may be mismatched.");
    }

    // Simulate full contract call
    setSubmitProgress("Simulating transaction...");
    let txHash: `0x${string}`;
    if (supportsOrgApis) {
        const args = [BigInt(selectedOrgId), proof.pA, proof.pB, proof.pC, proof.root, proof.nullifierHash, proof.externalNullifier, cidHex, category] as const;
        await appPublicClient.simulateContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "submitReportForOrg", args, gas: SUBMIT_REPORT_GAS_LIMIT });
        setSubmitProgress("Dispatching transaction to relay...");
        const res = await relaySubmitReportForOrg({ orgId: String(selectedOrgId), pA: [proof.pA[0].toString(), proof.pA[1].toString()], pB: [[proof.pB[0][0].toString(), proof.pB[0][1].toString()], [proof.pB[1][0].toString(), proof.pB[1][1].toString()]], pC: [proof.pC[0].toString(), proof.pC[1].toString()], root: proof.root.toString(), nullifierHash: proof.nullifierHash.toString(), externalNullifier: proof.externalNullifier.toString(), encryptedCIDHex: cidHex, category });
        txHash = res.txHash;
    } else {
        const args = [proof.pA, proof.pB, proof.pC, proof.root, proof.nullifierHash, proof.externalNullifier, cidHex, category] as const;
        await appPublicClient.simulateContract({ address: REGISTRY_ADDRESS, abi: REGISTRY_ABI, functionName: "submitReport", args, gas: SUBMIT_REPORT_GAS_LIMIT });
        setSubmitProgress("Dispatching transaction to relay...");
        const res = await relaySubmitReport({ pA: [proof.pA[0].toString(), proof.pA[1].toString()], pB: [[proof.pB[0][0].toString(), proof.pB[0][1].toString()], [proof.pB[1][0].toString(), proof.pB[1][1].toString()]], pC: [proof.pC[0].toString(), proof.pC[1].toString()], root: proof.root.toString(), nullifierHash: proof.nullifierHash.toString(), externalNullifier: proof.externalNullifier.toString(), encryptedCIDHex: cidHex, category });
        txHash = res.txHash;
    }

    setSubmitProgress("Transaction pending...");
    setSubmittedTxHash(txHash);
    await appPublicClient.waitForTransactionReceipt({ hash: txHash });
    setSubmitProgress("Transaction confirmed!");
  };

  const handleFullSubmit = async () => {
    setSubmitError("");
    setSubmitPhase("encrypting");
    
    try {
        // Log proof inputs for debugging
        console.log("[ZK-Submit] secret length:", secret.length, "leafIndex:", leafIndex, "orgSecrets lines:", orgSecrets.split(/\n+/).filter(Boolean).length, "epoch:", externalNullifier);
        
        const cid = await executeEncryptAndUpload();
        const cidHex = `0x${Array.from(new TextEncoder().encode(cid)).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
        
        setSubmitPhase("anonymizing");
        const proof = await executeGenerateProof();
        console.log("[ZK-Submit] Proof generated. root:", proof.root.toString().slice(0, 20) + "...", "nullifier:", proof.nullifierHash.toString().slice(0, 20) + "...");
        
        setSubmitPhase("sending");
        await executeSubmitToChain(proof, cidHex);
        
        setSubmitPhase("success");
    } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e);
        console.error("[ZK-Submit] Raw submission error:", raw);
        setSubmitError(mapContractError(raw));
        setSubmitPhase("error");
    }
  };

  const isAccessVerified = manifestImportStatus === "done" && keyImportStatus === "done";
  const isSubmissionInProgress = ["encrypting", "anonymizing", "sending"].includes(submitPhase);
  const currentStepNum = submitPhase === "success" ? 4 : isSubmissionInProgress ? 3 : isAccessVerified ? 2 : 1;

  return (
    <div className="space-y-12 pb-24 max-w-2xl mx-auto">
      <div className="mb-10 text-center space-y-4">
        <h1 className="text-white text-5xl font-black leading-none tracking-tighter uppercase italic drop-shadow-lg">
          Secure Disclosure
        </h1>
        <p className="text-slate-400 text-sm font-mono max-w-md mx-auto leading-relaxed">
          Report wrongdoing to <strong className="text-white">Organization {selectedOrgId}</strong> with absolute anonymity. Your identity is cryptographically hidden and mathematically impossible to trace.
        </p>
      </div>

      <div className="flex justify-center gap-10 mb-10 pb-6 border-b border-white/10">
        <WizardStep n={1} label="Identity" active={currentStepNum === 1} done={currentStepNum > 1} />
        <WizardStep n={2} label="Report" active={currentStepNum === 2} done={currentStepNum > 2} />
        <WizardStep n={3} label="Submit" active={currentStepNum === 3} done={currentStepNum > 3} />
      </div>

      {/* STEP 1: ACCESS */}
      <section className={`transition-opacity duration-500 card space-y-6 ${currentStepNum === 1 ? 'opacity-100 ring-1 ring-white/20' : 'opacity-40 grayscale pointer-events-none'}`}>
        <div>
           <h2 className="text-xl font-bold text-white mb-1 uppercase tracking-tight">Step 1: Authorization</h2>
           <p className="text-xs font-mono text-slate-500">Provide the access files given to you by your administrator to verify your membership anonymously.</p>
        </div>
        
        <div className="space-y-4">
            <div className="bg-black/30 border border-white/5 p-5 rounded-lg space-y-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-white mb-1">Personal Access File</h3>
                        <p className="text-[10px] font-mono text-slate-400">Required: <code className="bg-white/10 px-1 py-0.5 rounded">{'<your-id>.json'}</code></p>
                    </div>
                    {keyImportStatus === "done" && <Icon name="check_circle" className="text-green-500 text-2xl" />}
                </div>
                
                <div className="flex items-center gap-3">
                    <label className="btn-ghost text-xs px-4 py-2 cursor-pointer border-white/20 hover:border-white/40">
                        {keyFileName ? "Change File" : "Upload Access File"}
                        <input type="file" accept=".json,application/json" className="hidden" onChange={handleKeyFileChange} />
                    </label>
                    <span className="text-[10px] font-mono text-slate-500 truncate max-w-[150px]">{keyFileName}</span>
                </div>
                
                {keyFileJson && keyImportStatus !== "done" && (
                    <div className="flex gap-2 w-full pt-2">
                        <input className="input flex-1 text-xs px-3 h-8 bg-white/5 focus:bg-white/10" type="password" placeholder="Access password" value={keyFilePassword} onChange={(e) => setKeyFilePassword(e.target.value)} />
                        <button className="btn-primary text-xs px-4 h-8 shrink-0 flex items-center justify-center" onClick={handleDecryptKeyFile}>Unlock</button>
                    </div>
                )}
                {keyImportError && <p className="text-[10px] text-red-400 font-mono">{keyImportError}</p>}
            </div>

            <div className="bg-black/30 border border-white/5 p-5 rounded-lg space-y-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-white mb-1">Organization Directory File</h3>
                        <p className="text-[10px] font-mono text-slate-400">Required: <code className="bg-white/10 px-1 py-0.5 rounded">manifest.json</code></p>
                    </div>
                    {manifestImportStatus === "done" && <Icon name="check_circle" className="text-green-500 text-2xl" />}
                </div>
                
                <div className="flex items-center gap-3">
                    <label className="btn-ghost text-xs px-4 py-2 cursor-pointer border-white/20 hover:border-white/40">
                        {manifestFileName ? "Change File" : "Upload Directory File"}
                        <input type="file" accept=".json,application/json" className="hidden" onChange={handleManifestFileChange} />
                    </label>
                    <span className="text-[10px] font-mono text-slate-500 truncate max-w-[150px]">{manifestFileName}</span>
                </div>
                {manifestImportError && <p className="text-[10px] text-red-400 font-mono">{manifestImportError}</p>}
            </div>
        </div>

        {isAccessVerified && currentStepNum === 1 && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center animate-in fade-in slide-in-from-bottom-2">
                <p className="text-green-400 text-sm font-bold uppercase tracking-widest mb-1">Authorization Successful</p>
                <p className="text-[10px] font-mono text-green-400/70">Your identity context is ready. Move down to write your report.</p>
            </div>
        )}
      </section>

      {/* STEP 2: REPORT */}
      {isAccessVerified && (
      <section className={`transition-all duration-700 card space-y-6 ${currentStepNum >= 2 ? 'opacity-100 ring-1 ring-white/20 transform-none' : 'opacity-0 translate-y-8 hidden'}`}>
        <div>
           <h2 className="text-xl font-bold text-white mb-1 uppercase tracking-tight">Step 2: Incident Details</h2>
           <p className="text-xs font-mono text-slate-500">All data entered here is strictly encrypted before leaving your device.</p>
        </div>

        <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Category of Concern</label>
                    <select className="input bg-primary text-sm w-full py-3" value={category} onChange={(e) => setCategory(Number(e.target.value) as 0|1|2|3)}>
                      {CATEGORIES.map((c, i) => <option key={i} value={i}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Send Report To</label>
                    <select 
                        className="input bg-primary text-sm w-full py-3" 
                        value={selectedRecipient} 
                        onChange={(e) => setSelectedRecipient(e.target.value)}
                    >
                        <option value="">All Administrators (General)</option>
                        {availableLeagues.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </select>
                    <p className="mt-1 text-[9px] font-mono text-slate-600">
                        {availableLeagues.length > 0
                            ? "Choose which team should receive this report"
                            : "No specific departments configured — report goes to all admins"}
                    </p>
                </div>
            </div>
            
            <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Detailed Report</label>
                <textarea className="input h-40 resize-none text-sm w-full leading-relaxed" placeholder="Please describe the incident in as much detail as possible..." value={reportText} onChange={(e) => setReportText(e.target.value)} />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 block">Supporting Evidence</label>
              <div className="border border-dashed border-white/20 bg-white/5 hover:bg-white/10 transition-colors p-6 rounded-lg text-center cursor-pointer" onClick={() => { if(attachedFiles.length < MAX_FILES) fileInputRef.current?.click(); }}>
                 <Icon name="cloud_upload" className="text-4xl text-slate-400 mb-3 mx-auto block" />
                 <p className="text-sm text-white font-bold">{attachedFiles.length >= MAX_FILES ? "Limit Reached" : "Click to attach files"}</p>
                 <p className="text-[10px] font-mono text-slate-500 mt-1">Up to {MAX_FILES} files (Max {MAX_FILE_SIZE / 1024 / 1024}MB each)</p>
              </div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
              
              {attachedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-black/40 px-3 py-2 border border-white/5 rounded">
                       <span className="text-xs font-mono text-slate-300 truncate pr-4">{f.name}</span>
                       <button onClick={() => handleRemoveFile(i)} className="text-red-400 hover:text-white px-2 text-lg leading-none">&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>

        {submitPhase === "error" && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-red-400 text-sm font-bold uppercase mb-1 flex items-center gap-2"><Icon name="error" /> Submission Failed</p>
                <p className="text-[10px] font-mono text-red-300">{submitError}</p>
                <button className="mt-3 btn-ghost text-xs px-4 py-1" onClick={() => setSubmitPhase("idle")}>Dismiss & Try Again</button>
            </div>
        )}

        {submitPhase === "idle" && (
            <button className="btn-cta w-full py-4 text-sm tracking-widest" onClick={handleFullSubmit} disabled={!reportText.trim()}>
                SUBMIT SECURELY <Icon name="lock" className="ml-2 text-lg" />
            </button>
        )}

        {isSubmissionInProgress && (
            <div className="p-6 bg-blue-900/10 border border-blue-500/30 rounded-xl relative overflow-hidden text-center space-y-4">
                <div className="absolute inset-0 w-full h-full bg-blue-500/5 animate-pulse" />
                <Icon name="verified_user" className="text-4xl text-blue-400 mx-auto animate-bounce" />
                <div>
                   <p className="text-blue-400 text-sm font-bold uppercase tracking-widest mb-1">{submitPhase === "encrypting" ? "Encrypting Evidence" : submitPhase === "anonymizing" ? "Generating Anonymity Proof" : "Broadcasting Securely"}</p>
                   <p className="text-[10px] font-mono text-blue-300">{submitProgress}</p>
                </div>
            </div>
        )}

        {submitPhase === "success" && (
            <div className="p-6 bg-green-500/10 border border-green-500/30 rounded-xl text-center space-y-4 animate-in zoom-in">
                <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/50">
                    <Icon name="check_circle" className="text-3xl text-green-400" />
                </div>
                <div>
                   <h3 className="text-green-400 text-lg font-black uppercase tracking-widest mb-2">Report Successfully Submitted</h3>
                   <p className="text-xs font-mono text-slate-300 leading-relaxed max-w-sm mx-auto">
                       Your evidence has been securely encrypted and irrevocably stored on the blockchain without any metadata linking it to you.
                   </p>
                   {selectedRecipient && (() => {
                       const league = availableLeagues.find(l => l.id === selectedRecipient);
                       return league ? (
                           <p className="text-xs font-mono text-purple-400 mt-2">
                               Directed to: <strong>{league.name}</strong>
                           </p>
                       ) : null;
                   })()}
                </div>
                {submittedTxHash && (
                    <div className="mt-4 p-3 bg-black/40 rounded border border-white/5 inline-block text-left">
                        <p className="text-[9px] text-slate-500 uppercase mb-1">Transaction Hash</p>
                        <p className="text-[10px] font-mono text-slate-400 select-all">{submittedTxHash}</p>
                    </div>
                )}
                <div className="pt-4">
                    <button className="btn-ghost text-xs px-6 py-2" onClick={() => window.location.reload()}>Submit Another Report</button>
                </div>
            </div>
        )}
      </section>
      )}

    </div>
  );
}
