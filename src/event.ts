import z from "zod"
import type { Perikan } from "."
import { LRUCache } from "./cache"

// 用于判断对象是否为空的辅助函数
// The helper function used to determine if an object is empty
const isEmpty = (val: any): boolean => val === undefined || val === null || (typeof val === "object" && Object.keys(val).length === 0)

/**
 * Perikan 的基本事件数据模式
 *
 * The basic event schema of Perikan
 */
export const PerikanEventDataSchema = z.object({
    id: z.bigint(),
    time: z.number(),
    topic: z.string(),
    from: z.number(),
    to: z.array(z.number()),
    tags: z.array(z.string()),
    payload: z.any()
})

/**
 * Perikan 的基本事件类型
 *
 * The basic event type of Perikan
 *
 * @template Payload 事件负载数据的类型 type of the event payload
 */
export type PerikanEventData<Payload extends object> = z.infer<typeof PerikanEventDataSchema> & {
    payload: Payload
}

/**
 * 用于构建 Perikan 事件的默认选项的类型定义
 *
 * The type definition for the default options used to build Perikan events
 *
 * @template Payload 事件负载数据的类型 type of the event payload
 */
export type PerikanEventDefaultOptions<Payload extends object> = {
    defaultTags?: string[]
    defaultPayload?: Payload
    /**
     * 缓存配置
     *
     * Cache configuration
     */
    cache?: {
        enabled: boolean
        capacity?: number
        ttl?: number
    }
}

/**
 * 用于构建 Perikan 事件的选项的类型定义
 *
 * The type definition for the options used to build Perikan events
 *
 * @template Payload 事件负载数据的类型 type of the event payload
 */
export type PerikanEventCreateOptions<Payload extends object> = {
    payload?: Payload
    tags?: string[]
    from?: number
    to?: number[]
}

/**
 * Perikan 事件类
 *
 * The Perikan event class
 *
 * @template Payload 事件负载数据的类型 type of the event payload
 */
export class PerikanEvent<Payload extends object> {
    public readonly eventSchema: z.ZodType<PerikanEventData<Payload>>
    private readonly _parseCache?: LRUCache<bigint, any>

    /**
     * 创建 PerikanEvent 实例
     *
     * Create a PerikanEvent instance
     *
     * @param topic 事件主题 event topic
     * @param payloadSchema 事件负载数据的模式 event payload schema
     * @param opts 用于构建事件的默认选项 default options for building events
     */
    constructor(
        public readonly topic: string,
        public readonly payloadSchema: z.ZodType<Payload>,
        public readonly opts?: PerikanEventDefaultOptions<Payload>
    ) {
        this.eventSchema = PerikanEventDataSchema.extend({
            topic: z.literal(this.topic),
            payload: this.payloadSchema
        })

        if (this.opts?.cache?.enabled) {
            this._parseCache = new LRUCache(
                this.opts.cache.capacity ?? 1000,
                this.opts.cache.ttl ?? 1000 * 60 * 5 // 默认 5 分钟
            )
        }
    }

    /**
     * 获取缓存键
     *
     * Get cache key
     */
    private _getCacheKey(data: any): bigint | undefined {
        if (data && typeof data === "object" && typeof data.id === "bigint") {
            return data.id
        }
        return undefined
    }

    /**
     * 解析事件数据，如果数据无效则抛出错误
     *
     * Parse event data, if data is invalid then throw an error
     *
     * @param data 事件数据 event data
     * @returns 解析后的事件数据 parsed event data
     */
    parse(data: any) {
        const result = this.safeParse(data)
        if (result.success) {
            return result.data
        }
        throw result.error
    }

    /**
     * 异步解析事件数据，如果数据无效则抛出错误
     *
     * Asynchronously parse event data, if data is invalid then throw an error
     *
     * @param data 事件数据 event data
     * @returns 解析后的事件数据 parsed event data
     */
    async parseAsync(data: any) {
        const result = await this.safeParseAsync(data)
        if (result.success) {
            return result.data
        }
        throw result.error
    }

    /**
     * 解析事件负载数据，如果数据无效则抛出错误
     *
     * Parse event payload data, if data is invalid then throw an error
     *
     * @param data 事件负载数据 event payload data
     * @returns 解析后的事件负载数据 parsed event payload data
     */
    parsePayload(data: any) {
        return this.payloadSchema.parse(data)
    }

    /**
     * 异步解析事件负载数据，如果数据无效则抛出错误
     *
     * Asynchronously parse event payload data, if data is invalid then throw an error
     *
     * @param data 事件负载数据 event payload data
     * @returns 解析后的事件负载数据 parsed event payload data
     */
    parsePayloadAsync(data: any) {
        return this.payloadSchema.parseAsync(data)
    }

