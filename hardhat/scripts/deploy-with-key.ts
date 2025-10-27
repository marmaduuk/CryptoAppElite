import { ethers } from "hardhat";
import { writeFile } from "fs/promises";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
	// 从命令行参数获取私钥
	const args = process.argv.slice(2);
	const privateKey = args[0] || process.env.PRIVATE_KEY;
	
	if (!privateKey) {
		console.error("错误：请提供私钥");
		console.log("使用方法：");
		console.log("  npx hardhat run scripts/deploy-with-key.ts --network localhost -- 0x1234...");
		console.log("  或者设置环境变量 PRIVATE_KEY=0x1234...");
		process.exit(1);
	}

	console.log("开始部署到本地网络...");
	console.log("使用私钥:", privateKey.slice(0, 10) + "...");
	
	// 创建自定义钱包
	const wallet = new ethers.Wallet(privateKey, ethers.provider);
	console.log("部署者地址:", wallet.address);
	console.log("部署者余额:", ethers.formatEther(await ethers.provider.getBalance(wallet.address)), "ETH");

	// 部署 MoveToken
	console.log("\n部署 MoveToken...");
	const MoveToken = await ethers.getContractFactory("MoveToken");
	const token = await MoveToken.connect(wallet).deploy("Move Token", "MOVE");
	await token.waitForDeployment();
	const tokenAddress = await token.getAddress();
	console.log("MoveToken 地址:", tokenAddress);

	// 部署 SimpleActivityRewards (简化版本，用于本地测试)
	console.log("\n部署 SimpleActivityRewards...");
	const SimpleActivityRewards = await ethers.getContractFactory("SimpleActivityRewards");
	const ONE = 1n * 10n ** 18n; // 1 MOVE（18 位）
	const rewards = await SimpleActivityRewards.connect(wallet).deploy(
		tokenAddress,
		ONE,        // 签到奖励：1 MOVE
		5n * ONE,   // 中等步数奖励：5 MOVE
		10n * ONE   // 高步数奖励：10 MOVE
	);
	await rewards.waitForDeployment();
	const rewardsAddress = await rewards.getAddress();
	console.log("SimpleActivityRewards 地址:", rewardsAddress);

	// 设置奖励合约为铸币者
	console.log("\n设置代币铸币者...");
	const tx1 = await token.connect(wallet).setMinter(rewardsAddress);
	await tx1.wait();
	console.log("代币铸币者设置完成");

	// 注意：EncryptedActivityRewards 需要 FHEVM 支持，在本地网络中跳过
	console.log("\n注意：EncryptedActivityRewards 需要 FHEVM 支持，在本地网络中跳过");
	const encRewardsAddress = "0x0000000000000000000000000000000000000000";

	// 保存部署信息
	const deploymentInfo = {
		network: "localhost",
		chainId: 31337,
		token: tokenAddress,
		rewards: rewardsAddress,
		encRewards: encRewardsAddress,
		deployer: wallet.address,
		deployedAt: new Date().toISOString()
	};

	await writeFile("./deployments-localhost.json", JSON.stringify(deploymentInfo, null, 2), { encoding: "utf-8" });
	console.log("\n部署信息已保存到 deployments-localhost.json");

	// 输出前端配置
	console.log("\n=== 前端配置 ===");
	console.log("请将以下配置复制到 frontend/src/config.ts:");
	console.log(`
export const LOCAL_CONFIG = {
	network: 'localhost',
	chainId: 31337,
	token: '${tokenAddress}',
	rewards: '${rewardsAddress}',
	encRewards: '${encRewardsAddress}'
}`);

	console.log("\n部署完成！");
	console.log("现在可以启动前端开发服务器了。");
}

main().catch((e) => {
	console.error("部署失败:", e);
	process.exit(1);
});
