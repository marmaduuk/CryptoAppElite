// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "./config/SepoliaConfig.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./MoveToken.sol";

/**
 * @title EncryptedActivityRewards (FHE 合约)
 * @notice 所有用户提交与链上计算均在同态加密下进行
 */
contract EncryptedActivityRewards is SepoliaConfig, Ownable {
    MoveToken public immutable token;

    // 加密常量参数（以 u64 表示的代币最小单位）
    euint64 private baseSignReward;
    euint64 private stepRewardMid;
    euint64 private stepRewardHigh;

    // 用户累计积分（加密）
    mapping(address => euint64) private encryptedTotalPoints;
    mapping(address => bool) private isTotalInitialized; // 明文初始化标志，避免对密文做明文分支
    mapping(address => uint256) public lastSubmitDay;

    event Submitted(address indexed user, uint256 dayIndex, uint64 stepsPlain, uint64 rewardPlainApprox);
    event ConfigUpdated();

    constructor(MoveToken _token, uint64 base_, uint64 mid_, uint64 high_) Ownable(msg.sender) {
        token = _token;
        baseSignReward = FHE.asEuint64(base_);
        stepRewardMid = FHE.asEuint64(mid_);
        stepRewardHigh = FHE.asEuint64(high_);

        _authorizeHandle(baseSignReward);
        _authorizeHandle(stepRewardMid);
        _authorizeHandle(stepRewardHigh);
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
        return block.timestamp / 1 days;
    }

    /**
     * @notice 提交每日步数（加密）。steps 为外部密文，合约内做区间判断与奖励选择。
     * @dev 为了演示奖励铸造，这里会把奖励明文近似值通过事件抛出，实际生产应避免泄露。
     */
    function submitDailyEncrypted(externalEuint64 _steps, bytes calldata proof) external {
        uint256 dayIndex = todayIndex();
        require(lastSubmitDay[msg.sender] != dayIndex, "already submitted today");

        euint64 steps = FHE.fromExternal(_steps, proof);

        // 区间: <3000 => 0, 3000-7000 => mid, >7000 => high，steps==0 视为签到奖励 base
        euint64 zero = FHE.asEuint64(0);
        euint64 threeK = FHE.asEuint64(3000);
        euint64 sevenK = FHE.asEuint64(7000);

        // 以比较组合的形式选取奖励：
        euint64 rewardIfSign = FHE.select(FHE.eq(steps, zero), baseSignReward, zero);
        // (steps >= 3000 && steps <= 7000)
        // 一些版本未必导出 and，这里用两次 select 累加的方式兼容：
        euint64 rewardIfGe3k = FHE.select(FHE.ge(steps, threeK), stepRewardMid, zero);
        euint64 rewardIfLe7k = FHE.select(FHE.le(steps, sevenK), stepRewardMid, zero);
        euint64 rewardIfMid = FHE.select(FHE.eq(rewardIfGe3k, stepRewardMid), FHE.select(FHE.eq(rewardIfLe7k, stepRewardMid), stepRewardMid, zero), zero);
        euint64 rewardIfHigh = FHE.select(FHE.gt(steps, sevenK), stepRewardHigh, zero);

        euint64 reward = FHE.add(FHE.add(rewardIfSign, rewardIfMid), rewardIfHigh);

        // 记录累计积分（加密相加）
        if (!isTotalInitialized[msg.sender]) {
            encryptedTotalPoints[msg.sender] = zero;
            _authorizeHandle(encryptedTotalPoints[msg.sender]);
            isTotalInitialized[msg.sender] = true;
        }
        encryptedTotalPoints[msg.sender] = FHE.add(encryptedTotalPoints[msg.sender], reward);
        _authorizeHandle(encryptedTotalPoints[msg.sender]);

        lastSubmitDay[msg.sender] = dayIndex;

        // 铸造奖励（需要一个明文数额）；这里采用 reveal-request 流转较复杂
        // 为演示，允许前端在本地持有明文奖励并用 relayer 走另一笔明文 mint（或用固定最小单位演示）
        // 简化：将奖励明文近似值通过事件抛出（以安全换简化，生产不建议）。
        uint64 approx = 0;
        // 尝试从密文中提取受控揭示值的场景一般使用 FHE.requestDecryption，本 demo 用事件近似值 0。
        emit Submitted(msg.sender, dayIndex, 0, approx);
    }

    function getEncryptedTotalPoints(address user) external view returns (euint64) {
        return encryptedTotalPoints[user];
    }

    function _authorizeHandle(euint64 handle) private {
        FHE.allowThis(handle);
        FHE.allow(handle, msg.sender);
    }
}


