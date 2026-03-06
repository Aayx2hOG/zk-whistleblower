pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

// Computes commitment and nullifierHash from a member's secret
template CommitmentHasher() {
    signal input secret;
    signal input externalNullifier;

    signal output commitment;
    signal output nullifierHash;

    component commitmentHasher = Poseidon(1);
    commitmentHasher.inputs[0] <== secret;
    commitment <== commitmentHasher.out;

    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== externalNullifier;
    nullifierHash <== nullifierHasher.out;
}

// Verifies a Merkle inclusion proof using Poseidon hashes
template MerkleTreeChecker(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal output root;

    component hashers[levels];
    component mux[levels];

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== hashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== hashes[i];
        mux[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];

        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

// Main circuit: proves membership in an organization without revealing identity
template MembershipProof(levels) {
    signal input root;
    signal input nullifierHash;
    signal input externalNullifier;

    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component hasher = CommitmentHasher();
    hasher.secret <== secret;
    hasher.externalNullifier <== externalNullifier;

    hasher.nullifierHash === nullifierHash;

    component tree = MerkleTreeChecker(levels);
    tree.leaf <== hasher.commitment;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    tree.root === root;
}

component main {public [root, nullifierHash, externalNullifier]} = MembershipProof(10);