    /**
     * 安全解析事件数据
     *
     * Safely parse event data
     *
     * @param data 事件数据 event data
     * @returns 解析结果 parsed result
     */
    safeParse(data: any): any {
        const key = this._getCacheKey(data)
        if (key !== undefined && this._parseCache) {
            const cached = this._parseCache.get(key)
            if (cached) return cached
        }

        const result = this.eventSchema.safeParse(data)

        if (key !== undefined && this._parseCache) {
            this._parseCache.set(key, result)
        }

        return result
    }

    /**
     * 安全地异步解析事件负载数据
     *
     * Safely parse event payload data asynchronously
     *
     * @param data 事件数据 event data
     * @returns 解析结果 parsed result
     */
    async safeParseAsync(data: any): Promise<any> {
        const key = this._getCacheKey(data)
        if (key !== undefined && this._parseCache) {
            const cached = this._parseCache.get(key)
            if (cached) return cached
        }

        const result = await this.eventSchema.safeParseAsync(data)

        if (key !== undefined && this._parseCache) {
            this._parseCache.set(key, result)
        }

        return result
    }

    /**
     * 安全解析事件负载数据
     *
     * Safely parse event payload data
     *
     * @param data 事件负载数据 event payload data
     * @returns 解析结果 parsed result
     */
    safeParsePayload(data: any) {
        return this.payloadSchema.safeParse(data)
    }

    /**
     * 安全地异步解析事件负载数据
     *
     * Safely parse event payload data asynchronously
     *
     * @param data 事件负载数据 event payload data
     * @returns 解析结果 parsed result
     */
    safeParsePayloadAsync(data: any) {
        return this.payloadSchema.safeParseAsync(data)
    }

    /**
     * 验证事件数据是否有效
     *
     * Validate event data
     *
     * @param data 事件数据 event data
     * @returns 验证结果 validation result
     */
    validate(data: any) {
        return this.eventSchema.safeParse(data).success
    }

    /**
     * 验证事件数据是否有效
     *
     * Validate event data asynchronously
     *
     * @param data 事件数据 event data
     * @returns 验证结果 validation result
     */
    async validateAsync(data: any) {
        const res = await this.eventSchema.safeParseAsync(data)
        return res.success
    }

    /**
     * 验证事件负载数据是否有效
     *
     * Validate event payload data
     *
     * @param data 事件负载数据 event payload data
     * @returns 验证结果 validation result
     */
    validatePayload(data: any) {
        return this.payloadSchema.safeParse(data).success
    }

    /**
     * 验证事件负载数据是否有效
     *
     * Validate event payload data asynchronously
     *
     * @param data 事件负载数据 event payload data
     * @returns 验证结果 validation result
     */
    async validatePayloadAsync(data: any) {
        const res = await this.payloadSchema.safeParseAsync(data)
        return res.success
    }

    /**
     * 创建事件实例
     *
     * Create an event instance
     *
     * @param perikan Perikan 实例 Perikan instance
     * @param payload 事件负载数据 event payload data
     * @param opts 用于创建事件的选项，提供 payload 参数时选项中的 payload 选项将被忽略 options for creating the event, if payload param is provided, the payload option in the options will be ignored
     * @returns 事件 event
     */
    create(perikan: Perikan, payload: Payload, opts?: PerikanEventCreateOptions<Payload>): PerikanEventData<Payload>
    /**
     * 创建事件实例
     *
     * Create an event instance
     *
     * @param perikan Perikan 实例 Perikan instance
     * @param opts 用于创建事件的选项 options for creating the event
     * @returns 事件 event
     */
    create(perikan: Perikan, opts?: PerikanEventCreateOptions<Payload>): PerikanEventData<Payload>
    create(
        perikan: Perikan,
        payloadOrOpts?: Payload | PerikanEventCreateOptions<Payload>,
        opts?: PerikanEventCreateOptions<Payload>
    ): PerikanEventData<Payload> {
        const { payload, options } = this._resolveArgs(payloadOrOpts, opts)

        // 验证 payload 数据
        this.parsePayload(payload)

        return this._buildEventData(perikan, payload, options)
    }

    /**
     * 异步创建事件实例
     *
     * Asynchronously create an event instance
     *
     * @param perikan Perikan 实例 Perikan instance
     * @param payload 事件负载数据 event payload data
     * @param opts 用于创建事件的选项，提供 payload 参数时选项中的 payload 选项将被忽略 options for creating the event, if payload param is provided, the payload option in the options will be ignored
     * @returns 事件 event
     */
    async createAsync(perikan: Perikan, payload: Payload, opts?: PerikanEventCreateOptions<Payload>): Promise<PerikanEventData<Payload>>
    /**
     * 异步创建事件实例
     *
     * Asynchronously create an event instance
     *
     * @param perikan Perikan 实例 Perikan instance
     * @param opts 用于创建事件的选项 options for creating the event
     * @returns 事件 event
     */
    async createAsync(perikan: Perikan, opts?: PerikanEventCreateOptions<Payload>): Promise<PerikanEventData<Payload>>
    async createAsync(
        perikan: Perikan,
        payloadOrOpts?: Payload | PerikanEventCreateOptions<Payload>,
        opts?: PerikanEventCreateOptions<Payload>
    ): Promise<PerikanEventData<Payload>> {
        const { payload, options } = this._resolveArgs(payloadOrOpts, opts)

        // 验证 payload 数据
        await this.parsePayloadAsync(payload)

        return this._buildEventData(perikan, payload, options)
    }

