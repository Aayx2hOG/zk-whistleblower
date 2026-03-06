// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[3] calldata _pubSignals
    ) external view returns (bool);
}

contract WhistleblowerRegistry is Ownable {
    IGroth16Verifier public immutable verifier;

    mapping(uint256 => bool) public roots;
    mapping(uint256 => bool) public usedNullifiers;

    struct Report {
        uint256 nullifierHash;
        string encryptedCID;
        uint256 timestamp;
        uint8 category; // 0: fraud, 1: safety, 2: ethics, 3: other
        uint256 merkleRoot;
    }

    Report[] public reports;

    event ReportSubmitted(
        uint256 indexed reportId,
        uint256 indexed nullifierHash,
        string encryptedCID,
        uint8 category,
        uint256 timestamp
    );
    event RootAdded(uint256 indexed root);
    event RootRevoked(uint256 indexed root);

    constructor(address _verifier) Ownable(msg.sender) {
        verifier = IGroth16Verifier(_verifier);
    }

    function addRoot(uint256 _root) external onlyOwner {
        require(!roots[_root], "Root already exists");
        roots[_root] = true;
        emit RootAdded(_root);
    }

    function revokeRoot(uint256 _root) external onlyOwner {
        require(roots[_root], "Root does not exist");
        roots[_root] = false;
        emit RootRevoked(_root);
    }

    function submitReport(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint256 _root,
        uint256 _nullifierHash,
        uint256 _externalNullifier,
        string calldata _encryptedCID,
        uint8 _category
    ) external {
        require(roots[_root], "Unknown merkle root");
        require(!usedNullifiers[_nullifierHash], "Nullifier already used");
        require(_category <= 3, "Invalid category");

        uint[3] memory pubSignals = [_root, _nullifierHash, _externalNullifier];
        require(
            verifier.verifyProof(_pA, _pB, _pC, pubSignals),
            "Invalid ZK proof"
        );

        usedNullifiers[_nullifierHash] = true;

        uint256 reportId = reports.length;
        reports.push(
            Report({
                nullifierHash: _nullifierHash,
                encryptedCID: _encryptedCID,
                timestamp: block.timestamp,
                category: _category,
                merkleRoot: _root
            })
        );

        emit ReportSubmitted(
            reportId,
            _nullifierHash,
            _encryptedCID,
            _category,
            block.timestamp
        );
    }

    function getReport(
        uint256 _reportId
    ) external view returns (Report memory) {
        require(_reportId < reports.length, "Report does not exist");
        return reports[_reportId];
    }

    function getReportCount() external view returns (uint256) {
        return reports.length;
    }
}
