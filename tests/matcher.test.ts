import { describe, it, expect, vi } from "vitest"
import { Perikan } from "../src/index"
import { definePerikanEvent } from "../src/event"
import { PerikanFlow } from "../src/matcher"
import z from "zod"

describe("PerikanFlow", () => {
    const perikan = new Perikan({ workerId: 1 })
    const TestEvent = definePerikanEvent("test.flow", z.object({ value: z.number() }))

    it("应该能够正确累积中间件提供的类型和数据", async () => {
        const flow = new PerikanFlow(perikan, TestEvent)
            .pipe((ctx) => {
                return { extra1: "foo" }
            })
            .pipe((ctx) => {
                // 这里应该能访问到上一个中间件添加的属性
                expect(ctx.extra1).toBe("foo")
                return { extra2: ctx.payload.value * 2 }
            })

        const handler = flow.build()
        const eventData = TestEvent.create(perikan, { value: 10 })

        // 我们可以手动调用 handler
        await handler(eventData)
    })

    it("当中间件返回 false 时应该停止后续执行", async () => {
        const spy = vi.fn()
        const flow = new PerikanFlow(perikan, TestEvent).pipe(() => false).pipe(spy)

        const handler = flow.build()
        await handler(TestEvent.create(perikan, { value: 10 }))
        expect(spy).not.toHaveBeenCalled()
    })

    it("应该能捕获中间件中的错误", async () => {
        const catchSpy = vi.fn()
        const flow = new PerikanFlow(perikan, TestEvent)
            .pipe(() => {
                throw new Error("test error")
            })
            .catch((ctx, err) => {
                catchSpy(ctx.payload.value, err.message)
            })

        const handler = flow.build()
        await handler(TestEvent.create(perikan, { value: 10 }))
        expect(catchSpy).toHaveBeenCalledWith(10, "test error")
    })

    it("commit 应该正确注册事件处理器", async () => {
        const spy = vi.fn()
        const flow = new PerikanFlow(perikan, TestEvent).pipe((ctx) => {
            spy(ctx.payload.value)
        })

        flow.commit()

        const eventData = TestEvent.create(perikan, { value: 42 })
        // @ts-ignore - bus is protected
        await perikan.bus.emit(TestEvent, eventData)

        expect(spy).toHaveBeenCalledWith(42)
    })
})
