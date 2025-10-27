// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MoveToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleActivityRewards (简化版本，用于本地测试)
 * @notice 记录每日步数/签到，并按区间发放积分（以 MoveToken 代币计）
 */
contract SimpleActivityRewards is Ownable {
    MoveToken public immutable token;

    uint256 public constant DAY = 1 days;

    // 奖励配置
    uint64 public baseSignReward;     // 签到基础奖励
    uint64 public stepRewardMid;      // 3000-7000 步奖励
    uint64 public stepRewardHigh;     // >7000 步奖励

    mapping(address => uint256) public lastSubmitDay; // 每日提交记录

    // 用户积分统计
    mapping(address => uint256) public totalPoints;

    event Submitted(address indexed user, uint256 dayIndex, uint256 steps, uint256 reward);
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
        return block.timestamp / DAY;
    }

    /**
     * @notice 提交每日步数或签到
     * @param steps 步数，0表示签到
     */
    function submitDaily(uint256 steps) external {
        uint256 dayIndex = todayIndex();
        // 移除每日只能提交一次的限制，允许每天多次提交

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
        
        emit Submitted(msg.sender, dayIndex, steps, reward);
    }

    function getUserPoints(address user) external view returns (uint256) {
        return totalPoints[user];
    }

    function getLastSubmitDay(address user) external view returns (uint256) {
        return lastSubmitDay[user];
    }
}
