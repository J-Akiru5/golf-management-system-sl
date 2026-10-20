"use client";

import { useEffect } from "react";

/**
 * Scroll motion for the public page.
 *
 * Lenis gives the page its weight, GSAP's ScrollTrigger drives the reveals and parallax. Both are
 * imported inside the effect, so neither is part of the first paint: the page arrives server
 * rendered and the motion attaches afterwards. That is deliberate, because the hero is the largest
 * paint and it should never wait on a bundle.
 *
 * The page works entirely without this component. Reveals start from the natural state and are
 * animated *from* an offset, so if the script never loads, or the visitor has asked for less motion,
 * every section is simply already there. Nothing is left invisible.
 */
export function MotionLayer() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const [lenisModule, gsapModule, triggerModule] = await Promise.all([
        import("lenis"),
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;

      const Lenis = lenisModule.default;
      const { gsap } = gsapModule;
      const { ScrollTrigger } = triggerModule;
      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis({ duration: 1.05, smoothWheel: true });
      const onScroll = () => ScrollTrigger.update();
      lenis.on("scroll", onScroll);

      let frame = 0;
      const raf = (time: number) => {
        lenis.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);

      const context = gsap.context(() => {
        for (const element of gsap.utils.toArray<HTMLElement>("[data-motion='reveal']")) {
          gsap.from(element, {
            y: 34,
            opacity: 0,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 84%", once: true },
          });
        }

        for (const group of gsap.utils.toArray<HTMLElement>("[data-motion='group']")) {
          const items = group.querySelectorAll("[data-motion='item']");
          if (items.length === 0) continue;
          gsap.from(items, {
            y: 42,
            opacity: 0,
            duration: 0.85,
            ease: "power3.out",
            stagger: 0.12,
            scrollTrigger: { trigger: group, start: "top 82%", once: true },
          });
        }

        for (const layer of gsap.utils.toArray<HTMLElement>("[data-motion='parallax']")) {
          gsap.to(layer, {
            yPercent: 12,
            ease: "none",
            scrollTrigger: {
              trigger: layer.parentElement ?? layer,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          });
        }
      });

      cleanup = () => {
        context.revert();
        lenis.off("scroll", onScroll);
        lenis.destroy();
        cancelAnimationFrame(frame);
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
