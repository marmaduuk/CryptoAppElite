import { ethers } from "hardhat";
import { writeFile } from "fs/promises";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
	console.log("开始部署到本地网络...");
	
	// 检查是否提供了私钥
	const privateKey = process.env.PRIVATE_KEY;
	if (privateKey) {
		console.log("使用环境变量中的私钥进行部署");
	} else {
		console.log("未提供私钥，使用默认账户");
	}
	
	const [deployer] = await ethers.getSigners();
	console.log("部署者地址:", deployer.address);
	console.log("部署者余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

	// 部署 MoveToken
	console.log("\n部署 MoveToken...");
	const MoveToken = await ethers.getContractFactory("MoveToken");
	const token = await MoveToken.deploy("Move Token", "MOVE");
	await token.waitForDeployment();
	const tokenAddress = await token.getAddress();
	console.log("MoveToken 地址:", tokenAddress);

	// 部署 SimpleActivityRewards (简化版本，用于本地测试)
	console.log("\n部署 SimpleActivityRewards...");
	const SimpleActivityRewards = await ethers.getContractFactory("SimpleActivityRewards");
	const ONE = 1n * 10n ** 18n; // 1 MOVE（18 位）
	const rewards = await SimpleActivityRewards.deploy(
		tokenAddress,
		ONE,        // 签到奖励：1 MOVE
		5n * ONE,   // 中等步数奖励：5 MOVE
		10n * ONE   // 高步数奖励：10 MOVE
	);
	await rewards.waitForDeployment();
	const rewardsAddress = await rewards.getAddress();
	console.log("SimpleActivityRewards 地址:", rewardsAddress);

	// 部署 MockEncryptedActivityRewards (简化版本，用于本地测试)
	console.log("\n部署 MockEncryptedActivityRewards...");
	const MockEncryptedActivityRewards = await ethers.getContractFactory("MockEncryptedActivityRewards");
	const encRewards = await MockEncryptedActivityRewards.deploy(
		tokenAddress,
		ONE,        // 签到奖励：1 MOVE
		5n * ONE,   // 中等步数奖励：5 MOVE
		10n * ONE   // 高步数奖励：10 MOVE
	);
	await encRewards.waitForDeployment();
	const encRewardsAddress = await encRewards.getAddress();
	console.log("MockEncryptedActivityRewards 地址:", encRewardsAddress);
	console.log("注意：此合约使用Mock加密，支持本地测试");

	// 设置奖励合约为铸币者
	console.log("\n设置代币铸币者...");
	const tx1 = await token.setMinter(rewardsAddress);
	await tx1.wait();
	console.log("代币铸币者设置完成");

	// 设置加密奖励合约为铸币者
	console.log("\n设置加密奖励合约为铸币者...");
	const tx2 = await token.setMinter(encRewardsAddress);
	await tx2.wait();
	console.log("加密奖励合约铸币者设置完成");

	// 保存部署信息
	const deploymentInfo = {
		network: "localhost",
		chainId: 31337,
		token: tokenAddress,
		rewards: rewardsAddress,
		encRewards: encRewardsAddress,
		deployer: deployer.address,
		deployedAt: new Date().toISOString()
	};

	await writeFile("./deployments-localhost.json", JSON.stringify(deploymentInfo, null, 2), { encoding: "utf-8" });
	console.log("\n部署信息已保存到 deployments-localhost.json");

	// 输出前端配置
	console.log("\n=== 前端配置 ===");
	console.log("请将以下配置复制到 frontend/src/config.ts:");
	console.log(`
export const CONFIG = {
	network: 'localhost',
	token: '${tokenAddress}',
	rewards: '${rewardsAddress}',
	encRewards: '${encRewardsAddress}'
}

export const FHEVM = {
	protocolId: 10001,
	ACL: '0x687820221192C5B662b25367F70076A37bc79b6c',
	Coprocessor: '0x848B0066793BcC60346Da1F49049357399B8D595',
	DecryptionOracle: '0xa02Cda4Ca3a71D7C46997716F4283aa851C28812',
	KMSVerifier: '0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC'
}`);

	console.log("\n部署完成！");
	console.log("现在可以启动前端开发服务器了。");
}

main().catch((e) => {
	console.error("部署失败:", e);
	process.exit(1);
});