    /**
     * 不进行验证地创建事件实例
     *
     * Create an event instance without validation
     *
     * @param perikan Perikan 实例 Perikan instance
     * @param payload 事件负载数据 event payload data
     * @param opts 用于创建事件的选项，提供 payload 参数时选项中的 payload 选项将被忽略 options for creating the event, if payload param is provided, the payload option in the options will be ignored
     * @returns 事件 event
     */
    unsafeCreate(perikan: Perikan, payload: Payload, opts?: PerikanEventCreateOptions<Payload>): PerikanEventData<Payload>
    /**
     * 不进行验证地创建事件实例
     *
     * Create an event instance without validation
     *
     * @param perikan Perikan 实例 Perikan instance
     * @param opts 用于创建事件的选项 options for creating the event
     * @returns 事件 event
     */
    unsafeCreate(perikan: Perikan, opts?: PerikanEventCreateOptions<Payload>): PerikanEventData<Payload>
    unsafeCreate(
        perikan: Perikan,
        payloadOrOpts?: Payload | PerikanEventCreateOptions<Payload>,
        opts?: PerikanEventCreateOptions<Payload>
    ): PerikanEventData<Payload> {
        const { payload, options } = this._resolveArgs(payloadOrOpts, opts)

        return this._buildEventData(perikan, payload, options)
    }

    /**
     * 解析参数并获取负载和选项
     *
     * Resolve arguments and get payload and options
     *
     * @param payloadOrOpts 负载或选项 payload or options
     * @param opts 选项 options
     * @returns 负载和选项 payload and options
     */
    private _resolveArgs(
        payloadOrOpts?: Payload | PerikanEventCreateOptions<Payload>,
        opts?: PerikanEventCreateOptions<Payload>
    ): { payload: Payload; options?: PerikanEventCreateOptions<Payload> } {
        let payload: Payload | undefined
        let options: PerikanEventCreateOptions<Payload> | undefined

        if (opts !== undefined) {
            payload = payloadOrOpts as Payload
            options = opts
        } else if (
            payloadOrOpts &&
            typeof payloadOrOpts === "object" &&
            ("payload" in payloadOrOpts || "tags" in payloadOrOpts || "from" in payloadOrOpts || "to" in payloadOrOpts)
        ) {
            options = payloadOrOpts as PerikanEventCreateOptions<Payload>
            payload = options.payload
        } else {
            payload = payloadOrOpts as Payload
        }

        if (isEmpty(payload)) {
            payload = this.opts?.defaultPayload ?? ({} as Payload)
        }

        return { payload: payload!, options }
    }

    /**
     * 批量解析事件数据
     *
     * Batch parse event data
     *
     * @param datas 事件数据数组 array of event data
     * @returns 解析后的事件数据数组 array of parsed event data
     */
    parseMany(datas: any[]) {
        return datas.map((data) => this.parse(data))
    }

    /**
     * 异步批量解析事件数据
     *
     * Asynchronously batch parse event data
     *
     * @param datas 事件数据数组 array of event data
     * @returns 解析后的事件数据数组 array of parsed event data
     */
    async parseManyAsync(datas: any[]) {
        return Promise.all(datas.map((data) => this.parseAsync(data)))
    }

    /**
     * 构建事件数据对象
     *
     * Build event data object
     *
     * @param perikan Perikan 实例 Perikan instance
     * @param payload 负载数据 payload data
     * @param options 创建选项 create options
     * @returns 事件数据对象 event data object
     */
    private _buildEventData(perikan: Perikan, payload: Payload, options?: PerikanEventCreateOptions<Payload>): PerikanEventData<Payload> {
        return {
            id: perikan.nextId(),
            time: Date.now(),
            topic: this.topic,
            from: options?.from ?? perikan.workerId,
            to: options?.to ?? [],
            tags: [...(this.opts?.defaultTags ?? []), ...(options?.tags ?? [])],
            payload
        }
    }

    /**
     * 清空解析缓存
     *
     * Clear parse cache
     */
    clearCache() {
        this._parseCache?.clear()
    }
}

/**
 * 定义一个 Perikan 事件
 *
 * Define a Perikan event
 *
 * @template Payload 事件负载数据的类型 type of the event payload
 * @param topic 事件主题 event topic
 * @param schema 事件负载数据的模式 event payload schema
 * @param opts 用于构建事件的默认选项 default options for building events
 * @returns Perikan 事件实例 Perikan event instance
 */
export function definePerikanEvent<Payload extends object = {}>(
    topic: string,
    schema: z.ZodType<Payload>,
    opts?: PerikanEventDefaultOptions<Payload>
) {
    return new PerikanEvent(topic, schema, opts)
}
