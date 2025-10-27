// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MoveToken.sol";

/**
 * @title MockEncryptedActivityRewards (简化版本，用于本地测试)
 * @notice 模拟FHE加密奖励合约，使用Mock加密数据
 */
contract MockEncryptedActivityRewards is Ownable {
    MoveToken public immutable token;

    // 奖励配置
    uint64 public baseSignReward;     // 签到基础奖励
    uint64 public stepRewardMid;      // 3000-7000 步奖励
    uint64 public stepRewardHigh;     // >7000 步奖励

    mapping(address => uint256) public lastSubmitDay; // 每日提交记录
    mapping(address => uint256) public totalPoints;   // 用户积分统计

    event Submitted(address indexed user, uint256 dayIndex, bytes32 stepsHandle, bytes proof, uint256 reward);
    event ConfigUpdated();

    constructor(MoveToken _token, uint64 base_, uint64 mid_, uint64 high_) Ownable(msg.sender) {
        token = _token;
        baseSignReward = base_;
        stepRewardMid = mid_;
        stepRewardHigh = high_;
    }

    function setRewards(uint64 base_, uint64 mid_, uint64 high_) external onlyOwner {
        baseSignReward = base_;
        stepRewardMid = mid_;
        stepRewardHigh = high_;
        emit ConfigUpdated();
    }

    function todayIndex() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /**
     * @notice 提交加密的每日步数或签到
     * @param _steps 加密的步数句柄（Mock数据）
     * @param proof 加密证明（Mock数据）
     */
    function submitDailyEncrypted(bytes32 _steps, bytes calldata proof) external {
        uint256 dayIndex = todayIndex();
        // 移除每日只能提交一次的限制，允许每天多次提交
        
        // 从加密句柄中提取步数（Mock解密过程）
        uint256 steps = extractStepsFromHandle(_steps);
        
        uint256 reward = 0;
        if (steps == 0) {
            // 签到奖励
            reward = uint256(baseSignReward);
        } else if (steps >= 3000 && steps <= 7000) {
            // 中等步数奖励
            reward = uint256(stepRewardMid);
        } else if (steps > 7000) {
            // 高步数奖励
            reward = uint256(stepRewardHigh);
        }

        // 更新最后提交日为今天（但不检查是否已提交）
        lastSubmitDay[msg.sender] = dayIndex;
        totalPoints[msg.sender] += reward;
        
        if (reward > 0) {
            token.mint(msg.sender, reward);
        }
        
        emit Submitted(msg.sender, dayIndex, _steps, proof, reward);
    }

    /**
     * @notice 从加密句柄中提取步数（Mock解密）
     * @param handle 加密句柄
     * @return steps 解密后的步数
     */
    function extractStepsFromHandle(bytes32 handle) internal pure returns (uint256) {
        // 从句柄的前16个字符中提取步数
        // 格式：0x0000000000001194... -> 1194 (hex) -> 4500 (decimal)
        uint256 steps = uint256(handle) >> 192; // 取前64位
        return steps;
    }

    function getUserPoints(address user) external view returns (uint256) {
        return totalPoints[user];
    }

    function getLastSubmitDay(address user) external view returns (uint256) {
        return lastSubmitDay[user];
    }

    /**
     * @notice 重置今天的提交记录（仅用于测试）
     * @param user 要重置的用户地址
     */
    function resetTodaySubmission(address user) external onlyOwner {
        uint256 dayIndex = todayIndex();
        if (lastSubmitDay[user] == dayIndex) {
            lastSubmitDay[user] = 0;
            emit ConfigUpdated(); // 使用现有事件
        }
    }
}
