import { SnowFlake } from "./snowflake"
import { PerikanLocalBus, type IPerikanEventBus } from "./bus"

export type PerikanOptions = {
    workerId: number
    bus?: IPerikanEventBus
}

/**
 * 类型安全的 TypeScript 事件处理框架
 *
 * Type-Safe Event Handling Framework in TypeScript
 */
export class Perikan {
    protected readonly _sf: SnowFlake
    protected readonly bus: IPerikanEventBus

    constructor(public readonly options: PerikanOptions) {
        this._sf = new SnowFlake(options.workerId)
        this.bus = options.bus ?? new PerikanLocalBus({ workerId: options.workerId, maxTimeout: 1000 })
    }

    get workerId() {
        return this.options.workerId
    }

    nextId(): bigint {
        return this._sf.nextId()
    }
}
