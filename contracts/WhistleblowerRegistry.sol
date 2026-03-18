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
    error UnknownMerkleRoot();
    error NullifierAlreadyUsed();
    error InvalidCategory();
    error InvalidZKProof();
    error RootAlreadyExists();
    error RootDoesNotExist();
    error ReportDoesNotExist();

    IGroth16Verifier public immutable verifier;

    mapping(uint256 => bool) public roots;
    mapping(uint256 => bool) public usedNullifiers;

    struct Report {
        uint256 nullifierHash;
        uint256 merkleRoot;
        uint256 timestamp;
        uint8 category;
        bytes encryptedCID;
    }

    Report[] public reports;

    event ReportSubmitted(
        uint256 indexed reportId,
        uint256 indexed nullifierHash,
        bytes encryptedCID,
        uint8 category,
        uint256 timestamp
    );
    event RootAdded(uint256 indexed root);
    event RootRevoked(uint256 indexed root);

    constructor(address _verifier) Ownable(msg.sender) {
        verifier = IGroth16Verifier(_verifier);
    }

    function addRoot(uint256 _root) external onlyOwner {
        if (roots[_root]) revert RootAlreadyExists();
        roots[_root] = true;
        emit RootAdded(_root);
    }

    function revokeRoot(uint256 _root) external onlyOwner {
        if (!roots[_root]) revert RootDoesNotExist();
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
        bytes calldata _encryptedCID,
        uint8 _category
    ) external {
        // Cheap checks first, expensive proof verification last
        if (!roots[_root]) revert UnknownMerkleRoot();
        if (usedNullifiers[_nullifierHash]) revert NullifierAlreadyUsed();
        if (_category > 3) revert InvalidCategory();

        // Expensive proof verification last (fail fast on invalid inputs)
        uint[3] memory pubSignals = [_root, _nullifierHash, _externalNullifier];
        if (!verifier.verifyProof(_pA, _pB, _pC, pubSignals)) revert InvalidZKProof();

        usedNullifiers[_nullifierHash] = true;

        uint256 reportId = reports.length;
        reports.push(
            Report({
                nullifierHash: _nullifierHash,
                merkleRoot: _root,
                timestamp: block.timestamp,
                category: _category,
                encryptedCID: _encryptedCID
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
        if (_reportId >= reports.length) revert ReportDoesNotExist();
        return reports[_reportId];
    }

    function getReportCount() external view returns (uint256) {
        return reports.length;
    }
}
