import { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import { getSigner } from '../lib/ethers'
import { LOCAL_CONFIG, SEPOLIA_CONFIG } from '../config'
import { Layout, Card, Descriptions, Table, Typography, Space, Tag, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'

const rewardsAbi = [
	"event Submitted(address indexed user, uint256 dayIndex, uint256 steps, uint256 reward)",
	"function lastSubmitDay(address) view returns (uint256)",
]

// 兼容两种加密合约：
// MockEncryptedActivityRewards: Submitted(address,uint256,bytes32,bytes,uint256)
// EncryptedActivityRewards (FHE 版): Submitted(address,uint256,uint64,uint64)
const encRewardsAbiCandidates = [
	[
		"event Submitted(address indexed user, uint256 dayIndex, bytes32 stepsHandle, bytes proof, uint256 reward)",
		"function lastSubmitDay(address) view returns (uint256)",
	],
	[
		"event Submitted(address indexed user, uint256 dayIndex, uint64 stepsPlain, uint64 rewardPlainApprox)",
		"function lastSubmitDay(address) view returns (uint256)",
	]
]
const erc20Abi = [
	"function balanceOf(address) view returns (uint256)",
	"function decimals() view returns (uint8)",
	"function symbol() view returns (string)"
]

// 从加密句柄中提取步数（模拟解密）
function extractStepsFromHandle(handle: string): number {
	try {
		// 从句柄的前16个字符中提取步数
		// 格式：0x0000000000001194... -> 1194 (hex) -> 4500 (decimal)
		const handleData = handle.slice(2); // 去掉0x前缀
		const stepsHex = handleData.slice(0, 16); // 取前16个字符
		return parseInt(stepsHex, 16);
	} catch (error) {
		console.error('提取步数失败:', error);
		return 0;
	}
}

export default function Results() {
	const [account, setAccount] = useState<string>('')
	const [tokenInfo, setTokenInfo] = useState<{symbol:string,decimals:number,balance:string}>({symbol:'',decimals:18,balance:'0'})
	const [todaySubmitted, setTodaySubmitted] = useState<boolean>(false)
	const [logs, setLogs] = useState<Array<{tx:string, user:string, dayIndex:string, steps:string, reward:string}>>([])
    const [explorerBase, setExplorerBase] = useState<string>('https://sepolia.etherscan.io')

	const todayIndex = useMemo(()=> Math.floor(Date.now() / 1000 / 86400), [])

	useEffect(()=>{
		(async () => {
			const signer = await getSigner()
			const addr = await signer.getAddress()
			setAccount(addr)

			// 根据当前链ID选择地址配置
			const net = await signer.provider.getNetwork()
			const isSepolia = Number(net.chainId) === SEPOLIA_CONFIG.chainId
			const cfg = isSepolia ? SEPOLIA_CONFIG : LOCAL_CONFIG
			setExplorerBase(isSepolia ? 'https://sepolia.etherscan.io' : '')
			const tokenAddress = cfg.token
			const rewardsAddress = cfg.rewards
			const encRewardsAddress = cfg.encRewards

			const provider = signer.provider
			// 读取代币信息与余额（若地址没有代码则跳过并给出默认值）
			const code = await provider.getCode(tokenAddress)
			if (code && code !== '0x') {
				const erc20 = new ethers.Contract(tokenAddress, erc20Abi, provider)
				try {
					const [symbol, decimals, rawBal] = await Promise.all([
						erc20.symbol(),
						erc20.decimals(),
						erc20.balanceOf(addr)
					])
					setTokenInfo({ symbol, decimals, balance: ethers.formatUnits(rawBal, decimals) })
				} catch (e) {
					setTokenInfo({ symbol: 'MOVE', decimals: 18, balance: '0' })
				}
			} else {
				// 合约未部署或地址不匹配
				setTokenInfo({ symbol: 'MOVE', decimals: 18, balance: '0' })
			}

			// 今日是否已提交（检查两个合约）
			const rewards = new ethers.Contract(rewardsAddress, rewardsAbi, provider)
			const encRewards = new ethers.Contract(encRewardsAddress, encRewardsAbiCandidates[0], provider)
			
			const [lastDayNormal, lastDayEnc] = await Promise.all([
				rewards.lastSubmitDay(addr).catch(()=>0),
				encRewards.lastSubmitDay(addr).catch(()=>0)
			])
			setTodaySubmitted(Number(lastDayNormal) === todayIndex || Number(lastDayEnc) === todayIndex)

			// 查询两个合约的 Submitted 事件
			const rewardsIface = new ethers.Interface(rewardsAbi)
			// 同时支持加密合约的两种事件签名（Mock 与 FHE 版）
			const encIfaces: ethers.Interface[] = encRewardsAbiCandidates.map(abi => new ethers.Interface(abi))

			const latest = await provider.getBlockNumber()
			let from = latest > 10000 ? latest - 10000 : 0 // 扩大查询范围，从10000个区块开始

			console.log('🔍 开始查询事件...')
			console.log('📊 当前区块号:', latest)
			console.log('🔄 查询区块范围:', from, '到', latest)
			console.log('🏠 普通合约地址:', rewardsAddress)
			console.log('🔐 加密合约地址:', encRewardsAddress)
			
			// 查询普通合约事件（仅当地址有代码时）
			let normalLogs: any[] = []
			const rewardsCode = rewardsAddress ? await provider.getCode(rewardsAddress) : '0x'
			console.log('🏠 普通合约代码检查:', rewardsCode !== '0x' ? '有代码' : '无代码')

			if (rewardsAddress && rewardsAddress !== '0x0000000000000000000000000000000000000000' && rewardsCode !== '0x') {
            const normalEvent = rewardsIface.getEvent("Submitted")!;
            const normalFilter = {
            	address: rewardsAddress,
            	topics: [normalEvent!.topicHash]
            }
				console.log('🔍 查询普通合约事件，过滤器:', normalFilter)
				normalLogs = await provider.getLogs({ ...normalFilter, fromBlock: from, toBlock: latest })
				console.log('📝 普通合约事件数量:', normalLogs.length)
			}
			// 如果没有结果，扩大查询范围
			if (normalLogs.length === 0 && from > 0 && rewardsAddress && rewardsCode !== '0x') {
				from = latest > 20000 ? latest - 20000 : 0
				console.log('🔄 扩大查询范围到:', from, '到', latest)
                const normalEvent2 = rewardsIface.getEvent("Submitted")!;
                const normalFilter = {
                	address: rewardsAddress,
                	topics: [normalEvent2!.topicHash]
                }
				normalLogs = await provider.getLogs({ ...normalFilter, fromBlock: from, toBlock: latest })
				console.log('📝 扩大范围后普通合约事件数量:', normalLogs.length)
			}
			
			// 查询加密合约事件（分别用两种 topic 过滤并合并）
			let encLogs: any[] = []
			if (encRewardsAddress && encRewardsAddress !== '0x0000000000000000000000000000000000000000') {
				console.log('🔐 开始查询加密合约事件...')
				for (let i = 0; i < encIfaces.length; i++) {
					const iface = encIfaces[i]
                    const encEvent = iface.getEvent("Submitted")!;
                    const encFilter = {
                        address: encRewardsAddress,
                        topics: [encEvent!.topicHash]
                    }
					console.log(`🔍 查询加密合约事件 (接口${i})，过滤器:`, encFilter)
					const logs = await provider.getLogs({ ...encFilter, fromBlock: from, toBlock: latest })
					console.log(`📝 加密合约事件 (接口${i}) 数量:`, logs.length)
					encLogs = encLogs.concat(logs)
				}
				// 去重：按 txHash+logIndex 去重
				const seen = new Set<string>()
				const beforeDedup = encLogs.length
				encLogs = encLogs.filter((l: any) => {
					const key = `${l.transactionHash}-${l.logIndex}`
					if (seen.has(key)) return false
					seen.add(key)
					return true
				})
				console.log(`🧹 去重后加密合约事件数量: ${encLogs.length} (去重前: ${beforeDedup})`)

				if (encLogs.length === 0 && from > 0) {
					from = latest > 20000 ? latest - 20000 : 0
					console.log('🔄 扩大加密合约查询范围到:', from, '到', latest)
					for (let i = 0; i < encIfaces.length; i++) {
						const iface = encIfaces[i]
                        const encEvent2 = iface.getEvent("Submitted")!;
                        const encFilter = {
                            address: encRewardsAddress,
                            topics: [encEvent2!.topicHash]
                        }
						const logs = await provider.getLogs({ ...encFilter, fromBlock: from, toBlock: latest })
						console.log(`📝 扩大范围后加密合约事件 (接口${i}) 数量:`, logs.length)
						encLogs = encLogs.concat(logs)
					}
					const seen2 = new Set<string>()
					const beforeDedup2 = encLogs.length
					encLogs = encLogs.filter((l: any) => {
						const key = `${l.transactionHash}-${l.logIndex}`
						if (seen2.has(key)) return false
						seen2.add(key)
						return true
					})
					console.log(`🧹 扩大范围后去重加密合约事件数量: ${encLogs.length} (去重前: ${beforeDedup2})`)
				}
			} else {
				console.log('🔐 加密合约地址无效，跳过查询')
			}
			
			// 解析普通合约事件
			console.log('🔧 开始解析普通合约事件...')
            const normalParsed = normalLogs.map(l => {
				try {
					const parsedLog = rewardsIface.parseLog(l)
					if (!parsedLog) {
						console.warn('⚠️ 无法解析普通合约日志:', l)
						return null
					}
					const { user, dayIndex, steps, reward } = parsedLog.args as any
					return {
						tx: l.transactionHash,
						user,
						dayIndex: String(dayIndex),
						steps: String(steps),
						reward: String(reward)
					}
				} catch (error) {
					console.error('❌ 解析普通合约事件失败:', error, l)
					return null
				}
            }).filter((x): x is { tx: string; user: string; dayIndex: string; steps: string; reward: string } => Boolean(x))
			
			// 解析加密合约事件（兼容两种格式）
			console.log('🔧 开始解析加密合约事件...')
            const encParsed = encLogs.map(l => {
				let parsedLog: ethers.LogDescription | null = null
				let parsedIndex = -1
				for (let i = 0; i < encIfaces.length; i++) {
					try {
						parsedLog = encIfaces[i].parseLog(l)
						parsedIndex = i
						break
					} catch {}
				}
				if (!parsedLog) {
					console.warn('⚠️ 无法解析加密合约日志:', l)
					return null
				}

				const args = parsedLog.args as any
				let steps = '0'
				let reward = '0'
				let eventType = 'unknown'

				if (args.stepsHandle !== undefined) {
					// Mock 版
					eventType = 'Mock版'
					steps = String(extractStepsFromHandle(args.stepsHandle))
					reward = String(args.reward)
				} else if (args.stepsPlain !== undefined) {
					// FHE 版，仅用于展示（合约里 rewardPlainApprox 为近似/演示值）
					eventType = 'FHE版'
					steps = String(args.stepsPlain)
					reward = String(args.rewardPlainApprox)
				}

				console.log(`✅ 成功解析 ${eventType} 事件 (接口${parsedIndex}):`, {
					tx: l.transactionHash,
					user: args.user,
					dayIndex: args.dayIndex,
					steps,
					reward
				})

				return {
					tx: l.transactionHash,
					user: args.user,
					dayIndex: String(args.dayIndex),
					steps,
					reward
				}
            }).filter((x): x is { tx: string; user: string; dayIndex: string; steps: string; reward: string } => Boolean(x))
			
			// 合并并排序所有事件
            const allLogs: { tx: string; user: string; dayIndex: string; steps: string; reward: string }[] = [...normalParsed, ...encParsed]
                .sort((a, b) => Number((b as any).dayIndex) - Number((a as any).dayIndex))
				.slice(0, 20)

			console.log('📊 最终结果统计:')
			console.log(`🏠 普通合约事件: ${normalParsed.length}`)
			console.log(`🔐 加密合约事件: ${encParsed.length}`)
			console.log(`📋 总事件数: ${allLogs.length}`)
			console.log('📋 最终显示的事件:', allLogs)

			setLogs(allLogs)
		})().catch(console.error)
	}, [todayIndex])

	return (
		<Layout style={{minHeight:'100vh'}}>
			<Layout.Header style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
				<Space>
					<Typography.Title level={4} style={{margin:0}}>结果查看</Typography.Title>
					<Tag color="geekblue">测试网络</Tag>
				</Space>
				<Button icon={<ArrowLeftOutlined />}>
					<Link to="/" style={{color:'inherit'}}>返回首页</Link>
				</Button>
			</Layout.Header>
			<Layout.Content style={{padding:24, maxWidth: 1100, margin: '0 auto', width:'100%'}}>
				<Space direction="vertical" size="large" style={{width:'100%'}}>
					<Card title="账户与余额" variant="outlined">
						<Descriptions column={1}>
							<Descriptions.Item label="当前账号">{account}</Descriptions.Item>
							<Descriptions.Item label="代币余额">{tokenInfo.balance} {tokenInfo.symbol}</Descriptions.Item>
							<Descriptions.Item label="今日已提交">
								<Tag color={todaySubmitted ? 'green' : 'red'}>{todaySubmitted ? '是' : '否'}</Tag>
							</Descriptions.Item>
						</Descriptions>
					</Card>
					<Card title="最近记录（Submitted 事件）" variant="outlined">
						<Table
							rowKey={(r)=> r.tx + r.user}
							dataSource={logs}
							pagination={{ pageSize: 10 }}
							columns={[
								{ title: 'Tx', dataIndex: 'tx', render: (tx:string)=> explorerBase ? <a href={`${explorerBase}/tx/${tx}`} target="_blank" rel="noreferrer">{tx.slice(0,10)}...</a> : <span>{tx.slice(0,10)}...</span> },
								{ title: 'User', dataIndex: 'user' },
								{ title: 'Day', dataIndex: 'dayIndex' },
								{ title: 'Steps', dataIndex: 'steps' },
								{ title: 'Reward(wei)', dataIndex: 'reward' },
							]}
						/>
					</Card>
				</Space>
			</Layout.Content>
			<Layout.Footer style={{textAlign:'center'}}>
				Move to Earn © {new Date().getFullYear()}
			</Layout.Footer>
		</Layout>
	)
}
