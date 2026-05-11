<script setup lang="ts">
import type { Directive } from 'vue'
import { ArrowRight, BarChart3, CheckCircle2, Play, ShieldCheck, Sparkles, Trophy, Users2, Workflow } from 'lucide-vue-next'
import Grainient from '@/components/ui/Grainient.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

definePageMeta({
  layout: false,
  middleware: []
})

useSeoMeta({
  title: 'ContestSaaS',
  description: 'Organiza concursos, coordina jurados y publica resultados con una experiencia moderna y de alto impacto.',
  ogTitle: 'ContestSaaS',
  ogDescription: 'La plataforma para lanzar concursos con control operativo, scoring en tiempo real y una experiencia premium.',
})

const authStore = useAuthStore()

const reduceMotion = ref(false)
let motionMedia: MediaQueryList | null = null

const metrics = [
  { value: '3x', label: 'menos friccion operativa' },
  { value: '24/7', label: 'visibilidad para equipos y jurados' },
  { value: '1 panel', label: 'control de convocatorias y resultados' },
]

const featureCards = [
  {
    title: 'Convocatorias con presencia',
    text: 'Landing, registro e invitaciones con una narrativa visual consistente desde el primer clic.',
    icon: Sparkles,
  },
  {
    title: 'Scoring en tiempo real',
    text: 'Jurados, rondas y progreso en vivo en un flujo claro para evitar bloqueos y retrabajo.',
    icon: BarChart3,
  },
  {
    title: 'Operacion sin zonas grises',
    text: 'Permisos, estados y decisiones auditables para que el equipo avance con seguridad.',
    icon: ShieldCheck,
  },
]

const workflow = [
  {
    step: '01',
    title: 'Lanza la convocatoria',
    text: 'Configura categorias, reglas y fechas en una sola superficie limpia.',
  },
  {
    step: '02',
    title: 'Activa el jurado',
    text: 'Coordina evaluaciones con progreso visible, estados claros y menos seguimiento manual.',
  },
  {
    step: '03',
    title: 'Publica con confianza',
    text: 'Promociones, resultados y trazabilidad listos para compartir sin caos operativo.',
  },
]

const proofPoints = [
  'Dashboard con estados, fechas clave y progreso de scoring.',
  'Experiencia cuidada para organizadores, jurados y participantes.',
  'Interacciones suaves que elevan la percepcion del producto sin distraer.',
]

const ctaHref = computed(() => authStore.isAuthenticated ? '/dashboard' : '/auth/login?mode=register')
const ctaLabel = computed(() => authStore.isAuthenticated ? 'Abrir dashboard' : 'Crear cuenta')

const heroPointer = ref({ x: 0, y: 0, active: false })
const heroCardStyle = computed(() => {
  if (reduceMotion.value) return undefined

  const { x, y, active } = heroPointer.value

  if (!active) {
    return {
      transform: 'perspective(1400px) rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0)'
    }
  }

  return {
    transform: `perspective(1400px) rotateX(${(-y * 10).toFixed(2)}deg) rotateY(${(x * 14).toFixed(2)}deg) translate3d(${(x * 10).toFixed(1)}px, ${(y * 10).toFixed(1)}px, 0)`
  }
})

function updateHeroPointer(event: MouseEvent) {
  if (reduceMotion.value) return

  const currentTarget = event.currentTarget as HTMLElement | null

  if (!currentTarget) return

  const rect = currentTarget.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width - 0.5
  const y = (event.clientY - rect.top) / rect.height - 0.5

  heroPointer.value = { x, y, active: true }
}

function resetHeroPointer() {
  heroPointer.value = { x: 0, y: 0, active: false }
}

function syncReducedMotion() {
  reduceMotion.value = Boolean(motionMedia?.matches)
}

onMounted(() => {
  motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncReducedMotion()

  if ('addEventListener' in motionMedia) motionMedia.addEventListener('change', syncReducedMotion)
  else motionMedia.addListener(syncReducedMotion)
})

onBeforeUnmount(() => {
  if (!motionMedia) return

  if ('removeEventListener' in motionMedia) motionMedia.removeEventListener('change', syncReducedMotion)
  else motionMedia.removeListener(syncReducedMotion)
})

