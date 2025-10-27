// Extend global Window to include relayerSDK (loaded from CDN)
export {};

declare global {
	interface Window {
		relayerSDK?: {
			initSDK: ({ tfheParams, kmsParams, thread }?: { tfheParams?: any; kmsParams?: any; thread?: number }) => Promise<boolean>;
			createInstance: (config: any) => Promise<any>;
			SepoliaConfig: any;
			[key: string]: any;
		};
	}
}
