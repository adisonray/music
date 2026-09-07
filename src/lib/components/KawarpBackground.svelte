<script lang="ts">
    import { Kawarp } from '@kawarp/core'
    import { onMount } from 'svelte'

    interface Props {
        imageUrl: string | null
        enabled?: boolean
        warpIntensity?: number
        blurPasses?: number
        animationSpeed?: number
        transitionDuration?: number
        saturation?: number
        tintColor?: [number, number, number]
        tintIntensity?: number
        dithering?: number
        scale?: number
    }

    const {
        imageUrl,
        enabled = true,
        warpIntensity = 0.8,
        blurPasses = 8,
        animationSpeed = 1,
        transitionDuration = 1000,
        saturation = 1.4,
        tintColor,
        tintIntensity = 0.18,
        dithering = 0.012,
        scale = 1
    }: Props = $props()

    const mainStore = useMainStore()
    const player = usePlayer()

    let isDesktop = $state(true)

    const activeTintColor = $derived<[number, number, number]>(
        tintColor === undefined
            ? (mainStore.isThemeDark ? [0.12, 0.12, 0.18] : [0.96, 0.96, 0.98])
            : tintColor
    )

    const isReducedMotion = $derived(mainStore.isReducedMotion)
    const activeAnimationSpeed = $derived(isReducedMotion ? 0 : animationSpeed)

    let canvasElement = $state<HTMLCanvasElement>()
    let kawarpInstance: Kawarp | null = null
    let currentLoadedUrl: string | null = null
    let isLoaded = $state(false)
    let animationFrameId: number | null = null

    // Smooth Beat Detection state
    let lastFrameTime = performance.now()
    let smoothedBass = 0
    let bassEnergy = 0
    let beatCutoff = 0

    const runAudioReaction = (currentTime: number = performance.now()) => {
        if (!enabled || !kawarpInstance || !isDesktop) {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
            return
        }

        // Frame-rate independent delta time calculation (clamped to prevent jumps on tab focus)
        const dt = Math.min((currentTime - lastFrameTime) / 1000, 0.1) || 0.016
        lastFrameTime = currentTime

        const analyser = player.equalizer?.analyser
        if (analyser && player.playing) {
            const bufferLength = analyser.frequencyBinCount
            const dataArray = new Uint8Array(bufferLength)
            analyser.getByteFrequencyData(dataArray)

            // Dynamic frequency band isolator (20Hz - 140Hz)
            const sampleRate = analyser.context?.sampleRate || 44100
            const nyquist = sampleRate / 2
            const binHz = nyquist / bufferLength

            const lowBin = Math.floor(20 / binHz)
            const highBin = Math.min(bufferLength, Math.ceil(140 / binHz))

            let bassSum = 0
            const count = Math.max(1, highBin - lowBin)
            for (let i = lowBin; i < highBin; i++) {
                bassSum += dataArray[i] ?? 0
            }

            const rawBass = bassSum / count / 255

            // Exponential moving average to eliminate raw audio noise jitter
            smoothedBass += (rawBass - smoothedBass) * (1 - Math.exp(-18 * dt))

            // Peak-threshold beat detection with smooth release decay
            if (smoothedBass > beatCutoff && smoothedBass > 0.22) {
                bassEnergy = smoothedBass
                beatCutoff = smoothedBass * 1.15
            } else {
                bassEnergy += (0 - bassEnergy) * (1 - Math.exp(-7 * dt))
                beatCutoff += (0 - beatCutoff) * (1 - Math.exp(-3.5 * dt))
            }

            const targetWarpIntensity = warpIntensity + bassEnergy * 0.5
            const targetAnimationSpeed = activeAnimationSpeed + bassEnergy * 1.1
            const targetScale = scale + bassEnergy * 0.035

            // Frame-rate independent exponential interpolation for organic springiness
            const lerpSpeed = bassEnergy > 0.35 ? 12 : 6
            const ease = 1 - Math.exp(-lerpSpeed * dt)

            kawarpInstance.warpIntensity += (targetWarpIntensity - kawarpInstance.warpIntensity) * ease
            kawarpInstance.animationSpeed += (targetAnimationSpeed - kawarpInstance.animationSpeed) * ease
            kawarpInstance.scale += (targetScale - kawarpInstance.scale) * ease
        } else {
            const ease = 1 - Math.exp(-4 * dt)
            kawarpInstance.warpIntensity += (warpIntensity - kawarpInstance.warpIntensity) * ease
            kawarpInstance.animationSpeed += (activeAnimationSpeed - kawarpInstance.animationSpeed) * ease
            kawarpInstance.scale += (scale - kawarpInstance.scale) * ease
        }

        animationFrameId = requestAnimationFrame(runAudioReaction)
    }

    onMount(() => {
        const ua = navigator.userAgent || ''
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
        isDesktop = !isMobile

        if (!isDesktop) return

        let resizeObserver: ResizeObserver | null = null

        if (canvasElement) {
            try {
                kawarpInstance = new Kawarp(canvasElement, {
                    warpIntensity,
                    blurPasses,
                    animationSpeed: activeAnimationSpeed,
                    transitionDuration,
                    saturation,
                    tintColor: activeTintColor,
                    tintIntensity,
                    dithering,
                    scale
                })

                resizeObserver = new ResizeObserver(() => {
                    kawarpInstance?.resize()
                })
                resizeObserver.observe(canvasElement)

                if (enabled && imageUrl) {
                    currentLoadedUrl = imageUrl
                    kawarpInstance.loadImage(imageUrl)
                        .then(() => {
                            isLoaded = true
                            if (kawarpInstance && enabled) kawarpInstance.start()
                        })
                        .catch((err) => {
                            console.error('Failed to load initial Kawarp image:', err)
                            isLoaded = false
                        })
                } else if (enabled) {
                    kawarpInstance.start()
                }
            } catch (e) {
                console.error('Failed to initialize Kawarp:', e)
            }
        }

        return () => {
            resizeObserver?.disconnect()
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
            if (kawarpInstance) {
                kawarpInstance.stop()
                kawarpInstance.dispose()
                kawarpInstance = null
            }
        }
    })

    // Options updates
    $effect(() => {
        if (!kawarpInstance || !isDesktop) return

        kawarpInstance.setOptions({
            warpIntensity,
            blurPasses,
            animationSpeed: activeAnimationSpeed,
            transitionDuration,
            saturation,
            tintColor: activeTintColor,
            tintIntensity,
            dithering,
            scale
        })
    })

    // Audio loop control
    $effect(() => {
        if (player.playing && enabled && kawarpInstance && isDesktop) {
            if (!animationFrameId) {
                lastFrameTime = performance.now()
                runAudioReaction()
            }
        } else {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
        }

        return () => {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId)
                animationFrameId = null
            }
        }
    })

    // Image transitions
    $effect(() => {
        if (!kawarpInstance || !isDesktop) return

        if (!imageUrl) {
            isLoaded = false
            currentLoadedUrl = null
            return
        }

        if (imageUrl !== currentLoadedUrl) {
            currentLoadedUrl = imageUrl
            kawarpInstance.loadImage(imageUrl)
                .then(() => {
                    isLoaded = true
                    if (kawarpInstance && enabled) kawarpInstance.start()
                })
                .catch((err) => {
                    console.error('Failed to load Kawarp image:', err)
                    isLoaded = false
                })
        }
    })

    // Enable / Disable toggle
    $effect(() => {
        if (!kawarpInstance || !isDesktop) return

        if (enabled && isLoaded) {
            kawarpInstance.start()
        } else {
            kawarpInstance.stop()
        }
    })
