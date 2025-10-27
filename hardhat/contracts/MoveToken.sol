// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "./config/SepoliaConfig.sol";

/**
 * @title MoveToken
 * @notice 平台 ERC20 代币，奖励由奖励合约铸造
 */
contract MoveToken is ERC20, SepoliaConfig, Ownable {
    address public minter;

    event MinterUpdated(address indexed oldMinter, address indexed newMinter);
    event MintRequested(address indexed to, uint256 indexed requestId, address indexed caller, uint256 timestamp);
    event MintCompleted(address indexed to, uint64 amount, uint256 indexed requestId);

    struct MintRequest {
        address to;
        address caller;
        uint256 timestamp;
    }

    mapping(uint256 => MintRequest) private _mintRequests;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) Ownable(msg.sender) {}

    function setMinter(address newMinter) external onlyOwner {
        address old = minter;
        minter = newMinter;
        emit MinterUpdated(old, newMinter);
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Not minter");
        _mint(to, amount);
    }

    /**
     * @notice 同态加密的铸造入口：金额以密文传入，链上请求解密后在回调中完成铸造
     * @param to 接收地址
     * @param _amount 加密金额（externalEuint64）
     * @param proof 零知识证明
     */
    function mintEncrypted(address to, externalEuint64 _amount, bytes calldata proof) external {
        require(msg.sender == minter, "Not minter");
        require(to != address(0), "to is zero");

        // 将外部密文载入为合约内密文句柄
        euint64 amountHandle = FHE.fromExternal(_amount, proof);

        // 申请解密，回调至 callbackMint
        bytes32[] memory ciphers = new bytes32[](1);
        ciphers[0] = FHE.toBytes32(amountHandle);
        uint256 requestId = FHE.requestDecryption(ciphers, this.callbackMint.selector);

        _mintRequests[requestId] = MintRequest({to: to, caller: msg.sender, timestamp: block.timestamp});
        emit MintRequested(to, requestId, msg.sender, block.timestamp);
    }

    /**
     * @notice 解密回调：由 FHEVM 后端调用并携带签名
     * @param requestId 请求 ID
     * @param cleartexts 解密得到的明文字节（按 32 字节对齐存放）
     * @param decryptionProof 回调签名与证明
     */
    function callbackMint(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) external {
        // 校验回调签名，防止伪造（注意 3 个参数）
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        MintRequest memory req = _mintRequests[requestId];
        require(req.to != address(0), "invalid request");

        // 从 cleartexts 中解析首个明文值（对应我们请求解密的第一个句柄）
        require(cleartexts.length >= 32, "invalid cleartexts");
        uint256 amount256;
        assembly {
            amount256 := mload(add(cleartexts, 0x20))
        }
        uint64 decryptedAmount = uint64(amount256);

        delete _mintRequests[requestId];

        _mint(req.to, decryptedAmount);
        emit MintCompleted(req.to, decryptedAmount, requestId);
    }
}


