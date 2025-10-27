// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MoveToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "./config/SepoliaConfig.sol";

/**
 * @title ActivityRewards (普通合约)
 * @notice 记录每日步数/签到，并按区间发放积分（以 MoveToken 代币计）
 */
contract ActivityRewards is SepoliaConfig, Ownable {
    MoveToken public immutable token;

    uint256 public constant DAY = 1 days;

    // 加密奖励配置
    euint64 private baseSignReward;   // 签到基础奖励（密文）
    euint64 private stepRewardMid;    // 3000-7000 步奖励（密文）
    euint64 private stepRewardHigh;   // >7000 步奖励（密文）

    // 明文奖励配置（用于普通提交流程）
    uint64 public baseSignRewardPlain;
    uint64 public stepRewardMidPlain;
    uint64 public stepRewardHighPlain;

    mapping(address => uint256) public lastSubmitDay; // 明文天索引，仅作频控

    // 加密累计积分（仅统计用途）
    mapping(address => euint64) private encryptedTotalPoints;
    mapping(address => bool) private isTotalInitialized;

    // 解密请求上下文
    struct RewardRequest { address user; uint256 dayIndex; }
    mapping(uint256 => RewardRequest) private _rewardRequests;

    event SubmittedEncrypted(address indexed user, uint256 dayIndex, uint256 requestId);
    // 普通提交流程事件：与前端 `Results.tsx` 解析保持一致
    event Submitted(address indexed user, uint256 dayIndex, uint256 steps, uint256 reward);
    event ConfigUpdated();
    event RewardMinted(address indexed user, uint256 dayIndex, uint64 amount, uint256 requestId);

    constructor(MoveToken _token, uint64 base_, uint64 mid_, uint64 high_) Ownable(msg.sender) {
        token = _token;
        baseSignReward = FHE.asEuint64(base_);
        stepRewardMid = FHE.asEuint64(mid_);
        stepRewardHigh = FHE.asEuint64(high_);

        _authorizeHandle(baseSignReward);
        _authorizeHandle(stepRewardMid);
        _authorizeHandle(stepRewardHigh);

        // 记录明文奖励配置（用于普通提交）
        baseSignRewardPlain = base_;
        stepRewardMidPlain = mid_;
        stepRewardHighPlain = high_;
    }

    function setRewards(externalEuint64 _base, externalEuint64 _mid, externalEuint64 _high, bytes calldata proof) external onlyOwner {
        euint64 base = FHE.fromExternal(_base, proof);
        euint64 mid = FHE.fromExternal(_mid, proof);
        euint64 high = FHE.fromExternal(_high, proof);

        baseSignReward = base;
        stepRewardMid = mid;
        stepRewardHigh = high;

        _authorizeHandle(baseSignReward);
        _authorizeHandle(stepRewardMid);
        _authorizeHandle(stepRewardHigh);

        emit ConfigUpdated();
    }

    function todayIndex() public view returns (uint256) {
        return block.timestamp / DAY;
    }

    /**
     * @notice 普通（明文）提交入口：直接根据步数区间计算并铸造奖励
     * @dev 与前端 `submitPlain` 调用匹配；每日仅可提交一次
     */
    function submitDaily(uint256 steps) external {
        uint256 dayIndex = todayIndex();
        require(lastSubmitDay[msg.sender] != dayIndex, "already submitted today");

        uint256 reward = 0;
        if (steps == 0) {
            reward = uint256(baseSignRewardPlain);
        } else if (steps >= 3000 && steps <= 7000) {
            reward = uint256(stepRewardMidPlain);
        } else if (steps > 7000) {
            reward = uint256(stepRewardHighPlain);
        }

        lastSubmitDay[msg.sender] = dayIndex;
        if (reward > 0) {
            token.mint(msg.sender, reward);
        }
        emit Submitted(msg.sender, dayIndex, steps, reward);
    }

    /**
     * @notice 每日一次：上传加密步数（steps=0 视为签到）。同态计算奖励并请求解密，在回调中铸造。
     */
    function submitDailyEncrypted(externalEuint64 _steps, bytes calldata proof) external {
        uint256 dayIndex = todayIndex();
        require(lastSubmitDay[msg.sender] != dayIndex, "already submitted today");

        euint64 steps = FHE.fromExternal(_steps, proof);

        // 区间：0 => base；(0,3000) => 0；[3000,7000] => mid；(7000, +inf) => high
        euint64 zero = FHE.asEuint64(0);
        euint64 threeK = FHE.asEuint64(3000);
        euint64 sevenK = FHE.asEuint64(7000);

        euint64 rewardIfSign = FHE.select(FHE.eq(steps, zero), baseSignReward, zero);
        euint64 rewardIfGe3k = FHE.select(FHE.ge(steps, threeK), stepRewardMid, zero);
        euint64 rewardIfLe7k = FHE.select(FHE.le(steps, sevenK), stepRewardMid, zero);
        euint64 rewardIfMid = FHE.select(
            FHE.eq(rewardIfGe3k, stepRewardMid),
            FHE.select(FHE.eq(rewardIfLe7k, stepRewardMid), stepRewardMid, zero),
            zero
        );
        euint64 rewardIfHigh = FHE.select(FHE.gt(steps, sevenK), stepRewardHigh, zero);

        euint64 reward = FHE.add(FHE.add(rewardIfSign, rewardIfMid), rewardIfHigh);

        // 更新加密累计积分
        if (!isTotalInitialized[msg.sender]) {
            encryptedTotalPoints[msg.sender] = zero;
            _authorizeHandle(encryptedTotalPoints[msg.sender]);
            isTotalInitialized[msg.sender] = true;
        }
        encryptedTotalPoints[msg.sender] = FHE.add(encryptedTotalPoints[msg.sender], reward);
        _authorizeHandle(encryptedTotalPoints[msg.sender]);

        lastSubmitDay[msg.sender] = dayIndex;

        // 请求解密奖励，回调中完成代币铸造
        bytes32[] memory cipherTexts = new bytes32[](1);
        cipherTexts[0] = FHE.toBytes32(reward);
        uint256 requestId = FHE.requestDecryption(cipherTexts, this.callbackReward.selector);
        _rewardRequests[requestId] = RewardRequest({user: msg.sender, dayIndex: dayIndex});

        emit SubmittedEncrypted(msg.sender, dayIndex, requestId);
    }

    /**
     * @notice 解密回调：将奖励明文铸造给用户
     * @param requestId 请求 ID
     * @param cleartexts 解密得到的明文字节（按 32 字节对齐存放）
     * @param decryptionProof 回调签名与证明
     */
    function callbackReward(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) external {
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        RewardRequest memory req = _rewardRequests[requestId];
        require(req.user != address(0), "invalid request");

        require(cleartexts.length >= 32, "invalid cleartexts");
        uint256 amount256;
        assembly {
            amount256 := mload(add(cleartexts, 0x20))
        }
        uint64 decryptedAmount = uint64(amount256);

        delete _rewardRequests[requestId];

        if (decryptedAmount > 0) {
            token.mint(req.user, decryptedAmount);
        }
        emit RewardMinted(req.user, req.dayIndex, decryptedAmount, requestId);
    }

    function getEncryptedTotalPoints(address user) external view returns (euint64) {
        return encryptedTotalPoints[user];
    }

    function _authorizeHandle(euint64 handle) private {
        FHE.allowThis(handle);
        FHE.allow(handle, msg.sender);
    }
}