</script>

<div
    class="kawarp-background"
    style="opacity: {isLoaded && enabled && isDesktop ? 1 : 0};"
>
    <canvas bind:this={canvasElement}></canvas>
    <div class="kawarp-overlay"></div>
</div>

<style lang="postcss">
    @reference '../../app.css';

    .kawarp-background {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        pointer-events: none;
        z-index: 0;
        transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        transform: translateZ(0);
        will-change: opacity;
    }

    .kawarp-background canvas {
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
        transform: scale(1.02); /* Prevents edge bleeding during heavy warp beats */
    }

    .kawarp-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 1;
        transition: background 0.6s ease;
    }

    :global(.dark) .kawarp-overlay {
        background: 
            radial-gradient(circle at 50% 30%, transparent 20%, rgb(0 0 0 / 0.3) 100%),
            linear-gradient(to bottom, rgb(0 0 0 / 0.15) 0%, rgb(0 0 0 / 0.45) 100%);
    }

    :global(html:not(.dark)) .kawarp-overlay {
        background: 
            radial-gradient(circle at 50% 30%, transparent 20%, rgb(255 255 255 / 0.2) 100%),
            linear-gradient(to bottom, rgb(255 255 255 / 0.35) 0%, rgb(255 255 255 / 0.75) 100%);
    }
</style>
