"""renderer.py — which WebGL renderer a headless Chromium uses; shared by the scripts that start one.

gpu (the default): ANGLE on the machine's graphics card through EGL (`--use-angle=gl-egl`). With `--headless=new` it
needs no window and no display. Measured on one machine (an NVIDIA GTX 1660, 2026-11-06): the tiny race test
(tools/automation-data/README.md) in 56 s instead of 226 s with swiftshader, a text scan of 23 screens in 55 s instead
of 268 s, at about 1 % of the CPU time.
swiftshader: on the CPU (`--use-angle=swiftshader --enable-unsafe-swiftshader`), for a machine without a usable graphics
card, or without nvidia-smi (chromium_lock.py reads it before a gpu run). Slow: about one frame per second in a 3D scene
on a busy 16-core machine.

Choose with SCRIPTED_BROWSER_RENDERER=gpu|swiftshader in the environment; any other value is an error. The lock
(chromium_lock.py, beside this file) takes the same word as its kind: a gpu run takes one slot and two may run at once,
a swiftshader run takes all of them.

Chromium falls back to software by itself when its GPU process fails, and chrome://gpu then still says "Hardware
accelerated"; only the page's WebGL renderer string tells. So a script reads it in the page (RENDERER_JS) and check()
stops a gpu run that draws in software or has no WebGL2. A GPU process can also die during a run, and Chromium starts
another; the page may go on without its WebGL. Chromium's log then has a line with GPU_DIED, which gpu_deaths() finds:
scripted_browser.py reads the log just before it stops Chromium, and runs check() again at the end of the steps.
"""
import os

ENV = "SCRIPTED_BROWSER_RENDERER"
# Not about the renderer, but in both lists so that every script starting Chromium from them has it: Chromium keeps a
# page it navigated away from in its back-forward cache, WebGL context included, so each new page loaded in one browser
# added a scene's video memory to the last (2026-11-06, a GTX 1660 with 6 GB, the two browsers of our rover battery, see
# "Tests we run" in d-browser-automation.md: their GPU processes grew to 2655 and 2666 MiB, the card had less than 200
# MiB free for 14 s (134 MiB at the least), then one GPU process died, exit_code=11; the other went on to 4485 MiB). The
# same run with this flag: at most 1376 MiB per browser, falling after each load, and at least 2738 MiB of the card
# free; no GPU process died. A caller that needs its own --disable-features should put BackForwardCache in that same
# list: whether Chromium merges two such switches was not checked.
NO_BFCACHE = "--disable-features=BackForwardCache"
FLAGS = {"gpu": ["--use-angle=gl-egl", NO_BFCACHE],
         "swiftshader": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", NO_BFCACHE]}
SOFTWARE = ("SwiftShader", "llvmpipe", "softpipe", "Software")  # words in the renderer string of a software renderer
RENDERER_JS = ("(() => { const gl = document.createElement('canvas').getContext('webgl2');"
               " if (!gl) return 'no WebGL2';"
               " const d = gl.getExtension('WEBGL_debug_renderer_info');"
               " return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'no WEBGL_debug_renderer_info' })()")
# Chromium's browser process logs it (gpu_process_host.cc) a few ms after a page notices; seen on 2026-11-06 as
# "GPU process exited unexpectedly: exit_code=11"
GPU_DIED = "GPU process exited unexpectedly"


def kind():
    """The renderer asked for in the environment: 'gpu' when unset. Any other value than gpu or swiftshader raises."""
    k = os.environ.get(ENV, "gpu")
    if k not in FLAGS:
        raise ValueError(f"{ENV}={k!r}: must be one of {', '.join(FLAGS)}")
    return k


def check(k, renderer, at_end=False):
    """Raises when a gpu run's page draws in software or has no WebGL2. renderer: the value of RENDERER_JS; at_end:
    read after the run's steps, when the graphics card worked at the start (only the message differs)."""
    if k == "gpu" and (not isinstance(renderer, str) or renderer.startswith("no ")
                       or any(w in renderer for w in SOFTWARE)):
        if at_end:
            raise RuntimeError(f"the page had the GPU at the start, but a new WebGL2 context at the end gets "
                               f"{renderer!r}: most likely Chromium's GPU process failed during the run, see "
                               f"chrome.log")
        raise RuntimeError(f"asked for the GPU, but the page draws with {renderer!r}: see chrome.log, or set "
                           f"{ENV}=swiftshader on a machine without a usable graphics card")


def gpu_deaths(log_path):
    """The lines of a Chromium log (its stderr) that say its GPU process died, stripped; [] when none."""
    with open(log_path, errors="replace") as f:
        return [line.strip() for line in f if GPU_DIED in line]
