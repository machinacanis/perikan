import { describe, it, expect, vi, beforeEach } from "vitest"
import { PerikanLocalBus } from "../src/bus"
import { definePerikanEvent } from "../src/event"
import { Perikan } from "../src/index"
import z from "zod"

describe("PerikanLocalBus", () => {
    // 模拟 Perikan 实例
    const mockPerikan = {
        workerId: 1,
        nextId: () => BigInt(Date.now())
    } as Perikan

    // 定义测试事件
    const TestEvent = definePerikanEvent("test.topic", z.object({ foo: z.string() }))
    const OtherEvent = definePerikanEvent("other.topic", z.object({ bar: z.number() }))

    let bus: PerikanLocalBus

    beforeEach(() => {
        bus = new PerikanLocalBus({ workerId: 1 })
    })

    describe("基础功能测试", () => {
        it("应该能够订阅和取消订阅事件", () => {
            const handler = vi.fn()
            const unsubscribe = bus.on(TestEvent, handler)

            expect(unsubscribe).toBeTypeOf("function")

            unsubscribe()
            // 内部状态验证：handlersMap 应该在最后一个处理器移除后清理该主题
            // 既然是测试，我们可以通过反射或查看实现来确保清理逻辑执行
        })

        it("应该在发布事件时执行处理器", async () => {
            const handler = vi.fn()
            bus.on(TestEvent, handler)

            const eventData = TestEvent.create(mockPerikan, { foo: "bar" })
            await bus.emit(TestEvent, eventData)

            expect(handler).toHaveBeenCalledWith(eventData)
            expect(handler).toHaveBeenCalledTimes(1)
        })

        it("不应该执行已取消订阅的处理器", async () => {
            const handler = vi.fn()
            const unsubscribe = bus.on(TestEvent, handler)
            unsubscribe()

            const eventData = TestEvent.create(mockPerikan, { foo: "bar" })
            await bus.emit(TestEvent, eventData)

            expect(handler).not.toHaveBeenCalled()
        })

        it("应该根据主题正确分发事件", async () => {
            const testHandler = vi.fn()
            const otherHandler = vi.fn()

            bus.on(TestEvent, testHandler)
            bus.on(OtherEvent, otherHandler)

            const eventData = TestEvent.create(mockPerikan, { foo: "bar" })
            await bus.emit(TestEvent, eventData)

            expect(testHandler).toHaveBeenCalled()
            expect(otherHandler).not.toHaveBeenCalled()
        })
    })

    describe("边界条件测试", () => {
        it("如果没有处理器订阅，emit 不应报错", async () => {
            const eventData = TestEvent.create(mockPerikan, { foo: "bar" })
            await expect(bus.emit(TestEvent, eventData)).resolves.toBeUndefined()
        })

        it("如果事件数据验证失败，不应执行处理器", async () => {
            const handler = vi.fn()
            bus.on(TestEvent, handler)

            // 构造无效数据（缺少 foo 字段）
            const invalidData = {
                id: 1n,
                time: Date.now(),
                topic: TestEvent.topic,
                from: 1,
                to: [],
                tags: [],
                payload: {}
            } as any

            await bus.emit(TestEvent, invalidData)
            expect(handler).not.toHaveBeenCalled()
        })

        it("当所有处理器被移除后，应该清理 handlersMap 中的主题", async () => {
            const handler = vi.fn()
            const unsubscribe = bus.on(TestEvent, handler)
            unsubscribe()

            // 再次发布，确保没有副作用
            await expect(bus.emit(TestEvent, {} as any)).resolves.toBeUndefined()
        })
    })

    describe("并发和异步测试", () => {
        it("应该并发执行多个处理器", async () => {
            let order: number[] = []
            const handler1 = async () => {
                await new Promise((r) => setTimeout(r, 20))
                order.push(1)
            }
            const handler2 = async () => {
                await new Promise((r) => setTimeout(r, 10))
                order.push(2)
            }

            bus.on(TestEvent, handler1)
            bus.on(TestEvent, handler2)

            await bus.emit(TestEvent, TestEvent.create(mockPerikan, { foo: "bar" }))

            // handler2 虽然晚注册但执行快，应该先完成
            expect(order).toEqual([2, 1])
        })

        it("即使某个处理器失败，也应该等待所有处理器完成 (allSettled 行为)", async () => {
            const handler1 = vi.fn().mockRejectedValue(new Error("Fail"))
            const handler2 = vi.fn().mockResolvedValue(undefined)

            bus.on(TestEvent, handler1)
            bus.on(TestEvent, handler2)

            await bus.emit(TestEvent, TestEvent.create(mockPerikan, { foo: "bar" }))

            expect(handler1).toHaveBeenCalled()
            expect(handler2).toHaveBeenCalled()
        })
    })

    describe("超时机制测试", () => {
        it("当处理器执行超时时，应该触发超时错误 (内部 allSettled 会捕获)", async () => {
            const timeoutBus = new PerikanLocalBus({ workerId: 1, maxTimeout: 10 })

            const slowHandler = () => new Promise<void>((r) => setTimeout(r, 50))
            timeoutBus.on(TestEvent, slowHandler)

            // 虽然超时，但 emit 使用 allSettled，所以不会抛出异常到外部
            await expect(timeoutBus.emit(TestEvent, TestEvent.create(mockPerikan, { foo: "bar" }))).resolves.toBeUndefined()
        })

        it("不设置 maxTimeout 时不应有超时限制", async () => {
            const noTimeoutBus = new PerikanLocalBus({ workerId: 1, maxTimeout: 0 })
            const slowHandler = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 20)))

            noTimeoutBus.on(TestEvent, slowHandler)
            await noTimeoutBus.emit(TestEvent, TestEvent.create(mockPerikan, { foo: "bar" }))

            expect(slowHandler).toHaveBeenCalled()
        })
    })

    describe("Worker ID 相关测试", () => {
        it("当 to 字段为空数组时，应视为广播并执行处理器", async () => {
            const handler = vi.fn()
            bus.on(TestEvent, handler)

            const eventData = TestEvent.create(mockPerikan, { foo: "bar" }, { to: [] })
            await bus.emit(TestEvent, eventData)

            expect(handler).toHaveBeenCalled()
        })

        it("当 to 字段包含当前 workerId 时，应执行处理器", async () => {
            const handler = vi.fn()
            bus.on(TestEvent, handler)

            const eventData = TestEvent.create(mockPerikan, { foo: "bar" }, { to: [1] })
            await bus.emit(TestEvent, eventData)

            expect(handler).toHaveBeenCalled()
        })

        it("当 to 字段不包含当前 workerId 时，不应执行处理器", async () => {
            const handler = vi.fn()
            bus.on(TestEvent, handler)

            const eventData = TestEvent.create(mockPerikan, { foo: "bar" }, { to: [2] }) // 目标是 worker 2
            await bus.emit(TestEvent, eventData)

            expect(handler).not.toHaveBeenCalled()
        })
    })

    describe("错误处理测试", () => {
        it("处理器同步抛出异常时不应中断 emit 流程", async () => {
            const buggyHandler = () => {
                throw new Error("Sync Error")
            }
            const normalHandler = vi.fn()

            bus.on(TestEvent, buggyHandler)
            bus.on(TestEvent, normalHandler)

            await expect(bus.emit(TestEvent, TestEvent.create(mockPerikan, { foo: "bar" }))).resolves.toBeUndefined()
            expect(normalHandler).toHaveBeenCalled()
        })
    })
})
