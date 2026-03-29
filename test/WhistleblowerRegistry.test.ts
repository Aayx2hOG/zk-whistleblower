import { expect } from "chai";
import { network } from "hardhat";
import {
    initPoseidon,
    poseidonHash,
    buildMerkleTree,
    getMerkleProof,
    generateProof,
    generateProofRaw,
    formatProofForContract,
} from "./fixtures/setup.js";

// @ts-ignore
const { ethers } = await network.connect();

function cidBytes(cid: string): `0x${string}` {
    return ethers.hexlify(ethers.toUtf8Bytes(cid));
}

async function expectWitnessGenerationFailure(promise: Promise<unknown>) {
    const originalWrite = process.stderr.write.bind(process.stderr);
    const originalError = console.error;

    process.stderr.write = ((...args: Parameters<typeof process.stderr.write>) => {
        const chunk = args[0];
        if (typeof chunk === "string" && chunk.includes("Error in template MembershipProof")) {
            return true;
        }
        return originalWrite(...args);
    }) as typeof process.stderr.write;

    console.error = (...args: unknown[]) => {
        if (
            args.some(
                (arg) => typeof arg === "string" && arg.includes("Error in template MembershipProof")
            )
        ) {
            return;
        }
        originalError(...(args as Parameters<typeof console.error>));
    };

    try {
        await expect(promise).to.be.rejected;
    } finally {
        process.stderr.write = originalWrite;
        console.error = originalError;
    }
}

