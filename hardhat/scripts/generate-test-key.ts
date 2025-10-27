import { ethers } from "hardhat";

async function main() {
	console.log("生成测试用私钥和地址...");
	
	// 生成随机钱包
	const wallet = ethers.Wallet.createRandom();
	
	console.log("\n=== 测试账户信息 ===");
	console.log("私钥:", wallet.privateKey);
	console.log("地址:", wallet.address);
	console.log("助记词:", wallet.mnemonic?.phrase);
	
	console.log("\n=== 使用方法 ===");
	console.log("1. 将私钥复制到 .env 文件中：");
	console.log(`   PRIVATE_KEY=${wallet.privateKey}`);
	console.log("\n2. 或者直接在命令中使用：");
	console.log(`   npm run deploy:local:key -- ${wallet.privateKey}`);
	
	console.log("\n⚠️  注意：这是测试用私钥，请勿用于主网！");
	console.log("⚠️  请确保在本地网络中为这个地址提供足够的测试ETH");
}

main().catch((e) => {
	console.error("生成失败:", e);
	process.exit(1);
});
