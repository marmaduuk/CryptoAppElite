import { ethers } from "hardhat";

async function main() {
  console.log("重置今天的提交记录...");
  
  const [deployer] = await ethers.getSigners();
  console.log("操作者地址:", deployer.address);
  
  // 读取部署信息
  const fs = require('fs');
  const deploymentInfo = JSON.parse(fs.readFileSync('./deployments-localhost.json', 'utf8'));
  
  const encRewardsAddress = deploymentInfo.encRewards;
  console.log("加密合约地址:", encRewardsAddress);
  
  // 获取合约实例
  const MockEncryptedActivityRewards = await ethers.getContractFactory("MockEncryptedActivityRewards");
  const contract = MockEncryptedActivityRewards.attach(encRewardsAddress);
  
  // 获取今天的索引
  const todayIndex = await contract.todayIndex();
  console.log("今天索引:", todayIndex.toString());
  
  // 检查当前用户的提交状态
  const lastSubmitDay = await contract.lastSubmitDay(deployer.address);
  console.log("最后提交日:", lastSubmitDay.toString());
  
  if (Number(lastSubmitDay) === Number(todayIndex)) {
    console.log("检测到今天已提交，正在重置...");
    
    // 调用重置函数
    const tx = await contract.resetTodaySubmission(deployer.address);
    await tx.wait();
    
    console.log("重置成功！现在可以重新提交了");
  } else {
    console.log("今天尚未提交，可以正常提交");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});