describe("WhistleblowerRegistry", function () {
    let verifier: any;
    let registry: any;
    let owner: any;
    let nonOwner: any;
    let superAdminRole: string;

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

        superAdminRole = await registry.SUPER_ADMIN_ROLE();

        await registry.addRoot(tree.root);
    });

    describe("Organization management", function () {
        it("should have default organization active", async function () {
            const defaultOrg = await registry.getOrganization(0);
            expect(defaultOrg.name).to.equal("Default");
            expect(defaultOrg.active).to.equal(true);
        });

        it("should allow owner to create organization", async function () {
            await expect(registry.createOrganization(1, "Engineering"))
                .to.emit(registry, "OrganizationCreated");

            const org = await registry.getOrganization(1);
            expect(org.name).to.equal("Engineering");
            expect(org.active).to.equal(true);
        });

        it("should reject duplicate organization id", async function () {
            await expect(
                registry.createOrganization(1, "Engineering Again")
            ).to.be.revertedWithCustomError(registry, "OrganizationAlreadyExists");
        });

        it("should allow owner to deactivate/reactivate organization", async function () {
            await expect(registry.setOrganizationActive(1, false))
                .to.emit(registry, "OrganizationStatusUpdated");

            let org = await registry.getOrganization(1);
            expect(org.active).to.equal(false);

            await registry.setOrganizationActive(1, true);
            org = await registry.getOrganization(1);
            expect(org.active).to.equal(true);
        });

        it("should reject non-owner organization actions", async function () {
            await expect(
                registry.connect(nonOwner).createOrganization(2, "HR")
            )
                .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
                .withArgs(nonOwner.address, superAdminRole);
        });

        it("should allow super-admin to grant org admin", async function () {
            await registry.grantOrgAdmin(1, nonOwner.address);
            expect(await registry.isOrgAdmin(1, nonOwner.address)).to.equal(true);
        });

        it("should allow granted org admin to manage that organization", async function () {
            const orgRoot = 1234567n;
            await expect(registry.connect(nonOwner).addRootForOrg(1, orgRoot))
                .to.emit(registry, "RootAddedForOrg")
                .withArgs(1, orgRoot);

            await expect(registry.connect(nonOwner).revokeRootForOrg(1, orgRoot))
                .to.emit(registry, "RootRevokedForOrg")
                .withArgs(1, orgRoot);
        });
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
            await expect(registry.addRoot(tree.root)).to.be.revertedWithCustomError(
                registry,
                "RootAlreadyExists"
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
            )
                .to.be.revertedWithCustomError(registry, "UnauthorizedOrgAdmin")
                .withArgs(0n, nonOwner.address);
        });
    });

    describe("Report submission", function () {
        it("should accept a valid report with valid proof", async function () {
            this.timeout(60000);

            const { proof, publicSignals, nullifierHash } = await generateProof(
                secrets[0], tree, 0, externalNullifier
            );
            const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);

            const tx = await registry.submitReport(
                pA, pB, pC,
                tree.root, nullifierHash, externalNullifier,
                cidBytes("QmTestCID123456789"), 0
            );

            await expect(tx)
                .to.emit(registry, "ReportSubmitted")
                .withArgs(0, nullifierHash, cidBytes("QmTestCID123456789"), 0, (v: any) => v > 0);

            const report = await registry.getReport(0);
            expect(report.nullifierHash).to.equal(nullifierHash);
            expect(report.encryptedCID).to.equal(cidBytes("QmTestCID123456789"));
            expect(report.category).to.equal(0);
        });

        it("should reject duplicate nullifier", async function () {
            this.timeout(60000);

            const { proof, publicSignals, nullifierHash } = await generateProof(
                secrets[0], tree, 0, externalNullifier
            );
            const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    tree.root, nullifierHash, externalNullifier,
                    cidBytes("QmDuplicate"), 0
                )
            ).to.be.revertedWithCustomError(registry, "NullifierAlreadyUsed");
        });

        it("should accept a second member's report", async function () {
            this.timeout(60000);

            const { proof, publicSignals, nullifierHash } = await generateProof(
                secrets[1], tree, 1, externalNullifier
            );
            const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);

            await registry.submitReport(
                pA, pB, pC,
                tree.root, nullifierHash, externalNullifier,
                cidBytes("QmSecondMember"), 1
            );

            expect(await registry.getReportCount()).to.equal(2);
        });

        it("should reject report against unknown root", async function () {
            this.timeout(60000);

            const { proof, publicSignals, nullifierHash } = await generateProof(
                secrets[2], tree, 2, externalNullifier
            );
            const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    999n, nullifierHash, externalNullifier,
                    cidBytes("QmFakeRoot"), 0
                )
            ).to.be.revertedWithCustomError(registry, "UnknownMerkleRoot");
        });

        it("should reject report against revoked root", async function () {
            this.timeout(60000);

            const tempSecrets = [111n];
            const tempCommitments = tempSecrets.map((s) => poseidonHash([s]));
            const tempTree = buildMerkleTree(tempCommitments);
            await registry.addRoot(tempTree.root);
            await registry.revokeRoot(tempTree.root);

            const { proof, publicSignals, nullifierHash } = await generateProof(
                111n, tempTree, 0, externalNullifier
            );
            const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    tempTree.root, nullifierHash, externalNullifier,
                    cidBytes("QmRevoked"), 0
                )
            ).to.be.revertedWithCustomError(registry, "UnknownMerkleRoot");
        });

        it("should reject an invalid proof", async function () {
            const fakePa: [string, string] = ["0", "0"];
            const fakePb: [[string, string], [string, string]] = [["0", "0"], ["0", "0"]];
            const fakePc: [string, string] = ["0", "0"];

            await expect(
                registry.submitReport(
                    fakePa, fakePb, fakePc,
                    tree.root, 12345n, externalNullifier,
                    cidBytes("QmFakeProof"), 0
                )
            ).to.be.revertedWithCustomError(registry, "InvalidZKProof");
        });

        it("should reject invalid category", async function () {
            this.timeout(60000);

            const { proof, publicSignals, nullifierHash } = await generateProof(
                secrets[2], tree, 2, 999n
            );
            const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    tree.root, nullifierHash, 999n,
                    cidBytes("QmBadCategory"), 5
                )
            ).to.be.revertedWithCustomError(registry, "InvalidCategory");
        });

        it("should scope roots and nullifiers per organization", async function () {
            this.timeout(180000);

            await registry.createOrganization(10, "HR");
            await registry.createOrganization(20, "Legal");

            const orgSecrets = [701n, 702n];
            const orgCommitments = orgSecrets.map((s) => poseidonHash([s]));
            const orgTree = buildMerkleTree(orgCommitments);
            const orgExternalNullifier = 9901n;

            await registry.addRootForOrg(10, orgTree.root);
            await registry.addRootForOrg(20, orgTree.root);

            const { proof, publicSignals, nullifierHash } = await generateProof(
                orgSecrets[0], orgTree, 0, orgExternalNullifier
            );
            const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);

            await registry.submitReportForOrg(
                10,
                pA,
                pB,
                pC,
                orgTree.root,
                nullifierHash,
                orgExternalNullifier,
                cidBytes("QmOrg10First"),
                1
            );

            await registry.submitReportForOrg(
                20,
                pA,
                pB,
                pC,
                orgTree.root,
                nullifierHash,
                orgExternalNullifier,
                cidBytes("QmOrg20First"),
                2
            );

            await expect(
                registry.submitReportForOrg(
                    10,
                    pA,
                    pB,
                    pC,
                    orgTree.root,
                    nullifierHash,
                    orgExternalNullifier,
                    cidBytes("QmOrg10Replay"),
                    1
                )
            ).to.be.revertedWithCustomError(registry, "NullifierAlreadyUsed");

            expect(await registry.getOrgReportCount(10)).to.equal(1);
            expect(await registry.getOrgReportCount(20)).to.equal(1);
        });

        it("should reject submissions for unknown or inactive organizations", async function () {
            this.timeout(60000);

            const tempSecrets = [801n];
            const tempCommitments = tempSecrets.map((s) => poseidonHash([s]));
            const tempTree = buildMerkleTree(tempCommitments);
            const tempExternalNullifier = 4001n;

            const { proof, publicSignals, nullifierHash } = await generateProof(
                tempSecrets[0], tempTree, 0, tempExternalNullifier
            );
            const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);

            await expect(
                registry.submitReportForOrg(
                    999,
                    pA,
                    pB,
                    pC,
                    tempTree.root,
                    nullifierHash,
                    tempExternalNullifier,
                    cidBytes("QmUnknownOrg"),
                    0
                )
            ).to.be.revertedWithCustomError(registry, "OrganizationDoesNotExist");

            await registry.createOrganization(30, "Temp");
            await registry.addRootForOrg(30, tempTree.root);
            await registry.setOrganizationActive(30, false);

            await expect(
                registry.submitReportForOrg(
                    30,
                    pA,
                    pB,
                    pC,
                    tempTree.root,
                    nullifierHash,
                    tempExternalNullifier,
                    cidBytes("QmInactiveOrg"),
                    0
                )
            ).to.be.revertedWithCustomError(registry, "OrganizationInactive");
        });

        it("should allow 5 members to submit once each and reject replay", async function () {
            this.timeout(180000);

            const demoSecrets = [101n, 202n, 303n, 404n, 505n];
            const demoCommitments = demoSecrets.map((s) => poseidonHash([s]));
            const demoTree = buildMerkleTree(demoCommitments);
            const demoExternalNullifier = 777n;

            await registry.addRoot(demoTree.root);

            for (let i = 0; i < demoSecrets.length; i++) {
                const { proof, publicSignals, nullifierHash } = await generateProof(
                    demoSecrets[i], demoTree, i, demoExternalNullifier
                );
                const { pA, pB, pC } = await formatProofForContract(proof, publicSignals);
                await registry.submitReport(
                    pA, pB, pC,
                    demoTree.root, nullifierHash, demoExternalNullifier,
                    cidBytes(`QmDemoUser${i}`), i % 4
                );
            }

            const {
                proof: replayProof,
                publicSignals: replaySignals,
                nullifierHash: replayNullifier,
            } = await generateProof(
                demoSecrets[0], demoTree, 0, demoExternalNullifier
            );
            const { pA, pB, pC } = await formatProofForContract(replayProof, replaySignals);

            await expect(
                registry.submitReport(
                    pA, pB, pC,
                    demoTree.root, replayNullifier, demoExternalNullifier,
                    cidBytes("QmReplay"), 0
                )
            ).to.be.revertedWithCustomError(registry, "NullifierAlreadyUsed");
        });
    });

    describe("Report retrieval", function () {
        it("should return correct report count", async function () {
            expect(await registry.getReportCount()).to.equal(9);
        });

        it("should revert for non-existent report", async function () {
            await expect(registry.getReport(999)).to.be.revertedWithCustomError(
                registry,
                "ReportDoesNotExist"
            );
        });
    });

    describe("Circuit constraints", function () {
        it("should generate a valid witness for a legitimate member", async function () {
            this.timeout(60000);
            const { pathElements, pathIndices } = getMerkleProof(tree.layers, 0);
            const nullifierHash = poseidonHash([secrets[0], externalNullifier]);
            await generateProofRaw({
                root: tree.root.toString(),
                nullifierHash: nullifierHash.toString(),
                externalNullifier: externalNullifier.toString(),
                secret: secrets[0].toString(),
                pathElements: pathElements.map((x) => x.toString()),
                pathIndices: pathIndices.map((x) => x.toString()),
            });
        });

        it("should fail witness generation for a non-member secret", async function () {
            this.timeout(60000);
            const outsiderSecret = 999999999n;
            const { pathElements, pathIndices } = getMerkleProof(tree.layers, 0);
            const nullifierHash = poseidonHash([outsiderSecret, externalNullifier]);

            await expectWitnessGenerationFailure(
                generateProofRaw({
                    root: tree.root.toString(),
                    nullifierHash: nullifierHash.toString(),
                    externalNullifier: externalNullifier.toString(),
                    secret: outsiderSecret.toString(),
                    pathElements: pathElements.map((x) => x.toString()),
                    pathIndices: pathIndices.map((x) => x.toString()),
                })
            );
        });

        it("should fail witness generation for a tampered Merkle path", async function () {
            this.timeout(60000);
            const { pathElements, pathIndices } = getMerkleProof(tree.layers, 0);
            const tamperedPath = [...pathElements];
            tamperedPath[0] = 9999999999999n;
            const nullifierHash = poseidonHash([secrets[0], externalNullifier]);

            await expectWitnessGenerationFailure(
                generateProofRaw({
                    root: tree.root.toString(),
                    nullifierHash: nullifierHash.toString(),
                    externalNullifier: externalNullifier.toString(),
                    secret: secrets[0].toString(),
                    pathElements: tamperedPath.map((x) => x.toString()),
                    pathIndices: pathIndices.map((x) => x.toString()),
                })
            );
        });

        it("should fail witness generation for a wrong leaf index", async function () {
            this.timeout(60000);
            const { pathElements, pathIndices } = getMerkleProof(tree.layers, 1);
            const nullifierHash = poseidonHash([secrets[0], externalNullifier]);

            await expectWitnessGenerationFailure(
                generateProofRaw({
                    root: tree.root.toString(),
                    nullifierHash: nullifierHash.toString(),
                    externalNullifier: externalNullifier.toString(),
                    secret: secrets[0].toString(),
                    pathElements: pathElements.map((x) => x.toString()),
                    pathIndices: pathIndices.map((x) => x.toString()),
                })
            );
        });

        it("should fail witness generation for a mismatched nullifier hash", async function () {
            this.timeout(60000);
            const { pathElements, pathIndices } = getMerkleProof(tree.layers, 0);
            const wrongNullifier = poseidonHash([secrets[1], externalNullifier]);

            await expectWitnessGenerationFailure(
                generateProofRaw({
                    root: tree.root.toString(),
                    nullifierHash: wrongNullifier.toString(),
                    externalNullifier: externalNullifier.toString(),
                    secret: secrets[0].toString(),
                    pathElements: pathElements.map((x) => x.toString()),
                    pathIndices: pathIndices.map((x) => x.toString()),
                })
            );
        });
    });
});
