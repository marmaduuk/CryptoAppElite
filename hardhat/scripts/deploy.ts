import { ethers } from "hardhat";
import { writeFile } from "fs/promises";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
	// 检查是否提供了私钥
	const privateKey = process.env.PRIVATE_KEY;
	if (privateKey) {
		console.log("使用环境变量中的私钥进行部署");
	} else {
		console.log("未提供私钥，使用默认账户");
	}
	
	const [deployer] = await ethers.getSigners();
	console.log("Deployer:", deployer.address);

	const provider = ethers.provider;
	async function feeOverrides() {
		const fee = await provider.getFeeData();
		const oneGwei = 1_000_000_000n;
		const maxPriorityFeePerGas = fee.maxPriorityFeePerGas && fee.maxPriorityFeePerGas > 0n ? fee.maxPriorityFeePerGas : 2n * oneGwei;
		const maxFeePerGas = fee.maxFeePerGas && fee.maxFeePerGas > 0n ? (fee.maxFeePerGas * 12n) / 10n : 30n * oneGwei;
		return { maxFeePerGas, maxPriorityFeePerGas } as const;
	}

	const MoveToken = await ethers.getContractFactory("MoveToken");
	const token = await MoveToken.deploy("Move Token", "MOVE", await feeOverrides());
	await token.waitForDeployment();
	console.log("MoveToken:", await token.getAddress());

	const ActivityRewards = await ethers.getContractFactory("ActivityRewards");
	const ONE = 1n * 10n ** 18n; // 1 MOVE（18 位）
	const rewards = await ActivityRewards.deploy(
		await token.getAddress(),
		ONE,
		5n * ONE,
		10n * ONE,
		await feeOverrides()
	);
	await rewards.waitForDeployment();
	console.log("ActivityRewards:", await rewards.getAddress());

	// 设置奖励合约为铸币者（仅设置一次，避免被覆盖）
	const tx1 = await token.setMinter(await rewards.getAddress(), await feeOverrides());
	await tx1.wait();
	console.log("Token minter set to ActivityRewards");

	// 部署 FHE 加密版本（演示：不在回调中铸币，仅更新密文积分并抛事件）
	const EncryptedActivityRewards = await ethers.getContractFactory("EncryptedActivityRewards");
	const encRewards = await EncryptedActivityRewards.deploy(
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
		token: await token.getAddress(),
		rewards: await rewards.getAddress(),
		encRewards: await encRewards.getAddress()
	};
	await writeFile("./deployments-sepolia.json", JSON.stringify(addrs, null, 2), { encoding: "utf-8" });
	console.log("Saved deployments to deployments-sepolia.json");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});


