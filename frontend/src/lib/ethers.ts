import { ethers } from "ethers";

export function getProvider() {
	const anyWindow = window as any;
	if (anyWindow.ethereum) {
		return new ethers.BrowserProvider(anyWindow.ethereum);
	}
	throw new Error("未检测到钱包插件。请安装 MetaMask 或其他 Web3 钱包扩展程序。");
}

// 检查是否安装了钱包
export function isWalletInstalled(): boolean {
	const anyWindow = window as any;
	return !!anyWindow.ethereum;
}

// 添加本地网络到MetaMask
export async function addLocalNetwork() {
	const anyWindow = window as any;
	if (!anyWindow.ethereum) {
		throw new Error("未检测到钱包插件。请安装 MetaMask 或其他 Web3 钱包扩展程序。");
	}

	try {
		await anyWindow.ethereum.request({
			method: 'wallet_addEthereumChain',
			params: [{
				chainId: '0x7A69', // 31337 in hex
				chainName: 'Hardhat Local',
				nativeCurrency: {
					name: 'Ethereum',
					symbol: 'ETH',
					decimals: 18,
				},
				rpcUrls: ['http://localhost:8545'],
				blockExplorerUrls: null,
			}],
		});
	} catch (error: any) {
		if (error.code === 4902) {
			// 网络已存在，忽略错误
			console.log('Local network already added');
		} else {
			throw error;
		}
	}
}

export async function getSigner() {
	const provider = getProvider();
	await provider.send("eth_requestAccounts", []);
	return await provider.getSigner();
}
