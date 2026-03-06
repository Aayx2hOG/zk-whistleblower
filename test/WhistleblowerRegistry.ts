import { expect } from "chai";
import { network } from "hardhat";
import {
    initPoseidon,
    poseidonHash,
    buildMerkleTree,
    generateProof,
    formatProofForContract,
} from "./fixtures/setup.js";

const { ethers } = await network.connect();

describe("WhistleblowerRegistry", function () {
    let verifier: any;
    let registry: any;
    let owner: any;
    let nonOwner: any;

    const secrets = [123456789n, 987654321n, 555555555n];
    let commitments: bigint[];
    let tree: ReturnType<typeof buildMerkleTree>;
    const externalNullifier = 42n;

    before(async function () {
        this.timeout(30000);
        await initPoseidon();

        [owner, nonOwner] = await ethers.getSigners();

        commitments = secrets.map((s) => poseidonHash([s]));
        tree = buildMerkleTree(commitments);

        verifier = await ethers.deployContract("Groth16Verifier");
        registry = await ethers.deployContract("WhistleblowerRegistry", [
            await verifier.getAddress(),
        ]);

        await registry.addRoot(tree.root);
    });

    describe("Root management", function () {
        it("should allow owner to add a root", async function () {
            const newRoot = 12345n;
            await expect(registry.addRoot(newRoot))
                .to.emit(registry, "RootAdded")
                .withArgs(newRoot);
            expect(await registry.roots(newRoot)).to.be.true;
            await registry.revokeRoot(newRoot);
        });

        it("should reject duplicate root", async function () {
            await expect(registry.addRoot(tree.root)).to.be.revertedWith(
                "Root already exists"
            );
        });

        it("should allow owner to revoke a root", async function () {
            const tempRoot = 99999n;
            await registry.addRoot(tempRoot);
            await expect(registry.revokeRoot(tempRoot))
                .to.emit(registry, "RootRevoked")
                .withArgs(tempRoot);
            expect(await registry.roots(tempRoot)).to.be.false;
        });

        it("should reject non-owner root management", async function () {
            await expect(
                registry.connect(nonOwner).addRoot(11111n)
            ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
        });
    });

    describe("Report submission", function () {
        it("should accept a valid report with valid proof", async function () {
            this.timeout(60000);

            const { proof, nullifierHash } = await generateProof(
                secrets[0], tree, 0, externalNullifier
            );
            const { pA, pB, pC } = formatProofForContract(proof);

            const tx = await registry.submitReport(
                pA, pB, pC,
                tree.root, nullifierHash, externalNullifier,
                "QmTestCID123456789", 0
            );

            await expect(tx)
                .to.emit(registry, "ReportSubmitted")
                .withArgs(0, nullifierHash, "QmTestCID123456789", 0, (v: any) => v > 0);

            const report = await registry.getReport(0);
            expect(report.nullifierHash).to.equal(nullifierHash);
            expect(report.encryptedCID).to.equal("QmTestCID123456789");
            expect(report.category).to.equal(0);
        });

        it("should reject duplicate nullifier", async function () {
            this.timeout(60000);

            const { proof, nullifierHash } = await generateProof(
                secrets[0], tree, 0, externalNullifier
            );
            const { pA, pB, pC } = formatProofForContract(proof);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    tree.root, nullifierHash, externalNullifier,
                    "QmDuplicate", 0
                )
            ).to.be.revertedWith("Nullifier already used");
        });

        it("should accept a second member's report", async function () {
            this.timeout(60000);

            const { proof, nullifierHash } = await generateProof(
                secrets[1], tree, 1, externalNullifier
            );
            const { pA, pB, pC } = formatProofForContract(proof);

            await registry.submitReport(
                pA, pB, pC,
                tree.root, nullifierHash, externalNullifier,
                "QmSecondMember", 1
            );

            expect(await registry.getReportCount()).to.equal(2);
        });

        it("should reject report against unknown root", async function () {
            this.timeout(60000);

            const { proof, nullifierHash } = await generateProof(
                secrets[2], tree, 2, externalNullifier
            );
            const { pA, pB, pC } = formatProofForContract(proof);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    999n, nullifierHash, externalNullifier,
                    "QmFakeRoot", 0
                )
            ).to.be.revertedWith("Unknown merkle root");
        });

        it("should reject report against revoked root", async function () {
            this.timeout(60000);

            const tempSecrets = [111n];
            const tempCommitments = tempSecrets.map((s) => poseidonHash([s]));
            const tempTree = buildMerkleTree(tempCommitments);
            await registry.addRoot(tempTree.root);
            await registry.revokeRoot(tempTree.root);

            const { proof, nullifierHash } = await generateProof(
                111n, tempTree, 0, externalNullifier
            );
            const { pA, pB, pC } = formatProofForContract(proof);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    tempTree.root, nullifierHash, externalNullifier,
                    "QmRevoked", 0
                )
            ).to.be.revertedWith("Unknown merkle root");
        });

        it("should reject an invalid proof", async function () {
            const fakePa: [string, string] = ["0", "0"];
            const fakePb: [[string, string], [string, string]] = [["0", "0"], ["0", "0"]];
            const fakePc: [string, string] = ["0", "0"];

            await expect(
                registry.submitReport(
                    fakePa, fakePb, fakePc,
                    tree.root, 12345n, externalNullifier,
                    "QmFakeProof", 0
                )
            ).to.be.revertedWith("Invalid ZK proof");
        });

        it("should reject invalid category", async function () {
            this.timeout(60000);

            const { proof, nullifierHash } = await generateProof(
                secrets[2], tree, 2, 999n
            );
            const { pA, pB, pC } = formatProofForContract(proof);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    tree.root, nullifierHash, 999n,
                    "QmBadCategory", 5
                )
            ).to.be.revertedWith("Invalid category");
        });
    });

    describe("Report retrieval", function () {
        it("should return correct report count", async function () {
            expect(await registry.getReportCount()).to.equal(2);
        });

        it("should revert for non-existent report", async function () {
            await expect(registry.getReport(999)).to.be.revertedWith(
                "Report does not exist"
            );
        });
    });
});
