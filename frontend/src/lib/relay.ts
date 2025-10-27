import { GelatoRelay } from "@gelatonetwork/relay-sdk";

export const relay = new GelatoRelay();

export async function relaySponsoredCall(chainId: number, target: string, data: string, apiKey: string) {
	const request = {
		chainId,
		target,
		data,
		isRelayContext: true
	};
	const response = await relay.sponsoredCall(request as any, apiKey);
	return response;
}
