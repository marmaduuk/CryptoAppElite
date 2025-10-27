import { ethers } from "hardhat";
import { writeFile } from "fs/promises";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const mnemonic = process.env.MNEMONIC;
    const derivationPath = process.env.DERIVATION_PATH || "m/44'/60'/0'/0";
    const mnemonicIndex = process.env.MNEMONIC_INDEX ? parseInt(process.env.MNEMONIC_INDEX, 10) : 0;

    if (!mnemonic) {
        console.error("错误：请通过 MNEMONIC 提供助记词");
        console.log("例如 (PowerShell): $env:MNEMONIC='word1 word2 ... word12'");
        process.exit(1);
    }

    const wallet = ethers.Wallet.fromPhrase(mnemonic, undefined, derivationPath + "/" + mnemonicIndex).connect(ethers.provider);
    console.log("开始部署到 Sepolia 测试网...");
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

    const ONE = 1n * 10n ** 18n;

    const MoveToken = await ethers.getContractFactory("MoveToken");
    const token = await MoveToken.connect(wallet).deploy("Move Token", "MOVE", await feeOverrides());
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log("MoveToken:", tokenAddress);

    const ActivityRewards = await ethers.getContractFactory("ActivityRewards");
    const rewards = await ActivityRewards.connect(wallet).deploy(
        tokenAddress,
        ONE,
        5n * ONE,
        10n * ONE,
        await feeOverrides()
    );
    await rewards.waitForDeployment();
    const rewardsAddress = await rewards.getAddress();
    console.log("ActivityRewards:", rewardsAddress);

    const tx1 = await (await ethers.getContractAt("MoveToken", tokenAddress)).connect(wallet).setMinter(rewardsAddress, await feeOverrides());
    await tx1.wait();
    console.log("Token minter set to ActivityRewards");

    const EncryptedActivityRewards = await ethers.getContractFactory("EncryptedActivityRewards");
    const encRewards = await EncryptedActivityRewards.connect(wallet).deploy(
        tokenAddress,
        ONE,
        5n * ONE,
        10n * ONE,
        await feeOverrides()
    );
    await encRewards.waitForDeployment();
    const encRewardsAddress = await encRewards.getAddress();
    console.log("EncryptedActivityRewards:", encRewardsAddress);

    const addrs = {
        network: "sepolia",
        chainId: 11155111,
        token: tokenAddress,
        rewards: rewardsAddress,
        encRewards: encRewardsAddress,
        deployer: wallet.address,
        deployedAt: new Date().toISOString()
    };
    await writeFile("./deployments-sepolia.json", JSON.stringify(addrs, null, 2), { encoding: "utf-8" });
    console.log("Saved deployments to deployments-sepolia.json");

    console.log("\n=== 前端配置 ===");
    console.log("请将以下配置复制到 frontend/src/config.ts:");
    console.log(`
export const SEPOLIA_CONFIG = {
    network: 'sepolia',
    chainId: 11155111,
    token: '${tokenAddress}',
    rewards: '${rewardsAddress}',
    encRewards: '${encRewardsAddress}'
}`);
}

main().catch((e) => {
    console.error("部署失败:", e);
    process.exit(1);
});


