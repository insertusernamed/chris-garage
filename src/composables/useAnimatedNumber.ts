import { onUnmounted, ref, watch, type Ref } from 'vue'

export function useAnimatedNumber(source: Ref<number | null>, digits = 1) {
    const shown = ref('—')
    let current = 0
    let primed = false
    let raf = 0

    watch(
        source,
        (next) => {
            cancelAnimationFrame(raf)
            if (next == null || !Number.isFinite(next)) {
                shown.value = '—'
                primed = false
                return
            }
            if (!primed) {
                current = next
                primed = true
                shown.value = next.toFixed(digits)
                return
            }
            const reduced =
                typeof window !== 'undefined' &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches
            if (reduced) {
                current = next
                shown.value = next.toFixed(digits)
                return
            }
            const from = current
            const start = performance.now()
            const dur = 680
            const step = (now: number) => {
                const t = Math.min(1, (now - start) / dur)
                const ease = 1 - (1 - t) ** 3
                current = from + (next - from) * ease
                shown.value = current.toFixed(digits)
                if (t < 1) raf = requestAnimationFrame(step)
            }
            raf = requestAnimationFrame(step)
        },
        { immediate: true },
    )

    onUnmounted(() => cancelAnimationFrame(raf))
    return shown
}
