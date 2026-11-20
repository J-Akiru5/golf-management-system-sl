"use client";

import { useEffect } from "react";
import { formatLandingCount, pickLandingMotionTier } from "./motion-utils";

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type MotionNavigator = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

function getMotionTier(): ReturnType<typeof pickLandingMotionTier> {
  const connection = (navigator as MotionNavigator).connection;
  const device = navigator as MotionNavigator;
  return pickLandingMotionTier({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: connection?.saveData,
    deviceMemory: device.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    viewportWidth: window.innerWidth,
  });
}

function scheduleMotion(start: () => void): () => void {
  const idleWindow = window as IdleWindow;
  let idleHandle: number | undefined;
  let timerHandle: number | undefined;
  let started = false;

  const removeListeners = () => {
    window.removeEventListener("scroll", onInteraction);
    window.removeEventListener("pointerdown", onInteraction);
  };

  const onInteraction = () => begin();
  const begin = () => {
    if (started) return;
    started = true;
    removeListeners();
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
    if (timerHandle !== undefined) window.clearTimeout(timerHandle);
    start();
  };

  window.addEventListener("scroll", onInteraction, { passive: true, once: true });
  window.addEventListener("pointerdown", onInteraction, { passive: true, once: true });
  if (idleWindow.requestIdleCallback) {
    idleHandle = idleWindow.requestIdleCallback(begin, { timeout: 1500 });
  } else {
    timerHandle = window.setTimeout(begin, 1500);
  }

  return () => {
    started = true;
    removeListeners();
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
    if (timerHandle !== undefined) window.clearTimeout(timerHandle);
  };
}

