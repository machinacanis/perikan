import type { PerikanEvent, PerikanEventData } from "./event"

export type PerikanInternalBusOptions = {
    workerId?: number
    maxTimeout?: number
}

export type EventHandler<Payload extends object> = (eventData: PerikanEventData<Payload>) => void | Promise<void>

export interface IPerikanEventBus {
    on<Payload extends object>(event: PerikanEvent<Payload>, handler: EventHandler<Payload>, onError?: (data: any, error: any) => void): () => void
    emit(event: PerikanEvent<any>, eventData: PerikanEventData<any>): Promise<void>
}

export class PerikanLocalBus implements IPerikanEventBus {
    constructor(protected readonly options: PerikanInternalBusOptions = {}) {
        const timeout = options.maxTimeout ?? 0
        this.maxTimeout = timeout > 0 ? timeout : 0
        this.workerId = options.workerId ?? 0
    }

    protected maxTimeout: number
    protected workerId: number

    protected readonly handlersMap: Map<string, Set<EventHandler<any>>> = new Map()

    on<Payload extends object>(event: PerikanEvent<Payload>, handler: EventHandler<Payload>): () => void {
        // 如果当前事件的主题对应的集合不存在，则创建新的集合
        if (!this.handlersMap.has(event.topic)) this.handlersMap.set(event.topic, new Set())
        const handlers = this.handlersMap.get(event.topic)!

        // 将当前的处理器添加到处理器集合中
        handlers.add(handler)

        // 返回一个用于取消当前处理器的函数
        return () => {
            handlers.delete(handler)
            if (handlers.size === 0) {
                this.handlersMap.delete(event.topic)
            }
        }
    }

    async emit(event: PerikanEvent<any>, eventData: PerikanEventData<any>): Promise<void> {
        // 首先验证事件数据是否属于提供的事件
        if (!event.validate(eventData)) return

        // 验证事件数据是否可以被当前的本地总线接收
        if (eventData.to.length === 0 || eventData.to.includes(this.workerId))
            if (this.handlersMap.has(event.topic)) {
                // 检查当前事件数据对应的主题是否有已注册的处理器
                // 获取所有已注册的处理器
                const handlers = this.handlersMap.get(event.topic)!

                // 遍历所有处理器并构建用于并发的任务列表
                const tasks = Array.from(handlers).map((handler) => {
                    try {
                        return Promise.resolve(handler(eventData))
                    } catch (err) {
                        return Promise.reject(err)
                    }
                })

                // 并发执行所有任务，如果设置的超时时间不为0则应用超时规则
                await Promise.allSettled(
                    tasks.map((task) =>
                        this.maxTimeout > 0
                            ? Promise.race([task, new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), this.maxTimeout))])
                            : task
                    )
                )
            } else return Promise.resolve()
    }
}
