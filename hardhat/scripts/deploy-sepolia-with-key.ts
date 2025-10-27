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
		console.log("  npx hardhat run scripts/deploy-sepolia-with-key.ts --network sepolia -- 0x1234...");
		console.log("  或者设置环境变量 PRIVATE_KEY=0x1234...");
		process.exit(1);
	}

	console.log("开始部署到Sepolia测试网...");
	console.log("使用私钥:", privateKey.slice(0, 10) + "...");
	
	// 创建自定义钱包
	const wallet = new ethers.Wallet(privateKey, ethers.provider);
	console.log("部署者地址:", wallet.address);
	console.log("部署者余额:", ethers.formatEther(await ethers.provider.getBalance(wallet.address)), "ETH");

	const provider = ethers.provider;
	async function feeOverrides() {
		const fee = await provider.getFeeData();
		const oneGwei = 1_000_000_000n;
		const maxPriorityFeePerGas = fee.maxPriorityFeePerGas && fee.maxPriorityFeePerGas > 0n ? fee.maxPriorityFeePerGas : 2n * oneGwei;
		const maxFeePerGas = fee.maxFeePerGas && fee.maxFeePerGas > 0n ? (fee.maxFeePerGas * 12n) / 10n : 30n * oneGwei;
		return { maxFeePerGas, maxPriorityFeePerGas } as const;
	}

	const MoveToken = await ethers.getContractFactory("MoveToken");
	const token = await MoveToken.connect(wallet).deploy("Move Token", "MOVE", await feeOverrides());
	await token.waitForDeployment();
	console.log("MoveToken:", await token.getAddress());

	const ActivityRewards = await ethers.getContractFactory("ActivityRewards");
	const ONE = 1n * 10n ** 18n; // 1 MOVE（18 位）
	const rewards = await ActivityRewards.connect(wallet).deploy(
		await token.getAddress(),
		ONE,
		5n * ONE,
		10n * ONE,
		await feeOverrides()
	);
	await rewards.waitForDeployment();
	console.log("ActivityRewards:", await rewards.getAddress());

	// 设置奖励合约为铸币者（仅设置一次，避免被覆盖）
	const tx1 = await token.connect(wallet).setMinter(await rewards.getAddress(), await feeOverrides());
	await tx1.wait();
	console.log("Token minter set to ActivityRewards");

	// 部署 FHE 加密版本（演示：不在回调中铸币，仅更新密文积分并抛事件）
	const EncryptedActivityRewards = await ethers.getContractFactory("EncryptedActivityRewards");
	const encRewards = await EncryptedActivityRewards.connect(wallet).deploy(
		await token.getAddress(),
		ONE,
		5n * ONE,
		10n * ONE,
		await feeOverrides()
	);
	await encRewards.waitForDeployment();
	console.log("EncryptedActivityRewards:", await encRewards.getAddress());

	// 将部署地址写入本地文件，便于前端读取或手动复制
	const addrs = {
		network: "sepolia",
		chainId: 11155111,
		token: await token.getAddress(),
		rewards: await rewards.getAddress(),
		encRewards: await encRewards.getAddress(),
		deployer: wallet.address,
		deployedAt: new Date().toISOString()
	};
	await writeFile("./deployments-sepolia.json", JSON.stringify(addrs, null, 2), { encoding: "utf-8" });
	console.log("Saved deployments to deployments-sepolia.json");

	// 输出前端配置
	console.log("\n=== 前端配置 ===");
	console.log("请将以下配置复制到 frontend/src/config.ts:");
	console.log(`
export const SEPOLIA_CONFIG = {
	network: 'sepolia',
	chainId: 11155111,
	token: '${await token.getAddress()}',
	rewards: '${await rewards.getAddress()}',
	encRewards: '${await encRewards.getAddress()}'
}`);
}

main().catch((e) => {
	console.error("部署失败:", e);
	process.exit(1);
});
