"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Icon } from "@zk-whistleblower/ui";
import {
} from "wagmi";
import { createPublicClient, http } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { REGISTRY_ABI, REGISTRY_ADDRESS, CATEGORIES } from "@zk-whistleblower/shared/src/contracts";
import { relaySubmitReport, relaySubmitReportForOrg, relayAddRootForOrg } from "@zk-whistleblower/shared/src/relayer";
import { initPoseidon } from "@zk-whistleblower/shared/src/poseidon";
import { buildMerkleTree } from "@zk-whistleblower/shared/src/merkle";
import { generateZKProof, type FormattedProof } from "@zk-whistleblower/shared/src/zkProof";
import { decryptSecret, type MemberKeyFile, type MemberManifest } from "@zk-whistleblower/shared/src/secretGen";
import { encryptReportForOrgPublicKey } from "@zk-whistleblower/shared/src/encryption";
import { uploadEncryptedReport, uploadEncryptedFile, uploadManifest } from "@zk-whistleblower/shared/src/ipfs";
import { encryptFile, type ReportManifest } from "@zk-whistleblower/shared/src/fileEncryption";
import { getDemoMembers, type DemoMember } from "@zk-whistleblower/shared/src/demoOrg";
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
  const [keyFileName, setKeyFileName] = useState("");
  const [manifestFileName, setManifestFileName] = useState("");
  const [manifestImportStatus, setManifestImportStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [manifestImportMessage, setManifestImportMessage] = useState("");
  const [manifestImportError, setManifestImportError] = useState("");
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
  const [epochRangeLabel, setEpochRangeLabel] = useState("");
  const [encryptedCID, setEncryptedCID] = useState("");
  const [category, setCategory] = useState<0 | 1 | 2 | 3>(0);

  const [reportText, setReportText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const epoch = getCurrentEpoch();
    setExternalNullifier(epoch.toString());
    setEpochRangeLabel(formatEpochRange(epoch));
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

  const handleManifestFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setManifestFileName("");
      setManifestImportStatus("idle");
      setManifestImportMessage("");
      setManifestImportError("");
      return;
    }

    setManifestFileName(file.name);
    setManifestImportStatus("loading");
    setManifestImportMessage("");
    setManifestImportError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = String(ev.target?.result ?? "");
        const parsed = JSON.parse(raw) as
          | (Partial<MemberManifest> & { type?: unknown; textCid?: unknown })
          | null;

        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.commitments)) {
          if (parsed && parsed.type === "manifest" && typeof parsed.textCid === "string") {
            throw new Error(
              "This is a report payload manifest. Upload the membership manifest from admin (it includes a commitments array)."
            );
          }
          throw new Error('Invalid membership manifest: missing "commitments" array.');
        }

        const commitments = parsed.commitments.map((value, index) => {
          const commitment = String(value).trim();
          if (!commitment) {
            throw new Error(`Commitment at index ${index} is empty.`);
          }
          BigInt(commitment);
          return commitment;
        });

        if (commitments.length === 0) {
          throw new Error("Membership manifest has no commitments.");
        }

        setOrgSecrets(commitments.join("\n"));

        let autoLeafSuffix = "";
        if (keyFileJson.trim()) {
          try {
            const keyFile = JSON.parse(keyFileJson) as Partial<MemberKeyFile>;
            const keyCommitment = typeof keyFile.commitment === "string" ? keyFile.commitment.trim() : "";
            if (keyCommitment) {
              const idx = commitments.findIndex((c) => c === keyCommitment);
              if (idx >= 0) {
                setLeafIndex(String(idx));
                autoLeafSuffix = ` Leaf index auto-set to ${idx}.`;
              }
            }
          } catch {
            // Key file parse issues are handled in key import flow; ignore here.
          }
        }

        setManifestImportStatus("done");
        setManifestImportError("");
        setManifestImportMessage(`Loaded ${commitments.length} commitments from manifest.${autoLeafSuffix}`);
      } catch (err: unknown) {
        setManifestImportStatus("error");
        setManifestImportMessage("");
        setManifestImportError(err instanceof Error ? err.message : String(err));
      }
    };

    reader.onerror = () => {
      setManifestImportStatus("error");
      setManifestImportMessage("");
      setManifestImportError("Failed to read manifest file.");
    };

    reader.readAsText(file);
    e.target.value = "";
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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => {
      const combined = [...prev, ...files].slice(0, MAX_FILES);
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleEncryptAndUpload = useCallback(async () => {
    setUploadError("");
    setUploadProgress("");
    setUploadStatus("working");
    try {
      const { keyB64, keyVersion } = getOrgPublicKeyConfig(selectedOrgId);

      // 1. Encrypt and upload the text report
      setUploadProgress("Encrypting text report…");
      const textBlob = await encryptReportForOrgPublicKey(reportText, selectedOrgId, keyB64, keyVersion);
      setUploadProgress("Uploading text report to IPFS…");
      const textCid = await uploadEncryptedReport(textBlob);

      if (attachedFiles.length === 0) {
        // No files — store text CID directly (backwards compatible)
        setEncryptedCID(textCid);
        setUploadStatus("done");
        return;
      }

      // 2. Encrypt and upload each file
      const fileMetas: ReportManifest["files"] = [];
      for (let i = 0; i < attachedFiles.length; i++) {
        const file = attachedFiles[i];
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`File "${file.name}" exceeds 10 MB limit`);
        }
        setUploadProgress(`Encrypting file ${i + 1}/${attachedFiles.length}: ${file.name}…`);
        const encryptedFile = await encryptFile(file, keyB64, selectedOrgId, keyVersion);
        setUploadProgress(`Uploading file ${i + 1}/${attachedFiles.length}: ${file.name}…`);
        const fileCid = await uploadEncryptedFile(encryptedFile);
        fileMetas.push({
          cid: fileCid,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          originalSize: file.size,
        });
      }

      // 3. Create and upload manifest
      setUploadProgress("Uploading report manifest…");
      const manifest: ReportManifest = {
        v: 1,
        type: "manifest",
        textCid,
        files: fileMetas,
        createdAt: new Date().toISOString(),
      };
      const manifestCid = await uploadManifest(manifest);

      setEncryptedCID(manifestCid);
      setUploadStatus("done");
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : String(e));
      setUploadStatus("error");
    }
  }, [reportText, selectedOrgId, attachedFiles]);

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
      return "Merkle root is not recognized on-chain. Auto-registration may have failed — check relayer logs and retry.";
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
      return "RPC connection failed. Set NEXT_PUBLIC_NETWORK_NAME and NEXT_PUBLIC_RPC_URL in apps/reporter/.env.local (for local: localhost + http://127.0.0.1:8545), then restart the reporter app.";
    }
    if (
      msg.includes('returned no data ("0x")') ||
      msg.includes("does not have the function") ||
      msg.includes("address is not a contract")
    ) {
      return "Registry/API mismatch for current RPC network. Ensure NEXT_PUBLIC_NETWORK_NAME, NEXT_PUBLIC_RPC_URL, and NEXT_PUBLIC_REGISTRY_ADDRESS point to the same deployment, then restart reporter.";
    }
    return msg;
  };

  const isMissingFunctionError = (msg: string): boolean => {
    return (
      msg.includes('returned no data ("0x")') ||
      msg.includes("does not have the function") ||
      msg.includes("address is not a contract")
    );
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
    const submitForOrgArgs = [
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
    const legacySubmitArgs = [
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
      let supportsOrgApis = true;
      let rootActive = false;
      try {
        rootActive = await appPublicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "orgRoots",
          args: [BigInt(selectedOrgId), proof.root],
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!isMissingFunctionError(msg)) throw e;
        supportsOrgApis = false;
        rootActive = await appPublicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "roots",
          args: [proof.root],
        });
      }

      if (!rootActive) {
        // Auto-register the root on-chain via the relayer instead of failing.
        // The relayer wallet has SUPER_ADMIN_ROLE, so it can call addRootForOrg.
        // This eliminates the need for manual admin intervention.
        try {
          await relayAddRootForOrg(selectedOrgId, proof.root.toString());

          // Verify the root was actually registered
          if (supportsOrgApis) {
            rootActive = await appPublicClient.readContract({
              address: REGISTRY_ADDRESS,
              abi: REGISTRY_ABI,
              functionName: "orgRoots",
              args: [BigInt(selectedOrgId), proof.root],
            });
          } else {
            rootActive = await appPublicClient.readContract({
              address: REGISTRY_ADDRESS,
              abi: REGISTRY_ABI,
              functionName: "roots",
              args: [proof.root],
            });
          }

          if (!rootActive) {
            setSubmitError("Auto-registered root but it didn't take effect. Check relayer logs.");
            return;
          }
        } catch (regErr: unknown) {
          const regMsg = regErr instanceof Error ? regErr.message : String(regErr);
          if (regMsg.includes("RootAlreadyExists")) {
            // Race condition: root was registered between our check and the relay call — fine, proceed.
          } else if (regMsg.includes("Failed to fetch") || regMsg.includes("fetch")) {
            setSubmitError(
              "Cannot reach the relayer API (/api/relay). Make sure the reporter dev server is running (pnpm dev:reporter)."
            );
            return;
          } else {
            setSubmitError(
              `Failed to auto-register root: ${regMsg}. ` +
              `Ensure the relayer wallet has admin permissions on the contract.`
            );
            return;
          }
        }
      }

      let nullifierUsed = false;
      if (supportsOrgApis) {
        try {
          nullifierUsed = await appPublicClient.readContract({
            address: REGISTRY_ADDRESS,
            abi: REGISTRY_ABI,
            functionName: "orgUsedNullifiers",
            args: [BigInt(selectedOrgId), proof.nullifierHash],
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!isMissingFunctionError(msg)) throw e;
          supportsOrgApis = false;
        }
      }
      if (!supportsOrgApis) {
        nullifierUsed = await appPublicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "usedNullifiers",
          args: [proof.nullifierHash],
        });
      }

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
      let txHash: `0x${string}`;
      if (supportsOrgApis) {
        await appPublicClient.simulateContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "submitReportForOrg",
          args: submitForOrgArgs,
        });

        const res = await relaySubmitReportForOrg({
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
        txHash = res.txHash;
      } else {
        await appPublicClient.simulateContract({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "submitReport",
          args: legacySubmitArgs,
        });

        const res = await relaySubmitReport({
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
        txHash = res.txHash;
      }

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
          <Icon name="verified_user" className="text-white/20 text-2xl" />
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
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="member-key-upload"
                  className={`inline-flex items-center gap-2 border px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    proofStatus === "generating"
                      ? "cursor-not-allowed border-white/10 text-slate-600"
                      : "cursor-pointer border-white/25 text-slate-300 hover:border-white hover:text-white"
                  }`}
                >
                  {keyFileName ? "Replace key file" : "Choose key file"}
                </label>
                <p className="min-w-0 flex-1 truncate text-[10px] font-mono text-slate-500">
                  {keyFileName || "No file selected"}
                </p>
              </div>
              <input
                id="member-key-upload"
                type="file"
                accept=".json,application/json"
                className="sr-only"
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
            Current epoch: {epochRangeLabel || "loading..."} — allows one submission per 24h period
          </p>
        </div>


        <div>
          <label className="label">Organisation commitments</label>
          <div className="mb-3 bg-white/[0.03] border border-white/10 p-4 space-y-3">
            <p className="label">Import membership manifest (recommended)</p>
            <p className="text-[10px] font-mono text-slate-600">
              Upload admin-generated <span className="text-slate-400">manifest.json</span> to auto-fill commitments.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="membership-manifest-upload"
                className={`inline-flex items-center gap-2 border px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  proofStatus === "generating"
                    ? "cursor-not-allowed border-white/10 text-slate-600"
                    : "cursor-pointer border-white/25 text-slate-300 hover:border-white hover:text-white"
                }`}
              >
                {manifestFileName ? "Replace manifest" : "Choose manifest.json"}
              </label>
              <p className="min-w-0 flex-1 truncate text-[10px] font-mono text-slate-500">
                {manifestFileName || "No file selected"}
              </p>
            </div>
            <input
              id="membership-manifest-upload"
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={handleManifestFileChange}
              disabled={proofStatus === "generating"}
            />
            {manifestImportStatus === "loading" && (
              <p className="text-xs text-yellow-400 font-mono">Parsing manifest...</p>
            )}
            {manifestImportStatus === "done" && manifestImportMessage && (
              <p className="text-xs text-green-400 font-mono">{manifestImportMessage}</p>
            )}
            {manifestImportStatus === "error" && (
              <p className="text-xs text-red-400 font-mono">{manifestImportError}</p>
            )}
          </div>
          <p className="mt-1 text-[10px] font-mono text-slate-600">
            {orgSecrets.trim()
              ? `Loaded ${orgSecrets
                  .split(/\n+/)
                  .map((s) => s.trim())
                  .filter(Boolean).length} commitments for local proof generation.`
              : "No commitments loaded yet. Upload membership manifest.json or use Load Demo Context."}
          </p>
        </div>
      </section>

      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">02_EVIDENCE_PAYLOAD</p>
            <h2 className="section-heading">Report Details</h2>
          </div>
          <Icon name="article" className="text-white/20 text-2xl" />
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

            {/* File attachments */}
            <div>
              <label className="label">Evidence files (optional)</label>
              <div
                className={`group border border-dashed p-4 transition-colors ${
                  attachedFiles.length >= MAX_FILES
                    ? "cursor-not-allowed border-white/10 bg-white/[0.01]"
                    : "cursor-pointer border-white/20 bg-white/[0.02] hover:border-white/50 hover:bg-white/[0.04]"
                }`}
                onClick={() => {
                  if (
                    attachedFiles.length < MAX_FILES &&
                    proofStatus !== "generating" &&
                    uploadStatus !== "working"
                  ) {
                    fileInputRef.current?.click();
                  }
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    {attachedFiles.length >= MAX_FILES ? "Attachment limit reached" : "Upload evidence files"}
                  </p>
                  <span className="border border-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-300 transition-colors group-hover:border-white group-hover:text-white">
                    Browse
                  </span>
                </div>
                <p className="text-[10px] font-mono text-slate-500">
                  Max {MAX_FILES} files, 10MB each.
                </p>
                <p className="mt-1 text-[10px] font-mono text-slate-600">
                  Documents, images, audio - all encrypted in-browser before upload
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={proofStatus === "generating" || uploadStatus === "working" || attachedFiles.length >= MAX_FILES}
              />
            </div>

            {attachedFiles.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  Attached ({attachedFiles.length}/{MAX_FILES})
                </p>
                {attachedFiles.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2">
                    <Icon name="description" className="text-white/30 text-sm shrink-0" />
                    <span className="text-xs font-mono text-slate-300 truncate flex-1">{file.name}</span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      className="text-red-400 hover:text-red-300 text-xs font-bold shrink-0"
                      onClick={() => handleRemoveFile(i)}
                      disabled={uploadStatus === "working"}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="label">Encryption mode</label>
              <div className="input font-mono text-xs py-3 text-slate-400">
                Organization public-key encryption (no shared password)
              </div>
              <p className="mt-1 text-[10px] font-mono text-slate-600">
                Your report and files are encrypted in-browser with the org public key.
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
                  : attachedFiles.length > 0
                    ? `ENCRYPT & UPLOAD (${attachedFiles.length + 1} items)`
                    : "ENCRYPT & UPLOAD TO IPFS"}
            </button>
            {uploadStatus === "working" && uploadProgress && (
              <p className="text-[10px] font-mono text-yellow-400 animate-pulse">{uploadProgress}</p>
            )}
            {uploadStatus === "done" && encryptedCID && (
              <p className="text-[10px] font-mono text-green-400 break-all">
                ✓ CID: {encryptedCID}
                {attachedFiles.length > 0 && " (manifest with text + files)"}
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
            <Icon name="verified" className="text-white/20 text-2xl" />
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
              <Icon name="database" className="text-2xl" />
            </button>
            <p className="mt-4 text-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              Warning: This action is irreversible once broadcast to the network.
            </p>
          </div>

          {submittedTxHash && (
            <div className="bg-white p-4 border-l-4 border-green-500 flex items-center gap-4">
              <div className="size-10 bg-black flex items-center justify-center">
                <Icon name="check_circle" className="text-white text-sm" />
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