const revealObservers = new WeakMap<HTMLElement, IntersectionObserver>()

const vReveal: Directive<HTMLElement, void> = {
  mounted(el) {
    if (reduceMotion.value) {
      el.classList.add('is-visible')
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries

        if (!entry?.isIntersecting) return

        el.classList.add('is-visible')
        observer.unobserve(el)
      },
      {
        threshold: 0.01,
        rootMargin: '0px 0px -50px 0px'
      }
    )

    revealObservers.set(el, observer)
    observer.observe(el)
  },
  unmounted(el) {
    const observer = revealObservers.get(el)
    observer?.disconnect()
    revealObservers.delete(el)
  }
}
</script>

<template>
  <div class="relative min-h-screen overflow-x-hidden bg-[#050816] text-white">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.28),_transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(249,115,22,0.20),_transparent_22%),linear-gradient(180deg,_rgba(10,14,31,0.96),_rgba(5,8,22,1))]" />
    <div class="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(circle_at_center,black,transparent_82%)]" />

    <header class="sticky top-0 z-40 px-4 pt-4 sm:px-6 lg:px-8">
      <div class="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl sm:px-6">
        <NuxtLink to="/" class="flex items-center gap-3 cursor-pointer">
          <img
            src="https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/logo.png"
            alt="ContestSaaS"
            class="h-10 w-10 rounded-2xl object-contain"
          >
          <div>
            <p class="text-sm font-semibold tracking-[0.24em] text-white/90 uppercase">ContestSaaS</p>
            <p class="text-xs text-white/50">Concursos con presencia premium</p>
          </div>
        </NuxtLink>

        <div class="hidden items-center gap-8 text-sm text-white/60 md:flex">
          <a href="#features" class="transition-colors duration-200 hover:text-white">Producto</a>
          <a href="#workflow" class="transition-colors duration-200 hover:text-white">Flujo</a>
          <a href="#cta" class="transition-colors duration-200 hover:text-white">Empezar</a>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <Button as-child variant="ghost" class="rounded-full border border-white/10 bg-white/5 px-4 text-white hover:bg-white/10 hover:text-white">
            <NuxtLink to="/auth/login">Entrar</NuxtLink>
          </Button>
          <Button as-child class="rounded-full bg-[#f97316] px-5 text-white shadow-[0_18px_48px_rgba(249,115,22,0.35)] hover:bg-[#fb923c]">
            <NuxtLink :to="ctaHref">
              {{ ctaLabel }}
              <ArrowRight class="w-4 h-4" />
            </NuxtLink>
          </Button>
        </div>
      </div>
    </header>

    <main class="relative z-10">
      <section class="px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-24 lg:pt-14">
        <div class="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div class="space-y-8">
            <div v-reveal class="reveal" style="--reveal-delay: 80ms">
              <Badge variant="outline" class="border-white/10 bg-white/5 px-4 py-1.5 text-[11px] uppercase tracking-[0.28em] text-white/80 backdrop-blur-xl">
                <Sparkles class="w-3.5 h-3.5" />
                Motion premium para una primera impresion fuerte
              </Badge>
            </div>

            <div class="space-y-6">
              <div v-reveal class="reveal" style="--reveal-delay: 140ms">
                <p class="max-w-2xl text-[clamp(3.4rem,8vw,7rem)] font-black uppercase leading-[0.9] tracking-[-0.06em] text-white">
                  Organiza concursos que se sienten de otro nivel.
                </p>
              </div>

              <p v-reveal class="reveal max-w-2xl text-base leading-8 text-white/68 sm:text-lg" style="--reveal-delay: 220ms">
                Converti la landing en una experiencia cinematica: entradas precisas, profundidad visual y microinteracciones que hacen que la plataforma se vea solida antes de que el usuario siquiera inicie sesion.
              </p>
            </div>

            <div v-reveal class="reveal flex flex-col gap-3 sm:flex-row" style="--reveal-delay: 300ms">
              <Button as-child size="lg" class="h-12 rounded-full bg-[#f97316] px-7 text-base text-white shadow-[0_18px_54px_rgba(249,115,22,0.32)] hover:bg-[#fb923c]">
                <NuxtLink :to="ctaHref">
                  {{ ctaLabel }}
                  <ArrowRight class="w-4 h-4" />
                </NuxtLink>
              </Button>
              <Button as-child size="lg" variant="ghost" class="h-12 rounded-full border border-white/10 bg-white/5 px-7 text-base text-white hover:bg-white/10 hover:text-white">
                <a href="#preview">
                  <Play class="w-4 h-4" />
                  Ver recorrido
                </a>
              </Button>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <Card
                v-for="(metric, index) in metrics"
                :key="metric.label"
                v-reveal
                class="reveal rounded-[28px] border-white/10 bg-white/[0.04] shadow-[0_22px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl"
                :style="{ '--reveal-delay': `${360 + index * 70}ms` }"
              >
                <CardContent class="space-y-2 p-5">
                  <p class="text-3xl font-black tracking-[-0.06em] text-white">{{ metric.value }}</p>
                  <p class="text-sm leading-6 text-white/58">{{ metric.label }}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div
            id="preview"
            v-reveal
            class="reveal group relative"
            style="--reveal-delay: 220ms"
            @mousemove="updateHeroPointer"
            @mouseleave="resetHeroPointer"
          >
            <div class="absolute -inset-6 rounded-[40px] bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.28),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.2),_transparent_34%)] blur-3xl" />

            <div class="hero-tilt relative transition-transform duration-500 ease-out" :style="heroCardStyle">
              <div class="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0b1023] shadow-[0_35px_120px_rgba(0,0,0,0.45)]">
                <div class="absolute inset-0 opacity-90">
                  <ClientOnly>
                    <Grainient
                      v-if="!reduceMotion"
                      color1="#7c3aed"
                      color2="#f97316"
                      color3="#0b1023"
                      :time-speed="0.18"
                      :warp-strength="0.65"
                      :warp-frequency="4"
                      :warp-speed="1.4"
                      :warp-amplitude="44"
                      :rotation-amount="180"
                      :grain-amount="0.08"
                      :zoom="1.1"
                    />
                    <template #fallback>
                      <div class="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.35),_transparent_30%),radial-gradient(circle_at_75%_25%,_rgba(249,115,22,0.22),_transparent_24%),linear-gradient(180deg,_rgba(16,22,45,1),_rgba(7,10,24,1))]" />
                    </template>
                  </ClientOnly>
                </div>

                <div class="relative z-10 space-y-6 p-6 sm:p-8">
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <p class="text-xs uppercase tracking-[0.28em] text-white/55">Preview del producto</p>
                      <h2 class="mt-3 text-2xl font-bold tracking-[-0.04em] text-white">Control room para concursos con decision instantanea</h2>
                    </div>
                    <Badge class="border-0 bg-white/12 px-3 py-1.5 text-white shadow-none">
                      Live scoring
                    </Badge>
                  </div>

                  <div class="grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
                    <div class="space-y-4 rounded-[26px] border border-white/10 bg-[#090d1d]/80 p-5 backdrop-blur-xl">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <p class="text-sm font-semibold text-white">Piano Juvenil 2026</p>
                          <p class="text-xs text-white/45">Ronda semifinal activa</p>
                        </div>
                        <div class="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                          18 jurados online
                        </div>
                      </div>

                      <div class="space-y-3">
                        <div class="flex items-center justify-between text-xs text-white/55">
                          <span>Progreso de evaluacion</span>
                          <span>82%</span>
                        </div>
                        <div class="h-2 rounded-full bg-white/10">
                          <div class="h-2 w-[82%] rounded-full bg-gradient-to-r from-[#7c3aed] via-[#a78bfa] to-[#f97316] shadow-[0_0_28px_rgba(167,139,250,0.4)]" />
                        </div>
                      </div>

                      <div class="grid gap-3 sm:grid-cols-2">
                        <div class="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                          <div class="mb-3 flex items-center gap-2 text-white/72">
                            <Workflow class="w-4 h-4" />
                            <span class="text-xs uppercase tracking-[0.22em]">Flujo</span>
                          </div>
                          <p class="text-2xl font-bold tracking-[-0.04em] text-white">6 etapas</p>
                          <p class="mt-2 text-xs leading-5 text-white/50">Inscripcion, validacion, scoring, promotion y publicacion conectados.</p>
                        </div>

                        <div class="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                          <div class="mb-3 flex items-center gap-2 text-white/72">
                            <Users2 class="w-4 h-4" />
                            <span class="text-xs uppercase tracking-[0.22em]">Capacidad</span>
                          </div>
                          <p class="text-2xl font-bold tracking-[-0.04em] text-white">240</p>
                          <p class="mt-2 text-xs leading-5 text-white/50">Participantes y jurados sincronizados sin perder contexto.</p>
                        </div>
                      </div>
                    </div>

                    <div class="space-y-4">
                      <div class="rounded-[24px] border border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl">
                        <div class="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/55">
                          <Trophy class="w-4 h-4" />
                          Decision lista
                        </div>
                        <div class="space-y-3">
                          <div class="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                            <div>
                              <p class="text-sm font-medium text-white">Resultados</p>
                              <p class="text-xs text-white/45">Publicacion auditada</p>
                            </div>
                            <CheckCircle2 class="w-5 h-5 text-emerald-300" />
                          </div>
                          <div class="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                            <div>
                              <p class="text-sm font-medium text-white">Invitaciones</p>
                              <p class="text-xs text-white/45">Envios y confirmaciones</p>
                            </div>
                            <CheckCircle2 class="w-5 h-5 text-emerald-300" />
                          </div>
                          <div class="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
                            <div>
                              <p class="text-sm font-medium text-white">Promocion</p>
                              <p class="text-xs text-white/45">Cortes transparentes</p>
                            </div>
                            <CheckCircle2 class="w-5 h-5 text-emerald-300" />
                          </div>
                        </div>
                      </div>

                      <div class="rounded-[24px] border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.03] p-5 backdrop-blur-xl">
                        <p class="text-xs uppercase tracking-[0.22em] text-white/50">Se siente premium porque</p>
                        <ul class="mt-4 space-y-3 text-sm leading-6 text-white/72">
                          <li v-for="point in proofPoints" :key="point" class="flex gap-3">
                            <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-[#fb923c]" />
                            <span>{{ point }}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Card class="absolute -left-6 top-10 hidden w-48 rounded-[24px] border-white/10 bg-white/8 shadow-[0_28px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl lg:block lg:transition-transform lg:duration-500 lg:group-hover:-translate-y-2">
                <CardContent class="p-4">
                  <p class="text-xs uppercase tracking-[0.2em] text-white/50">Timings</p>
                  <p class="mt-3 text-3xl font-black tracking-[-0.05em] text-white">48h</p>
                  <p class="mt-2 text-xs leading-5 text-white/55">Menos tiempo entre cierre de ronda y decision final.</p>
                </CardContent>
              </Card>

              <Card class="absolute -bottom-6 right-6 hidden w-52 rounded-[24px] border-white/10 bg-[#f97316]/16 shadow-[0_28px_60px_rgba(249,115,22,0.24)] backdrop-blur-xl sm:block">
                <CardContent class="p-4">
                  <p class="text-xs uppercase tracking-[0.2em] text-white/60">Jurados activos</p>
                  <div class="mt-3 flex items-end justify-between gap-4">
                    <p class="text-3xl font-black tracking-[-0.05em] text-white">18</p>
                    <p class="text-xs text-emerald-200">+6 esta semana</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section id="features" class="px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        <div class="mx-auto max-w-7xl space-y-10">
          <div v-reveal class="reveal max-w-2xl space-y-4">
            <p class="text-xs uppercase tracking-[0.28em] text-[#a78bfa]">Producto</p>
            <h2 class="text-3xl font-black tracking-[-0.05em] text-white sm:text-5xl">Animacion con criterio: impacto arriba, claridad abajo.</h2>
            <p class="text-base leading-8 text-white/62">Cada bloque entra con cadencia propia, sin ruido visual. La percepcion es de una plataforma robusta, no de una plantilla generica.</p>
          </div>

          <div class="grid gap-4 lg:grid-cols-3">
            <Card
              v-for="(feature, index) in featureCards"
              :key="feature.title"
              v-reveal
              class="reveal rounded-[30px] border-white/10 bg-white/[0.04] shadow-[0_28px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1"
              :style="{ '--reveal-delay': `${index * 120}ms` }"
            >
              <CardContent class="space-y-6 p-7">
                <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/8 text-white">
                  <component :is="feature.icon" class="w-5 h-5" />
                </div>
                <div class="space-y-3">
                  <h3 class="text-2xl font-bold tracking-[-0.04em] text-white">{{ feature.title }}</h3>
                  <p class="text-sm leading-7 text-white/60">{{ feature.text }}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="workflow" class="px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        <div class="mx-auto max-w-7xl rounded-[36px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-8 lg:p-10">
          <div class="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div v-reveal class="reveal space-y-5">
              <p class="text-xs uppercase tracking-[0.28em] text-[#fb923c]">Flujo</p>
              <h2 class="text-3xl font-black tracking-[-0.05em] text-white sm:text-5xl">Coreografia visual para un producto que coordina muchas decisiones.</h2>
              <p class="text-base leading-8 text-white/62">La landing ya comunica la promesa del producto: menos friccion, mas control y una ejecucion que se siente cuidadosamente dirigida.</p>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <Card
                v-for="(item, index) in workflow"
                :key="item.step"
                v-reveal
                class="reveal rounded-[28px] border-white/10 bg-[#0b1023]/75 backdrop-blur-xl"
                :style="{ '--reveal-delay': `${120 + index * 110}ms` }"
              >
                <CardContent class="space-y-6 p-6">
                  <div class="flex items-center justify-between">
                    <span class="text-4xl font-black tracking-[-0.06em] text-white/18">{{ item.step }}</span>
                    <div class="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white">
                      <Workflow class="w-4 h-4" />
                    </div>
                  </div>
                  <div class="space-y-3">
                    <h3 class="text-xl font-bold tracking-[-0.04em] text-white">{{ item.title }}</h3>
                    <p class="text-sm leading-7 text-white/58">{{ item.text }}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section id="cta" class="px-4 pb-20 pt-12 sm:px-6 lg:px-8 lg:pb-28 lg:pt-20">
        <div class="mx-auto max-w-5xl overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(124,58,237,0.22),rgba(249,115,22,0.16),rgba(255,255,255,0.05))] p-8 shadow-[0_35px_110px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-10 lg:p-14">
          <div v-reveal class="reveal space-y-6 text-center">
            <p class="text-xs uppercase tracking-[0.3em] text-white/60">Listo para usar</p>
            <h2 class="mx-auto max-w-3xl text-3xl font-black tracking-[-0.05em] text-white sm:text-5xl">La landing ya no solo informa. Ahora vende la sensacion de control.</h2>
            <p class="mx-auto max-w-2xl text-base leading-8 text-white/68">Implemente una direccion visual mas cinematica y profesional en la home para que ContestSaaS entre con mucha mas fuerza desde el primer frame.</p>
            <div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button as-child size="lg" class="h-12 rounded-full bg-[#f97316] px-7 text-base text-white shadow-[0_18px_54px_rgba(249,115,22,0.28)] hover:bg-[#fb923c]">
                <NuxtLink :to="ctaHref">
                  {{ ctaLabel }}
                  <ArrowRight class="w-4 h-4" />
                </NuxtLink>
              </Button>
              <Button as-child size="lg" variant="ghost" class="h-12 rounded-full border border-white/10 bg-white/5 px-7 text-base text-white hover:bg-white/10 hover:text-white">
                <NuxtLink to="/auth/login">Ver acceso</NuxtLink>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.reveal {
  opacity: 0;
  transform: translateY(32px) scale(0.985);
  transition:
    opacity 720ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 900ms cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--reveal-delay, 0ms);
}

.reveal.is-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.reveal.is-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.hero-tilt {
  transform-style: preserve-3d;
}

@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .hero-tilt {
    transform: none !important;
  }
}
</style>
