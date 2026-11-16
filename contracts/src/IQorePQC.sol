// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title IQorePQC
/// @notice QoreChain EVM precompiles for post-quantum key material.
///         PQC Verify lives at 0x…0a01, PQC Key Status at 0x…0a02.
interface IQorePQC {
    function pqcVerify(
        bytes calldata pubkey,
        bytes calldata signature,
        bytes calldata message
    ) external view returns (bool valid);

    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven);
}
