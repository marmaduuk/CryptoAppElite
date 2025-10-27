import { ethers } from "ethers";
import { 
  getMockRelayerInstance, 
  mockEncryptUint64For, 
  mockSubmitEncryptedSteps, 
  shouldUseMock
} from "./mock-fhevm";

let sdkInitialized = false;
let instancePromise: Promise<any> | null = null;

export async function getRelayerInstance() {
	// 如果应该使用Mock模式，返回Mock实例
	if (shouldUseMock()) {
		console.log('🔧 使用Mock FHEVM模式');
		return getMockRelayerInstance();
	}

	if (instancePromise) return instancePromise;
	if (!window.relayerSDK) throw new Error("Relayer SDK not loaded on window");
	const { initSDK, createInstance, SepoliaConfig } = window.relayerSDK;
	if (!sdkInitialized) {
		await initSDK({ thread: 0 });
		sdkInitialized = true;
	}
	instancePromise = createInstance(SepoliaConfig);
	return instancePromise;
}

export async function encryptUint64For(contractAddress: string, userAddress: string, value: bigint) {
	// 如果应该使用Mock模式，使用Mock函数
	if (shouldUseMock()) {
		return mockEncryptUint64For(contractAddress, userAddress, value);
	}

	const relayer = await getRelayerInstance();
	const encrypted = relayer
		.createEncryptedInput(contractAddress, userAddress)
		.add64(value)
		.encrypt();
	return encrypted as { handles: string[]; inputProof: string };
}

export async function submitEncryptedSteps(signer: ethers.Signer, contractAddress: string, steps: bigint) {
	// 如果应该使用Mock模式，使用Mock函数
	if (shouldUseMock()) {
		return mockSubmitEncryptedSteps(signer, contractAddress, steps);
	}

	const { handles, inputProof } = await encryptUint64For(contractAddress, await signer.getAddress(), steps);
	const iface = new ethers.Interface([
		"function submitDailyEncrypted(bytes32 _steps, bytes proof)"
	]);
	const data = iface.encodeFunctionData("submitDailyEncrypted", [ handles[0], inputProof ]);
	return signer.sendTransaction({ to: contractAddress, data });
}
