/**
 * LRU 缓存项，包含过期时间
 *
 * LRU cache item, including expiration time
 */
interface CacheItem<V> {
    value: V
    expiry?: number
}

/**
 * 简单的 LRU 缓存实现，支持 TTL
 *
 * A simple LRU cache implementation with TTL support
 *
 * @template K 键的类型 type of key
 * @template V 值的类型 type of value
 */
export class LRUCache<K, V> {
    private cache: Map<K, CacheItem<V>>
    private readonly capacity: number
    private readonly ttl?: number

    /**
     * 创建一个 LRUCache 实例
     *
     * Create an LRUCache instance
     *
     * @param capacity 缓存的最大容量 maximum capacity of the cache
     * @param ttl 缓存项的生存时间 (毫秒) time to live for cache items (milliseconds)
     */
    constructor(capacity: number, ttl?: number) {
        if (capacity <= 0) {
            throw new Error("Capacity must be greater than 0")
        }
        this.capacity = capacity
        this.ttl = ttl
        this.cache = new Map<K, CacheItem<V>>()
    }

    /**
     * 获取缓存中的值
     *
     * Get the value from the cache
     *
     * @param key 键 key
     * @returns 缓存的值，如果不存在或已过期则返回 undefined the cached value, or undefined if not exists or expired
     */
    get(key: K): V | undefined {
        const item = this.cache.get(key)
        if (!item) {
            return undefined
        }

        // 检查是否过期
        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key)
            return undefined
        }

        // 将访问的项移动到 Map 的末尾
        this.cache.delete(key)
        this.cache.set(key, item)
        return item.value
    }

    /**
     * 向缓存中设置值
     *
     * Set a value in the cache
     *
     * @param key 键 key
     * @param value 值 value
     * @param ttl 个别项的 TTL，覆盖全局 TTL Individual item TTL, overrides global TTL
     */
    set(key: K, value: V, ttl?: number): void {
        if (this.cache.has(key)) {
            this.cache.delete(key)
        } else if (this.cache.size >= this.capacity) {
            // 删除最久未使用的项 (Map 的第一个键)
            const firstKey = this.cache.keys().next().value
            if (firstKey !== undefined) {
                this.cache.delete(firstKey)
            }
        }

        const effectiveTTL = ttl ?? this.ttl
        const expiry = effectiveTTL ? Date.now() + effectiveTTL : undefined
        this.cache.set(key, { value, expiry })
    }

    /**
     * 如果键不存在则设置值，否则直接返回
     *
     * Set the value if the key does not exist, otherwise return it
     */
    async getOrSet(key: K, factory: () => Promise<V> | V, ttl?: number): Promise<V> {
        const cached = this.get(key)
        if (cached !== undefined) {
            return cached
        }

        const value = await factory()
        this.set(key, value, ttl)
        return value
    }

    /**
     * 检查键是否存在于缓存中且未过期
     *
     * Check if the key exists in the cache and is not expired
     */
    has(key: K): boolean {
        const item = this.cache.get(key)
        if (!item) return false
        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key)
            return false
        }
        return true
    }

    /**
     * 从缓存中删除指定的键
     */
    delete(key: K): boolean {
        return this.cache.delete(key)
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear()
    }

    /**
     * 获取当前有效的缓存大小 (排除已过期项)
     */
    get size(): number {
        // 清理过期项以获得准确大小
        for (const [key, item] of this.cache.entries()) {
            if (item.expiry && Date.now() > item.expiry) {
                this.cache.delete(key)
            }
        }
        return this.cache.size
    }
}
