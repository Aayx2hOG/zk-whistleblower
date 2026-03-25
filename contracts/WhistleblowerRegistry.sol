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
    uint256 public constant DEFAULT_ORG_ID = 0;

    error UnknownMerkleRoot();
    error NullifierAlreadyUsed();
    error InvalidCategory();
    error InvalidZKProof();
    error RootAlreadyExists();
    error RootDoesNotExist();
    error ReportDoesNotExist();
    error OrganizationAlreadyExists();
    error OrganizationDoesNotExist();
    error OrganizationInactive();

    IGroth16Verifier public immutable verifier;

    struct Organization {
        string name;
        bool active;
        uint256 createdAt;
    }

    mapping(uint256 => bool) public roots;
    mapping(uint256 => bool) public usedNullifiers;
    mapping(uint256 => Organization) private organizations;
    mapping(uint256 => bool) public organizationExists;
    mapping(uint256 => mapping(uint256 => bool)) public orgRoots;
    mapping(uint256 => mapping(uint256 => bool)) public orgUsedNullifiers;
    mapping(uint256 => uint256[]) private orgReportIds;
    mapping(uint256 => uint256) public reportOrgId;

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
    event ReportSubmittedForOrg(
        uint256 indexed reportId,
        uint256 indexed orgId,
        uint256 indexed nullifierHash,
        bytes encryptedCID,
        uint8 category,
        uint256 timestamp
    );
    event OrganizationCreated(uint256 indexed orgId, string name, uint256 timestamp);
    event OrganizationStatusUpdated(uint256 indexed orgId, bool active, uint256 timestamp);
    event RootAdded(uint256 indexed root);
    event RootAddedForOrg(uint256 indexed orgId, uint256 indexed root);
    event RootRevoked(uint256 indexed root);
    event RootRevokedForOrg(uint256 indexed orgId, uint256 indexed root);

    constructor(address _verifier) Ownable(msg.sender) {
        verifier = IGroth16Verifier(_verifier);
        organizationExists[DEFAULT_ORG_ID] = true;
        organizations[DEFAULT_ORG_ID] = Organization({
            name: "Default",
            active: true,
            createdAt: block.timestamp
        });
        emit OrganizationCreated(DEFAULT_ORG_ID, "Default", block.timestamp);
    }

    function addRoot(uint256 _root) external onlyOwner {
        addRootForOrg(DEFAULT_ORG_ID, _root);
    }

    function revokeRoot(uint256 _root) external onlyOwner {
        revokeRootForOrg(DEFAULT_ORG_ID, _root);
    }

    function createOrganization(uint256 _orgId, string calldata _name) external onlyOwner {
        if (organizationExists[_orgId]) revert OrganizationAlreadyExists();
        organizationExists[_orgId] = true;
        organizations[_orgId] = Organization({
            name: _name,
            active: true,
            createdAt: block.timestamp
        });

        emit OrganizationCreated(_orgId, _name, block.timestamp);
    }

    function setOrganizationActive(uint256 _orgId, bool _active) external onlyOwner {
        if (!organizationExists[_orgId]) revert OrganizationDoesNotExist();
        organizations[_orgId].active = _active;
        emit OrganizationStatusUpdated(_orgId, _active, block.timestamp);
    }

    function getOrganization(
        uint256 _orgId
    ) external view returns (Organization memory) {
        if (!organizationExists[_orgId]) revert OrganizationDoesNotExist();
        return organizations[_orgId];
    }

    function addRootForOrg(uint256 _orgId, uint256 _root) public onlyOwner {
        if (!organizationExists[_orgId]) revert OrganizationDoesNotExist();
        if (!organizations[_orgId].active) revert OrganizationInactive();
        if (orgRoots[_orgId][_root]) revert RootAlreadyExists();

        orgRoots[_orgId][_root] = true;
        if (_orgId == DEFAULT_ORG_ID) {
            roots[_root] = true;
            emit RootAdded(_root);
        }

        emit RootAddedForOrg(_orgId, _root);
    }

    function revokeRootForOrg(uint256 _orgId, uint256 _root) public onlyOwner {
        if (!organizationExists[_orgId]) revert OrganizationDoesNotExist();
        if (!orgRoots[_orgId][_root]) revert RootDoesNotExist();

        orgRoots[_orgId][_root] = false;
        if (_orgId == DEFAULT_ORG_ID) {
            roots[_root] = false;
            emit RootRevoked(_root);
        }

        emit RootRevokedForOrg(_orgId, _root);
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
        submitReportForOrg(
            DEFAULT_ORG_ID,
            _pA,
            _pB,
            _pC,
            _root,
            _nullifierHash,
            _externalNullifier,
            _encryptedCID,
            _category
        );
    }

    function submitReportForOrg(
        uint256 _orgId,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint256 _root,
        uint256 _nullifierHash,
        uint256 _externalNullifier,
        bytes calldata _encryptedCID,
        uint8 _category
    ) public {
        // Cheap checks first, expensive proof verification last
        if (!organizationExists[_orgId]) revert OrganizationDoesNotExist();
        if (!organizations[_orgId].active) revert OrganizationInactive();
        if (!orgRoots[_orgId][_root]) revert UnknownMerkleRoot();
        if (orgUsedNullifiers[_orgId][_nullifierHash]) revert NullifierAlreadyUsed();
        if (_category > 3) revert InvalidCategory();

        // Expensive proof verification last (fail fast on invalid inputs)
        uint[3] memory pubSignals = [_root, _nullifierHash, _externalNullifier];
        if (!verifier.verifyProof(_pA, _pB, _pC, pubSignals)) revert InvalidZKProof();

        orgUsedNullifiers[_orgId][_nullifierHash] = true;
        if (_orgId == DEFAULT_ORG_ID) {
            usedNullifiers[_nullifierHash] = true;
        }

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
        reportOrgId[reportId] = _orgId;
        orgReportIds[_orgId].push(reportId);

        emit ReportSubmitted(
            reportId,
            _nullifierHash,
            _encryptedCID,
            _category,
            block.timestamp
        );
        emit ReportSubmittedForOrg(
            reportId,
            _orgId,
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

    function getOrgReportCount(uint256 _orgId) external view returns (uint256) {
        if (!organizationExists[_orgId]) revert OrganizationDoesNotExist();
        return orgReportIds[_orgId].length;
    }

    function getOrgReportIdAt(
        uint256 _orgId,
        uint256 _index
    ) external view returns (uint256) {
        if (!organizationExists[_orgId]) revert OrganizationDoesNotExist();
        if (_index >= orgReportIds[_orgId].length) revert ReportDoesNotExist();
        return orgReportIds[_orgId][_index];
    }
}
