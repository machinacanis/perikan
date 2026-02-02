import type { Perikan } from "."
import type { EventHandler } from "./bus"
import type { PerikanEvent, PerikanEventData } from "./event"

/**
 * Perikan 的基础处理流上下文类型定义，可以通过扩展 Extra 类型来扩充类型信息
 *
 * The basic flow context type definition for Perikan, which can be extended by the Extra type to add more type information
 *
 * @template Payload 事件负载类型 event payload type
 * @template Extra 扩展类型 extra type
 */
export type FlowContext<Payload extends object, Extra extends object = {}> = {
    readonly flowId: bigint
    readonly perikan: Perikan
    readonly topic: string
    readonly data: PerikanEventData<Payload>
    readonly payload: Payload
} & Extra

/**
 * 处理流管道函数类型定义
 *
 * Pipe function type definition for the flow
 *
 * @template Payload 事件负载类型 event payload type
 * @template Extra 扩展类型 extra type
 * @template Added 添加的属性类型 added properties type
 * @returns 添加的属性对象 added properties object
 */
export type PipeFn<Payload extends object, Extra extends object = {}, Added extends object = {}> = (
    ctx: FlowContext<Payload, Extra>
) => Added | Promise<Added> | void | Promise<void> | boolean | Promise<boolean>

// 补充：PipeFn 可以有多种返回值，不同的返回值有不同的语义：
// - 返回一个对象时将其作为处理流上下文的属性扩展
// - 返回 void 时表示不进行任何操作，进入下一个中间件
// - 返回 boolean 时表示是否继续执行下一个中间件，false 表示不继续执行

/**
 * 创建处理流上下文
 *
 * Create flow context
 *
 * @template Payload 事件负载类型 event payload type
 * @param perikan Perikan 实例
 * @param eventData 事件数据 event data
 * @returns 处理流上下文 flow context
 */
export function createFlowContext<Payload extends object>(perikan: Perikan, eventData: PerikanEventData<Payload>): FlowContext<Payload> {
    return {
        flowId: perikan.nextId(),
        perikan: perikan,
        topic: eventData.topic,
        data: eventData,
        payload: eventData.payload
    }
}

/**
 * 处理流类，用于构建处理流
 *
 * Flow class, used to build flow
 *
 * @template Payload 事件负载类型 event payload type
 * @template Extra 扩展类型 extra type
 */
export class PerikanFlow<Payload extends object, Extra extends object = {}> {
    protected readonly events: PerikanEvent<Payload>[]

    protected catchFn?: (ctx: FlowContext<Payload, Extra>, err?: any) => void | Promise<void>
    protected pipeFn: PipeFn<Payload, Extra>[] = []

    constructor(
        protected readonly perikan: Perikan,
        ...events: (Payload extends any ? PerikanEvent<Payload> : never)[]
    ) {
        this.events = events
    }

    build(): EventHandler<Payload> {
        return async (eventData: PerikanEventData<Payload>) => {
            // 通过事件数据初始化处理流上下文
            const ctx = createFlowContext(this.perikan, eventData) as FlowContext<Payload, Extra>
            // 运行中间件链
            try {
                // 中间件链按顺序执行以保证类型信息的安全
                for (const pipeFn of this.pipeFn) {
                    // 由于上下文的类型信息是静态的，但是实际上的数据类型是动态累积的
                    const result = await pipeFn(ctx)
                    if (result === false) break
                    // 如果 result 是一个对象，则将其合并到上下文中
                    if (result && typeof result === "object" && !Array.isArray(result)) {
                        Object.assign(ctx, result)
                    }
                }
            } catch (err) {
                // 如果提供了 catchFn 则调用 catchFn
                if (this.catchFn) await this.catchFn(ctx, err)
            }
        }
    }

    commit() {
        const handler = this.build()
        const unbinds = this.events.map((event) => this.perikan.on(event, handler))
        return () => unbinds.forEach((unbind) => unbind())
    }

    catch(fn: (ctx: FlowContext<Payload, Extra>, err?: any) => void | Promise<void>) {
        this.catchFn = fn
        return this
    }

    pipe<Added extends object>(fn: PipeFn<Payload, Extra, Added>) {
        // 将处理流管道函数添加到管道中
        this.pipeFn.push(fn)
        // 扩展当前处理流的类型信息
        return this as unknown as PerikanFlow<Payload, Extra & Added>
    }

    filter(pred: (ctx: FlowContext<Payload, Extra>) => boolean) {
        // 将过滤器添加到管道中
        this.pipeFn.push(async (ctx) => {
            if (!pred(ctx)) return false
        })
        return this
    }

    handle(fn: (ctx: FlowContext<Payload, Extra>) => void | Promise<void>) {
        // 将处理函数添加到管道中
        this.pipeFn.push(async (ctx) => {
            await fn(ctx)
        })
        return this
    }
}