export function LandingMotion() {
  useEffect(() => {
    const tier = getMotionTier();
    const root = document.querySelector<HTMLElement>(".tl-landing");
    if (!root) return;
    root.dataset.tlMotionTier = tier;
    if (tier === "none") return () => delete root.dataset.tlMotionTier;

    let cancelled = false;
    let cleanupMotion: (() => void) | undefined;
    const cancelSchedule = scheduleMotion(() => {
      void (async () => {
        const [gsapModule, triggerModule] = await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
        ]);
        if (cancelled) return;

        const { gsap } = gsapModule;
        const { ScrollTrigger } = triggerModule;
        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });
        ScrollTrigger.defaults({ fastScrollEnd: true });

        const finePointer = window.matchMedia("(pointer: fine)").matches;
        const lenisModule = tier === "full" && finePointer ? await import("lenis") : null;
        if (cancelled) return;

        let lenisCleanup: (() => void) | undefined;
        let mediaContext: ReturnType<typeof gsap.matchMedia> | undefined;
        const pointerCleanups: (() => void)[] = [];
        if (lenisModule) {
          const lenis = new lenisModule.default({ duration: 1.05, smoothWheel: true });
          const updateScrollTrigger = () => ScrollTrigger.update();
          lenis.on("scroll", updateScrollTrigger);
          let frame = 0;
          const raf = (time: number) => {
            lenis.raf(time);
            frame = requestAnimationFrame(raf);
          };
          frame = requestAnimationFrame(raf);
          lenisCleanup = () => {
            lenis.off("scroll", updateScrollTrigger);
            lenis.destroy();
            cancelAnimationFrame(frame);
          };
        }

        const context = gsap.context(() => {
          if (tier === "full") mediaContext = gsap.matchMedia();
          // Motion starts after idle, so anything already on screen has been visible for a moment.
          // Animating it "from" hidden would make it blink out and back in; only content below the
          // fold gets a reveal. One layout read per element, once, at start.
          const viewportBottom = window.innerHeight;
          const reveal = (candidates: Element[], stagger = 0) => {
            const elements = candidates.filter(
              (element) => element.getBoundingClientRect().top > viewportBottom,
            );
            if (!elements.length) return;
            gsap.from(elements, {
              y: tier === "lite" ? 12 : 24,
              opacity: 0,
              duration: tier === "lite" ? 0.45 : 0.75,
              ease: "power3.out",
              stagger,
              immediateRender: false,
              scrollTrigger: { trigger: elements[0], start: "top 88%", once: true },
            });
          };

          const groupedElements = new Set<Element>();
          root.querySelectorAll<HTMLElement>("[data-tl-stagger]").forEach((group) => {
            const items = Array.from(group.querySelectorAll("[data-tl-reveal]"));
            items.forEach((item) => groupedElements.add(item));
            reveal(items, 0.06);
          });
          const singles = Array.from(root.querySelectorAll("[data-tl-reveal]")).filter(
            (element) =>
              !groupedElements.has(element) &&
              !(tier === "full" && element.closest(".tl-capability-story")),
          );
          singles.forEach((element) => reveal([element]));

          if (tier === "full") {
            mediaContext?.add("(max-width: 1023px)", () => {
              root.querySelectorAll(".tl-capability-story .tl-capability").forEach((step) => {
                reveal([step]);
              });
            });
            const hero = root.querySelector<HTMLElement>(".tl-hero");
            if (hero) {
              root.querySelectorAll<HTMLElement>("[data-tl-parallax]").forEach((layer) => {
                const speed = Number(layer.dataset.tlParallax);
                if (!Number.isFinite(speed)) return;
                const distance = Math.sign(speed) * Math.min(Math.abs(speed) * 160, 60);
                gsap.to(layer, {
                  y: -distance,
                  willChange: "transform",
                  ease: "none",
                  scrollTrigger: {
                    trigger: hero,
                    start: "top top",
                    end: "bottom top",
                    scrub: true,
                  },
                });
              });
              const heroCopy = hero.querySelector(".tl-club-hero");
              if (heroCopy) {
                gsap.to(heroCopy, {
                  y: -30,
                  opacity: 0,
                  willChange: "transform, opacity",
                  ease: "none",
                  scrollTrigger: {
                    trigger: hero,
                    start: "top top",
                    end: "bottom 35%",
                    scrub: true,
                  },
                });
              }
            }

            // The hero tee line draws itself in CSS on first paint (landing.css, tl-line-draw), so
            // it never waits for this script and is never reset by it.

            const frame = root.querySelector<HTMLElement>("[data-tl-tilt] .tl-hero-window");
            if (frame) {
              // Starts from the CSS resting tilt at scroll 0, so nothing jumps when this loads.
              gsap.fromTo(
                frame,
                { rotateX: 14, scale: 0.97 },
                {
                  rotateX: 0,
                  scale: 1,
                  willChange: "transform",
                  ease: "none",
                  scrollTrigger: {
                    trigger: root.querySelector(".tl-hero") ?? frame,
                    start: "top top",
                    end: () => `+=${Math.round(window.innerHeight * 0.6)}`,
                    invalidateOnRefresh: true,
                    scrub: true,
                  },
                },
              );
            }

            root.querySelectorAll<SVGPathElement>(".tl-diagram [data-tl-draw]").forEach((path) => {
              const length = path.getTotalLength();
              gsap.fromTo(
                path,
                { strokeDasharray: length, strokeDashoffset: length },
                {
                  strokeDashoffset: 0,
                  duration: 0.8,
                  ease: "power2.out",
                  scrollTrigger: {
                    trigger: path.closest(".tl-diagram"),
                    start: "top 82%",
                    once: true,
                  },
                },
              );
            });

            root.querySelectorAll<HTMLElement>("[data-tl-count]").forEach((element) => {
              const finalValue = Number(element.dataset.tlCount);
              const finalText = element.textContent ?? formatLandingCount(finalValue);
              if (!Number.isFinite(finalValue)) return;
              const counter = { value: 0 };
              gsap.to(counter, {
                value: finalValue,
                duration: 1.4,
                ease: "power2.out",
                snap: { value: 1 },
                onUpdate: () => {
                  element.textContent = formatLandingCount(counter.value);
                },
                onComplete: () => {
                  element.textContent = finalText;
                },
                scrollTrigger: { trigger: element, start: "top 88%", once: true },
              });
            });

            const buttons = Array.from(root.querySelectorAll<HTMLElement>(".tl-button-light"));
            if (finePointer) {
              buttons.forEach((button) => {
                const xTo = gsap.quickTo(button, "x", { duration: 0.35, ease: "power3.out" });
                const yTo = gsap.quickTo(button, "y", { duration: 0.35, ease: "power3.out" });
                let bounds: DOMRect | undefined;
                const onEnter = () => {
                  bounds = button.getBoundingClientRect();
                };
                const onMove = (event: PointerEvent) => {
                  if (!bounds) return;
                  xTo(
                    Math.max(
                      -6,
                      Math.min(6, (event.clientX - bounds.left - bounds.width / 2) * 0.12),
                    ),
                  );
                  yTo(
                    Math.max(
                      -6,
                      Math.min(6, (event.clientY - bounds.top - bounds.height / 2) * 0.12),
                    ),
                  );
                };
                const onLeave = () => {
                  bounds = undefined;
                  xTo(0);
                  yTo(0);
                };
                button.addEventListener("pointerenter", onEnter, { passive: true });
                button.addEventListener("pointermove", onMove, { passive: true });
                button.addEventListener("pointerleave", onLeave, { passive: true });
                pointerCleanups.push(() => {
                  button.removeEventListener("pointerenter", onEnter);
                  button.removeEventListener("pointermove", onMove);
                  button.removeEventListener("pointerleave", onLeave);
                });
              });
            }

            mediaContext?.add("(min-width: 1024px)", () => {
              const capabilities = root.querySelector<HTMLElement>(".tl-capabilities");
              const story = capabilities?.querySelector<HTMLElement>(".tl-capability-story");
              const steps = story
                ? Array.from(story.querySelectorAll<HTMLElement>(".tl-capability"))
                : [];
              const progress = story?.querySelector<HTMLElement>(".tl-story-progress-fill");
              const progressLabels = story?.querySelectorAll<HTMLElement>(
                ".tl-story-progress-label",
              );
              if (!capabilities || !story || steps.length !== 3 || !progress) return;

              capabilities.classList.add("is-pinned-story");
              gsap.set(steps.slice(1), { opacity: 0 });
              if (progressLabels) {
                gsap.set(progressLabels, { opacity: 0.45 });
                const firstProgressLabel = progressLabels[0];
                if (firstProgressLabel) gsap.set(firstProgressLabel, { opacity: 1 });
              }
              const timeline = gsap.timeline({
                scrollTrigger: {
                  trigger: story,
                  start: "top top+=40",
                  end: () => `+=${window.innerHeight * 2.5}`,
                  pin: true,
                  scrub: true,
                  anticipatePin: 1,
                  invalidateOnRefresh: true,
                },
              });
              timeline.to(progress, { scaleX: 1, duration: 3, ease: "none" }, 0);
              for (let index = 1; index < steps.length; index += 1) {
                const previous = steps[index - 1];
                const current = steps[index];
                if (!previous || !current) continue;
                timeline.to(previous, { opacity: 0, duration: 0.24 }, index - 0.12);
                timeline.to(current, { opacity: 1, duration: 0.24 }, index - 0.12);
                const previousLabel = progressLabels?.[index - 1];
                const currentLabel = progressLabels?.[index];
                if (previousLabel && currentLabel) {
                  timeline.to(previousLabel, { opacity: 0.45, duration: 0.18 }, index - 0.12);
                  timeline.to(currentLabel, { opacity: 1, duration: 0.18 }, index - 0.12);
                }
              }

              return () => capabilities.classList.remove("is-pinned-story");
            });
          }
        }, root);

        cleanupMotion = () => {
          mediaContext?.revert();
          context.revert();
          pointerCleanups.forEach((cleanup) => cleanup());
          lenisCleanup?.();
        };
      })();
    });

    return () => {
      cancelled = true;
      cancelSchedule();
      cleanupMotion?.();
      delete root.dataset.tlMotionTier;
    };
  }, []);

  return null;
}
