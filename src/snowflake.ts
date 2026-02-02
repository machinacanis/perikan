export class SnowFlake {
    private epoch: number = 1704067200000 // 2024-01-01 00:00:00 UTC
    private workerIdBits: number = 10
    private sequenceBits: number = 12
    private maxSequence: number = (1 << this.sequenceBits) - 1

    private lastMs: number = 0
    private sequence: number = 0

    constructor(readonly workerId: number) {}

    nextId(): bigint {
        const now = Date.now()
        if (now === this.lastMs) {
            this.sequence = (this.sequence + 1) & this.maxSequence
            if (this.sequence === 0) {
                while (Date.now() <= this.lastMs) {}
            }
        } else {
            this.sequence = 0
            this.lastMs = now
        }

        const timestampPart = BigInt(now - this.epoch) << BigInt(this.workerIdBits + this.sequenceBits)
        const workerPart = BigInt(this.workerId) << BigInt(this.sequenceBits)
        const id = timestampPart | workerPart | BigInt(this.sequence)
        return id
    }
}

export function BigIntToBase36(id: bigint): string {
    return id.toString(36)
}
