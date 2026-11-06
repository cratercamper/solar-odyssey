#!/usr/bin/env python3
"""chromium_lock.py — holders in turn on this machine among the scripts that take this lock (first come, first served).
There are GPU_SLOTS slots: a gpu run takes one of them, so that many gpu runs may run at once; a swiftshader run, or
one without a kind, takes all of them and runs alone. The holder decides how many headless Chromiums it starts: one of
our own test scripts starts two (on the GPU it takes two slots).

Why: on 2026-11-04 several software-rendered browsers at once used up the memory (1.6 to 1.8 GB available), and the
system's out-of-memory guard (earlyoom) stopped a test's page processes. Scripts that take this lock run beside one
another only as far as the slots allow, and a gpu run starts beside another only while enough memory is available; a
script that starts a Chromium without it is not held back. Before the queue, every waiter polled and the fastest
grabber won, so one waiter could wait for ever.

    import chromium_lock
    chromium_lock.acquire("my-test 5173")   # waits for its turn; prints its place in the queue while it waits
    try: ...
    finally: chromium_lock.release()

    chromium_lock.acquire("my-scan", kind="gpu")            # one slot: may run beside another gpu run
    chromium_lock.acquire("my-test", kind="gpu", slots=2)   # two browsers, both on the GPU: two slots

    python3 chromium_lock.py status          # slots, OLD_LOCK and queue, oldest first
    python3 chromium_lock.py run [--gpu [--slots N]] <label> -- <command...>
        # for a script in another language: waits for its turn, runs the command (in its own process group) while
        # holding the lock, then releases it. Without --gpu it takes all slots. With --gpu the command's environment
        # gets the gpu renderer (renderer.ENV, renderer.py beside this file); if the environment already asks for
        # another renderer, `run --gpu` refuses with exit 2. Exit = the command's status (128+n if signal n stopped it
        # or the wrapper); 1 with the usage line for bad arguments; 1, with a traceback, if the wrapper itself fails
        # (for example a release that a stopped process holding the turn blocks: see TURN_WAIT). SIGTERM, SIGHUP or
        # SIGINT to the wrapper stops the whole command, then releases the lock.
        # SIGKILL cannot: the command runs in a session of its own, so a SIGKILL to the wrapper (as `timeout -k`
        # sends) leaves it running without the lock. A command that takes the lock itself (scripted_browser.py, or
        # any script that imports this module) waits for its own turn: under `run` its acquire() refuses at once. The
        # command has no controlling terminal (no /dev/tty): nothing that prompts.
        # Hold the lock per step (one page, one build), not per job: between steps others in the queue get their turn.

Slots. kind "gpu" (a Chromium that renders on the GPU: renderer.py) takes `slots` of them, 1 unless asked. A gpu run
starts only while the GPU has GPU_FREE_MIB free for each slot it takes (counting a run that started less than
GPU_START_S ago as using its share already) and, when it would start beside another run, while the machine has
GPU_MEM_MIN_MIB of memory available. Without nvidia-smi a gpu run fails at once: run it as kind "swiftshader". The queue
stays first come, first served: only the oldest ticket takes slots, so no run passes one queued before it, even when a
slot is free.

How: a waiter puts a ticket into QUEUE (a file named by the time it arrived) and takes its slots, all at once, only
once its ticket is the oldest of a live process. Slot 1 is the file LOCK, slot i the file LOCK followed by i (…lock2).
Every entry appears with its whole text at once (written to a temporary file, then linked into place; OLD_LOCK's
hand-over and take-over rename it over the entry that was there), records the
process id, the number of slots its run holds and its PID namespace ("<pid> <time> <label> slots=<n> pidns=<ns>"), and
is removed by whoever finds that its process is gone. An entry without slots= was written before slots existed and
counts as all of them. Runs take and leave slots, and hand OLD_LOCK on, one at a time: an flock of QUEUE, which the
kernel drops when its process dies (the turn; see TURN_WAIT). On return, acquire() leaves a thread running in its
process until release(): the OLD_LOCK keeper (_keep_old_lock). Only processes of the
machine's own PID namespace may queue: inside a sandbox other processes are invisible, and a live holder would look
dead. A holder that keeps the lock longer than the hold limit is reported, not waited for; so are gates that hold a gpu
run back that long. Linux only (/proc).
"""
import contextlib
import fcntl
import os
import signal
import subprocess
import sys
import threading
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
import renderer  # noqa: E402 (beside this file: the renderer a `run --gpu` command is told to use)

if os.path.dirname(os.path.abspath(renderer.__file__)) != _HERE:
    raise ImportError(f"imported renderer from {renderer.__file__}, not the one beside this file in {_HERE}")

LOCK = "/tmp/headless-chromium.lock"  # slot 1; slot i ≥ 2 is f"{LOCK}{i}"
QUEUE = "/tmp/headless-chromium.queue"
# Older scripts of ours (not published) take only OLD_LOCK, with no namespace mark and in two steps (create, then
# write), and others still watch it; so it is held while any run holds a slot. The first run in takes it; one that
# leaves while another run still holds a slot hands it to that run (written beside it, then renamed over it: it is
# never absent); and a run that holds a slot takes it over from a holder that died without release() (_keep_old_lock).
# Code from before slots runs only once it holds both LOCK and OLD_LOCK, so it does not run beside a slot holder, except
# when it gets in through the windows _keep_old_lock leaves open after a holder of OLD_LOCK dies without release(): then
# it runs beside the slot holders until it leaves, and the keeper puts OLD_LOCK back after it.
OLD_LOCK = "/tmp/ody-battery.lock"
INIT_PIDNS = "pid:[4026531836]"  # the kernel's initial PID namespace (PROC_PID_INIT_INO): the machine's own
# s; the longest test run measured took 27 min (a run of our rover battery, 2026-11-04: "Tests we run" in
# d-browser-automation.md): an hour leaves room for twice that
HOLD_LIMIT = 3600
EMPTY_GRACE = 10   # s an entry may stay empty (an older writer creates the file before writing it); then it is dead
POLL = 0.5         # s between looks while waiting (and between the OLD_LOCK keeper's looks while holding)
SAY = 60           # s between "still waiting" lines (a change is said at once)
# s a process waits for the turn (the flock of QUEUE) before it looks at the holder. A holder keeps it for a few file
# operations on /tmp (at most 0.08 ms in 900 turns, measured 2026-11-06), but a running one can stall far longer (paging,
# a loaded machine): it is named on stderr and waited for. A stopped one (state T: Ctrl-Z, SIGSTOP, a debugger) would
# hold everyone back until someone continues it: the waiter raises TimeoutError naming it. Looked at again every
# TURN_WAIT seconds.
TURN_WAIT = 2.0

GPU_SLOTS = 2         # gpu runs side by side, for now; two at once measured clean (2026-11-06)
GPU_FREE_MIB = 2048   # free VRAM (nvidia-smi memory.free) a gpu run needs for each slot it takes, before it starts
# s after its start that a gpu run counts as still using GPU_FREE_MIB per slot in the VRAM gate, whatever nvidia-smi
# shows: its browser takes its GPU memory as it starts and loads its first page, and until then two runs could pass
# one 2048 MiB check together. An allowance for start-up and the first page, not measured.
GPU_START_S = 30
# MemAvailable a gpu run needs to start beside another run: the newcomer's peak (≤ 2.9 GB) + the other browser's growth
# (≤ 2.9 GB) + earlyoom's mark (≤ 2.1 GB: it kills when available memory ≤ 10 % and free swap ≤ 10 %). A run that starts
# alone (one that takes all slots always does) is not held back by it.
GPU_MEM_MIN_MIB = 8192
MEMINFO = "/proc/meminfo"

HOLDER_ENV = "CHROMIUM_LOCK_HOLDER"  # set by run() for its command: the pid that holds the lock on the command's behalf

_STOP_SIGS = (signal.SIGTERM, signal.SIGHUP, signal.SIGINT)
_held = []        # the lock files this process took, in the order taken (OLD_LOCK can also be handed to it: release)
_foreign = set()  # tickets from another PID namespace, already reported
_keeper = None    # (thread, stop event) of _keep_old_lock, while this process's acquire() has returned and not released
_local = threading.local()  # .later: inside _turn(), log lines wait there until the turn is given back


def _log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] chromium_lock: {msg}"
    later = getattr(_local, "later", None)
    if later is not None:
        later.append(line)  # never write to stderr while holding the turn: a full pipe would hold everyone back
    else:
        print(line, file=sys.stderr, flush=True)


def _pidns():
    try:
        return os.readlink("/proc/self/ns/pid")
    except FileNotFoundError:
        raise RuntimeError("no /proc/self/ns/pid: this lock needs Linux. Where this is the only headless Chromium, "
                           "run scripted_browser.py, ../localization/en_scan.py and ../localization/checks/"
                           "visible_text.py without it, with SCRIPTED_BROWSER_LOCK=off, and a command meant for "
                           "`chromium_lock.py run` on its own, without the wrapper") from None


def _require_host():
    if _pidns() != INIT_PIDNS:
        raise RuntimeError(f"this process runs in PID namespace {_pidns()}, not the machine's own ({INIT_PIDNS}): "
                           "it cannot see the other runs (a sandbox or container?); run it outside, or, where this "
                           "is the only headless Chromium, run scripted_browser.py, ../localization/en_scan.py and "
                           "../localization/checks/visible_text.py with SCRIPTED_BROWSER_LOCK=off, and a command meant "
                           "for `chromium_lock.py run` on its own, without the wrapper")


def _entry(label, slots):
    return f"{os.getpid()} {time.strftime('%H:%M:%S')} {label} slots={slots} pidns={_pidns()}\n"


def _slots_of(text):
    """The number of slots an entry's run holds, or None for an entry without slots= (written before slots existed,
    or still being written): it counts as all of them."""
    words = (text or "").split()
    if len(words) >= 2 and words[-1].startswith("pidns=") and words[-2].startswith("slots="):
        n = words[-2][len("slots="):]
        if not n.isdigit():
            raise RuntimeError(f"not '… slots=<n> pidns=…': {text!r}; remove it once no run is going on")
        return int(n)
    return None


def _describe(text):
    n = _slots_of(text)
    return "all slots: no slots= word" if n is None else f"{n} slot{'' if n == 1 else 's'}"


def _slot_path(i):
    return LOCK if i == 1 else f"{LOCK}{i}"


def _slot_paths():
    return [_slot_path(i) for i in range(1, GPU_SLOTS + 1)]


def _read(path):
    """The entry in a lock or ticket file, or None if it is gone (removed meanwhile)."""
    try:
        with open(path) as f:
            return f.read().strip()
    except FileNotFoundError:
        return None


def _age(path):
    try:
        return time.time() - os.stat(path).st_mtime
    except FileNotFoundError:
        return None


def _publish(path, text, like=None):
    """Make path appear with its whole text at once, if it does not exist yet. False if it exists. like: a file whose
    times it gets (a run's slot file: its hold age goes with it)."""
    st = os.stat(like) if like is not None else None  # first: if like is gone, nothing is written
    tmp = f"{os.path.dirname(path)}/.{os.path.basename(path)}.{os.getpid()}.tmp"
    with open(tmp, "w") as f:
        f.write(text)
    if st is not None:
        os.utime(tmp, (st.st_atime, st.st_mtime))
    try:
        os.link(tmp, path)
        return True
    except FileExistsError:
        return False
    finally:
        os.remove(tmp)


def _replace(path, text, like):
    """Replace path whole with text (written beside it, then renamed over it: never absent), with the times of the file
    like (a run's slot file: its hold age goes with it)."""
    st = os.stat(like)  # first: if like is gone, nothing is written
    tmp = f"{os.path.dirname(path)}/.{os.path.basename(path)}.{os.getpid()}.replace"
    with open(tmp, "w") as f:
        f.write(text if text.endswith("\n") else text + "\n")
    os.utime(tmp, (st.st_atime, st.st_mtime))
    os.replace(tmp, path)


def _ns(text):
    words = text.split()
    return words[-1][len("pidns="):] if words and words[-1].startswith("pidns=") else None


def _alive(path, text):
    """Whether the process that wrote this entry still runs (or may still: see the cases)."""
    if text == "":  # being written by an older script, or its writer died before writing it
        age = _age(path)
        return age is None or age < EMPTY_GRACE
    words = text.split()
    if not words[0].isdigit():
        raise RuntimeError(f"{path}: not '<pid> <time> <label> slots=<n> pidns=…': {text!r}; remove it once no run is "
                           "going on")
    ns = _ns(text)
    if ns is not None and ns != _pidns():
        return True  # from another namespace: cannot be judged here; taken as alive (the hold limit reports it)
    return os.path.exists(f"/proc/{words[0]}")  # unmarked = an older script on the machine's own namespace


def _drop_if_dead(path, text):
    """Remove an entry whose writer is gone, unless it changed meanwhile. True if the entry is (now) gone."""
    if _alive(path, text):
        return False
    if _read(path) == text:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass  # another waiter removed the same dead entry first
        _log(f"removed the entry of a process that is gone: {path}: {text or '(empty)'}")
    return True


def _queue():
    """Names of the tickets that count, oldest first. Dead ones are removed on the way."""
    live = []
    for name in sorted(os.listdir(QUEUE)):
        if name.startswith("."):
            continue  # a ticket still being written
        path = f"{QUEUE}/{name}"
        text = _read(path)
        if text is None:
            continue
        if text and _ns(text) not in (None, _pidns()):
            if name not in _foreign:
                _foreign.add(name)
                _log(f"skipping a ticket from another PID namespace (its process fails by itself): {path}: {text}")
            continue
        if not _drop_if_dead(path, text):
            live.append(name)
    return live


def _try_take(path, label, slots):
    """Take a lock file. False if a live process holds it; a dead holder's file is taken over."""
    while True:
        if _publish(path, _entry(label, slots)):
            _held.append(path)
            return True
        text = _read(path)
        if text is not None and not _drop_if_dead(path, text):
            return False


def holder(path=LOCK):
    return _read(path)


def _turn_holder():
    """Who holds the turn, from /proc/locks: ('pid N (state S)', whether it is stopped), or (None, False) when no
    process is listed (nobody holds it, or its holder has just given it back)."""
    st = os.stat(QUEUE)
    dev = f"{os.major(st.st_dev):02x}:{os.minor(st.st_dev):02x}:{st.st_ino}"
    with open("/proc/locks") as f:
        for line in f:
            words = line.split()
            if len(words) >= 6 and words[1] == "FLOCK" and words[5] == dev:
                try:
                    with open(f"/proc/{words[4]}/stat") as s:
                        state = s.read().rsplit(")", 1)[1].split()[0]
                except FileNotFoundError:
                    state = "gone"
                stopped = state in ("T", "t")
                return f"pid {words[4]} (state {state}{', stopped' if stopped else ''})", stopped
    return None, False


@contextlib.contextmanager
def _turn():
    """One process at a time takes or leaves slots and hands OLD_LOCK on: an flock of QUEUE, which the kernel drops
    when its process dies. Every TURN_WAIT seconds of waiting it looks at the holder: a running one is named on stderr
    and waited for; a stopped one makes it raise TimeoutError naming it. SIGTERM, SIGHUP and SIGINT wait until the
    change is whole (half a hand-over would leave a running holder without OLD_LOCK); they act as soon as it is. Log
    lines written meanwhile are printed once the turn is given back."""
    os.makedirs(QUEUE, exist_ok=True)
    fd = os.open(QUEUE, os.O_RDONLY | os.O_DIRECTORY)
    mask, lines = None, []
    try:
        start = time.monotonic()
        look, said = start + TURN_WAIT, None
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                now = time.monotonic()
                if now >= look:
                    who, stopped = _turn_holder()
                    who = who or "a process not listed in /proc/locks"
                    if stopped:
                        raise TimeoutError(f"{QUEUE}: its flock (the turn to take or leave slots) is held by {who}; "
                                           f"this process waited {now - start:.0f} s for it. A stopped holder holds "
                                           "everyone back: continue it (kill -CONT) or stop it")
                    if said is None or now - said >= SAY:
                        _log(f"waiting {now - start:.0f} s for the turn ({QUEUE}): held by {who}, running: waiting on")
                        said = now
                    look = now + TURN_WAIT
                time.sleep(0.002)
        mask = signal.pthread_sigmask(signal.SIG_BLOCK, _STOP_SIGS)
        _local.later = lines
        yield
    finally:
        _local.later = None
        os.close(fd)  # drops the flock
        try:
            if mask is not None:
                signal.pthread_sigmask(signal.SIG_SETMASK, mask)
        finally:
            for line in lines:
                print(line, file=sys.stderr, flush=True)


def _slots_needed(kind, slots):
    if kind == "gpu":
        n = 1 if slots is None else slots
        if type(n) is not int or not 1 <= n <= GPU_SLOTS:
            raise ValueError(f"slots={slots!r}: a gpu run takes 1 to {GPU_SLOTS} (GPU_SLOTS) slots")
        return n
    if kind in (None, "swiftshader"):
        if slots is not None:
            raise ValueError(f"slots={slots!r} with kind {kind!r}: only a gpu run takes a number of slots; a "
                             "swiftshader run (or one without a kind) takes all of them")
        return GPU_SLOTS
    raise ValueError(f"kind {kind!r}: 'gpu', 'swiftshader' or None")


_NO_GPU = ('run it as kind "swiftshader" (software rendering, all slots: for scripted_browser.py, '
           '../localization/en_scan.py and ../localization/checks/visible_text.py, set '
           'SCRIPTED_BROWSER_RENDERER=swiftshader; under `chromium_lock.py run`, set it for the command too and leave '
           'out --gpu), which needs no GPU')


def _vram_free_mib():
    """Free VRAM in MiB, from nvidia-smi. Raises if nvidia-smi is missing, fails, or reports anything but one number."""
    cmd = ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
    except FileNotFoundError:
        raise RuntimeError(f"nvidia-smi is not on PATH: a gpu run cannot see the GPU's free memory; {_NO_GPU}")
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"`{' '.join(cmd)}` did not answer within 10 s; {_NO_GPU}")
    words = r.stdout.split()
    if r.returncode != 0 or len(words) != 1 or not words[0].isdigit():
        raise RuntimeError(f"`{' '.join(cmd)}`: exit {r.returncode}, output {r.stdout!r}, errors {r.stderr.strip()!r}; "
                           f"expected one number (MiB free on the one GPU); {_NO_GPU}")
    return int(words[0])


def _mem_available_mib():
    with open(MEMINFO) as f:
        for line in f:
            if line.startswith("MemAvailable:"):
                words = line.split()
                if len(words) != 3 or not words[1].isdigit() or words[2] != "kB":
                    raise RuntimeError(f"{MEMINFO}: not 'MemAvailable: <n> kB': {line.strip()!r}")
                return int(words[1]) // 1024
    raise RuntimeError(f"{MEMINFO} has no MemAvailable line")


def _gates(n, held):
    """Why a gpu run of n slots must not start now beside the holders `held` (None: it may): the VRAM gate (a slot held
    by a run younger than GPU_START_S counts as using GPU_FREE_MIB already), and the RAM gate when it would start beside
    another run."""
    why = []
    vram = _vram_free_mib()
    ages = [_age(p) for p in held]  # None: given back since the look
    young = sum(1 for a in ages if a is not None and a < GPU_START_S)
    if vram - GPU_FREE_MIB * young < GPU_FREE_MIB * n:
        why.append(f"VRAM gate: {vram} MiB free" + (f", {GPU_FREE_MIB * young} of it counted for {young} slot(s) of "
                                                    f"runs started less than {GPU_START_S} s ago" if young else "")
                   + f", needs {GPU_FREE_MIB * n} ({GPU_FREE_MIB} per slot)")
    if held:
        mem = _mem_available_mib()
        if mem < GPU_MEM_MIN_MIB:
            why.append(f"RAM gate: {mem} MiB available, needs {GPU_MEM_MIN_MIB} to start beside another run")
    return "; ".join(why) or None


def _look(drop):
    """The slot files: (free paths, {path: entry} of the live holders). drop: remove dead holders' entries on the way
    (the head of the queue, as it takes slots); otherwise a dead holder's slot only counts as free."""
    free, held = [], {}
    for path in _slot_paths():
        text = _read(path)
        if text is None or (_drop_if_dead(path, text) if drop else not _alive(path, text)):
            free.append(path)
        else:
            held[path] = text
    return free, held


def _blocker(n, free, held):
    """None if a run of n slots may take them now; else the file of the holder it waits for: the one whose leaving lets
    it in, if the younger holders leave first."""
    for path, text in held.items():
        if _slots_of(text) is None:  # a run from before slots (or an entry being written): it holds all slots
            old_text = holder(OLD_LOCK)
            if path == LOCK and old_text is not None and old_text.split()[:1] != text.split()[:1]:
                return OLD_LOCK  # that run waits for an older script's OLD_LOCK: the queue waits for the older script
            return path
    if len(free) >= n:
        return None
    runs = {}  # pid → its first slot file (whose age is its hold)
    for path, text in held.items():
        runs.setdefault(text.split()[0], path)
    need = n - len(free)
    for path in sorted(runs.values(), key=lambda p: _age(p) or 0):  # youngest first
        need -= _slots_of(held[path])
        if need <= 0:
            break
    return path


def _take_slots(label, n, gated_beside):
    """Under _turn(): take n free slot files, all or none. gated_beside: the gates were passed for a start beside
    another run. True if taken."""
    free, held = _look(drop=True)
    if _blocker(n, free, held) is not None or (held and not gated_beside):
        return False
    taken = []
    for path in free[:n]:
        if not _try_take(path, label, n):
            break  # taken meanwhile by a process outside the queue's order: give back, look again
        taken.append(path)
    if len(taken) == n:
        return True
    for path in taken:
        os.remove(path)
        _held.remove(path)
    return False


def _old_lock_covered(label, n):
    """Under _turn(): whether OLD_LOCK is held for this run, by itself (taken now, or handed to it) or by another run
    that holds slots (which hands it on when it leaves)."""
    if OLD_LOCK in _held:
        return True
    text = holder(OLD_LOCK)
    if text:
        pid = text.split()[0]
        if pid == str(os.getpid()):
            return True
        others = {t.split()[0] for t in _look(drop=False)[1].values() if _slots_of(t) is not None}
        if pid in others:
            return True
    return _try_take(OLD_LOCK, label, n)


def _keep_old_lock(stop, entry, slot):
    """While this process holds its slots (a thread, from acquire()'s return to release()): every POLL, if OLD_LOCK
    names a process that is gone (its holder died without release(): SIGKILL, or a SIGTERM without a handler), take it
    over with this run's entry, so that older scripts stay out. Under the turn, only while this run's own slot file
    still names it, and only if OLD_LOCK still holds the dead entry that was read; the replace itself (written beside,
    renamed over) comes a few microseconds after that compare.
    A missing OLD_LOCK: if this run took it itself, it is said on stderr (ERROR) and release() raises, as before slots
    (only something that removes a live entry makes it go). If another run held it for this one, this run publishes its
    own entry there (linked into place, so an older script's file that appeared first is never overwritten) and says so.
    An error here (the turn's holder stopped, a file gone) is said on stderr, and the next look tries again: the thread
    does not end before release().
    Left open: from the holder's death to this thread's next look (up to POLL), an older script may remove the dead entry
    and write its own; one that does the same in the microseconds between the compare and the replace is overwritten.
    Either runs beside this run until it leaves; after it, this run puts its own entry back on its next look, so the
    older scripts after it wait again. A keeper process could close the windows; for a file that goes once every older
    copy imports this module, it is not worth it."""
    me = entry.split()[0]
    said, said_at = None, 0.0  # the kind of the last error said, and when: one that repeats is said again every SAY s
    while not stop.wait(POLL):
        try:
            text = _read(OLD_LOCK)
            if text is None and OLD_LOCK in _held:
                kind, problem = "gone", (f"ERROR: {OLD_LOCK}, taken by this run, is gone: something removed it; older "
                                         "scripts may run beside this run (release() will raise)")
            elif text is None:
                kind = problem = None
                with _turn():
                    if (_read(slot) or "").split()[:1] != [me]:
                        continue  # this run no longer holds its slot: nothing to keep
                    if _publish(OLD_LOCK, entry, like=slot):
                        _log(f"put {OLD_LOCK} back with this run's entry: it was gone while this run holds a slot (an "
                             "older script may have run beside it until now)")
            elif _alive(OLD_LOCK, text):
                said = None
                continue
            else:
                kind = problem = None
                with _turn():
                    if _read(OLD_LOCK) != text:
                        continue  # changed meanwhile: handed on, or taken by an older script
                    if (_read(slot) or "").split()[:1] != [me]:
                        continue  # this run no longer holds its slot: nothing to keep
                    _replace(OLD_LOCK, entry, slot)
                    _log(f"took {OLD_LOCK} over from a process that is gone ({text or 'an empty entry'}): this run "
                         "still holds a slot")
        except Exception as e:  # said, never the end of the thread: the next look tries again
            kind, problem = type(e).__name__, f"ERROR: the OLD_LOCK keeper failed ({type(e).__name__}: {e}); trying again"
        if problem and (kind != said or time.monotonic() - said_at >= SAY):
            _log(problem)
            said, said_at = kind, time.monotonic()


def acquire(label, hold_limit=HOLD_LIMIT, *, kind=None, slots=None):
    """Wait for this process's turn, then hold its slots (and OLD_LOCK, or a share in it). kind None or "swiftshader":
    all slots; kind "gpu": `slots` of them (1 unless given), beside other gpu runs while the gates allow. Prints its
    place while it waits; raises TimeoutError if the run it waits for has held its slots longer than hold_limit
    seconds, if a gpu run's gates have held it back that long, or if a stopped process holds the turn. On return it
    leaves a daemon thread running in this process, the OLD_LOCK keeper (_keep_old_lock), until release()."""
    global _keeper
    n = _slots_needed(kind, slots)
    gpu = kind == "gpu"
    _require_host()
    if _held:
        raise RuntimeError(f"this process already holds {_held}")
    outer = os.environ.get(HOLDER_ENV)
    if outer is not None:
        for path in _slot_paths():
            text = holder(path)
            if text and text.split()[0] == outer and _alive(path, text):
                raise RuntimeError(f"this process runs under `chromium_lock.py run` (pid {outer}), which holds the lock "
                                   f"for it ({path}): waiting here would wait behind that. A command that takes the lock "
                                   "itself waits for its own turn; run it without `run`")
        _log(f"{HOLDER_ENV}={outer}, but that process does not hold the lock: queueing as usual")
    if gpu:  # without nvidia-smi or a readable MemAvailable, fail now, not once the queue reaches this run
        _vram_free_mib()
        _mem_available_mib()
    os.makedirs(QUEUE, exist_ok=True)
    mine = f"{time.time_ns():020d}-{os.getpid()}"
    said, last, gated_since = None, 0.0, None
    try:
        if not _publish(f"{QUEUE}/{mine}", _entry(label, n)):
            raise RuntimeError(f"{QUEUE}/{mine} exists already")
        while True:
            names = _queue()
            if mine not in names:
                raise RuntimeError(f"this process's ticket {QUEUE}/{mine} is gone: something removed it")
            place = names.index(mine) + 1
            gate = None
            if not _held and place == 1:
                free, held = _look(drop=False)
                if _blocker(n, free, held) is None:
                    gate = _gates(n, held) if gpu else None
                    if gate is None:
                        with _turn():
                            _take_slots(label, n, gated_beside=bool(held))
            # Once slots are ours, keep them and wait only for OLD_LOCK, whatever our place: a ticket that sorts earlier
            # can still appear (a clock step), and giving way then would leave both waiting for ever.
            if _held:
                with _turn():
                    covered = _old_lock_covered(label, n)
                mine_slots = [p for p in _held if p != OLD_LOCK]
                for path in mine_slots:
                    # Taken: the hold limit counts from here (the wait for OLD_LOCK was not holding). Still waiting for an
                    # older script's OLD_LOCK, perhaps through several of its runs in a row: keep the slots young, so that
                    # a waiter who looks between two of them does not count our wait as holding. A head that hangs
                    # stops refreshing them and is reported as usual.
                    os.utime(path)
                if covered:
                    stop = threading.Event()
                    keeper = threading.Thread(target=_keep_old_lock, args=(stop, _entry(label, n), mine_slots[0]),
                                              name="chromium_lock OLD_LOCK keeper", daemon=True)
                    # started with the stop signals blocked, which it inherits: they go to the main thread, so that
                    # _turn() there can hold them back
                    mask = signal.pthread_sigmask(signal.SIG_BLOCK, _STOP_SIGS)
                    try:
                        keeper.start()
                        _keeper = (keeper, stop)  # before a signal held meanwhile acts: release() must find it
                    finally:
                        signal.pthread_sigmask(signal.SIG_SETMASK, mask)
                    if said is not None:
                        _log(f"my turn after waiting: {label} ({_describe(_entry(label, n))})")
                    return
            # What this run waits for: OLD_LOCK once it holds its slots; else the holder whose leaving lets it in (an
            # older script, while a run from before slots waits for that one's OLD_LOCK); else its gates; else the
            # runs queued before it.
            blocker = OLD_LOCK if _held else _blocker(n, *_look(drop=False))
            now = time.monotonic()
            gated_since = (gated_since or now) if gate else None
            if blocker is not None:
                text, age = holder(blocker), _age(blocker)
                # A dead holder is not stuck: the waiter at place 1 removes its entry on its next look.
                if text is not None and age is not None and age > hold_limit and _alive(blocker, text):
                    raise TimeoutError(f"{blocker} held by {text or '(empty)'} for {age / 60:.0f} min, over the "
                                       f"{hold_limit / 60:.0f}-min hold limit: is that run stuck? Stop it, or, "
                                       "calling acquire() yourself, pass a larger hold_limit")
                key = text
                what = (f"{blocker} held by {text or 'nobody'}"
                        + (f" for {age / 60:.0f} min" if age is not None and text else ""))
            elif gate:
                if now - gated_since > hold_limit:
                    raise TimeoutError(f"held back by the gates for {(now - gated_since) / 60:.0f} min, over the "
                                       f"{hold_limit / 60:.0f}-min hold limit ({gate}): free GPU or main memory, "
                                       f"{_NO_GPU.replace('run it as', 'or run this as')}, or, calling acquire() "
                                       "yourself, pass a larger hold_limit")
                key = "gates: " + ", ".join(g.split(":")[0] for g in gate.split("; "))
                what = gate
            elif place > 1:
                key = names[0]
                what = f"the run queued first: {_read(f'{QUEUE}/{names[0]}') or '(empty)'}"
            else:
                key, what = None, "slots free: taking them on the next look"
            if (place, key) != said or now - last >= SAY:
                said, last = (place, key), now
                _log(f"waiting: place {place} of {len(names)}; {what}")
            time.sleep(POLL)
    except BaseException:
        release()  # a lock taken before a later step failed (or a signal came) must not stay behind
        raise
    finally:
        try:
            os.remove(f"{QUEUE}/{mine}")
        except FileNotFoundError:
            pass  # never written, or reported above if it vanished while waiting


def release():
    """Remove the lock files this process holds. OLD_LOCK, if this process holds it (taken, handed to it, or taken over
    from a holder that died), goes to a run that still holds a slot, if one does: written beside, then renamed over it,
    so that it is never absent while a run holds a slot; its age, the heir's hold, goes with it. Raises RuntimeError if
    a file this process took is gone or now holds another process (the keeper never re-creates a missing OLD_LOCK that
    this run took), and TimeoutError if a stopped process holds the turn (the files are left; a retry once it is gone
    gives them back).
    Says so on stderr, without raising (release() runs in finally blocks, and would hide the error that brought it
    there), if OLD_LOCK, held for this run by another, is gone or held by a process that holds no slot."""
    global _keeper
    running = _keeper is not None
    if running:
        keeper, stop = _keeper
        stop.set()
        keeper.join()  # before the turn below: the keeper may be waiting for it
        _keeper = None
    if not _held:
        return
    problems = []
    me = str(os.getpid())
    with _turn():
        for path in reversed([p for p in _held if p != OLD_LOCK]):
            text = _read(path)
            if text is None:
                problems.append(f"{path} is gone: something removed it while this process held it")
            elif text.split()[0] != me:
                problems.append(f"{path} now holds {text!r}, not this process ({me}); left as it is")
            else:
                os.remove(path)
        others = {p: t for p, t in _look(drop=False)[1].items() if _slots_of(t) is not None and t.split()[0] != me}
        text = _read(OLD_LOCK)
        if text and text.split()[0] == me:
            if others:
                path, entry = next(iter(others.items()))
                _replace(OLD_LOCK, entry, path)
            else:
                os.remove(OLD_LOCK)
        elif OLD_LOCK in _held:
            problems.append(f"{OLD_LOCK} is gone: something removed it while this process held it" if text is None else
                            f"{OLD_LOCK} now holds {text!r}, not this process ({me}); left as it is")
        elif running and not (text and text.split()[0] in {t.split()[0] for t in others.values()}):
            _log(f"ERROR: {OLD_LOCK}, held for this run by another that holds a slot, "
                 + ("is gone" if text is None else f"now holds {text!r}") + ": older scripts may have run beside it")
        _held.clear()
    if problems:
        raise RuntimeError("; ".join(problems))


def status():
    _require_host()
    print(f"{GPU_SLOTS} slots; a gpu run needs {GPU_FREE_MIB} MiB of free VRAM per slot, and {GPU_MEM_MIN_MIB} MiB "
          "available to start beside another run")
    base = os.path.basename(LOCK)
    beyond = sorted(int(n[len(base):]) for n in os.listdir(os.path.dirname(LOCK))
                    if n.startswith(base) and n[len(base):].isdigit() and int(n[len(base):]) > GPU_SLOTS)
    for path in _slot_paths() + [_slot_path(i) for i in beyond] + [OLD_LOCK]:
        text, age = holder(path), _age(path)
        if text is None:
            print(f"{path}: free")
        else:
            state = "alive" if _alive(path, text) else "GONE"
            note = "; beyond GPU_SLOTS" if path not in _slot_paths() + [OLD_LOCK] else ""
            print(f"{path}: held by {text or '(empty)'} for {(age or 0) / 60:.0f} min ({state}; {_describe(text)}{note})")
    if not os.path.isdir(QUEUE):
        print(f"{QUEUE}: no queue yet")
        return
    who, stopped = _turn_holder()
    # the turn (an flock of QUEUE) is held for microseconds per change; held longer, it holds every waiter back
    print(f"{QUEUE} turn: " + (f"held by {who}" + (": it holds every waiter back" if stopped else "") if who else "free"))
    names = [n for n in sorted(os.listdir(QUEUE)) if not n.startswith(".")]
    print(f"{QUEUE}: {len(names)} waiting" + (":" if names else ""))
    for i, name in enumerate(names, 1):
        path = f"{QUEUE}/{name}"
        text = _read(path)
        if text is None:
            continue
        waited = (time.time_ns() - int(name.split("-")[0])) / 1e9
        foreign = text and _ns(text) not in (None, _pidns())
        state = "other namespace, skipped" if foreign else "alive" if _alive(path, text) else "GONE"
        print(f"  {i}. {text or '(empty)'}  (waiting {waited:.0f} s, {state}; wants {_describe(text)})")


def _stop_group(child):
    """SIGTERM to the child's process group, wait until none of it is left (SIGKILL after 10 s); raise if one
    survives. The child itself is reaped on every look: unreaped, it stays in the group as a zombie."""
    pgid = child.pid
    for sig, wait in ((signal.SIGTERM, 10), (signal.SIGKILL, 5)):
        try:
            os.killpg(pgid, sig)
        except ProcessLookupError:
            return
        end = time.monotonic() + wait
        while time.monotonic() < end:
            child.poll()
            try:
                os.killpg(pgid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.1)
    raise RuntimeError(f"process group {pgid} still has members after SIGKILL")


def _renderer_conflict(kind):
    """For `run` with kind gpu: why the command's environment must not run under it (it asks for another renderer:
    a software browser must not sit in one gpu slot), or None."""
    if kind != "gpu":
        return None  # all slots are held: any renderer is safe, and the environment is left as it is
    env = renderer.ENV
    asked = os.environ.get(env)
    if asked is not None and asked != "gpu":
        return (f"`run --gpu` holds gpu slots for the command, but {env}={asked!r} asks it for another renderer: "
                f"leave out --gpu (all slots, any renderer), or set {env}=gpu")
    return None


def run(label, cmd, *, kind=None, slots=None):
    """Run cmd while holding the lock (kind and slots as for acquire; under kind gpu the command's environment gets the
    gpu renderer, renderer.ENV=gpu, and one that asks for another raises ValueError before anything is taken). Returns
    its exit status, 128+n if signal n stopped it; raises what release() raises. The caller's handlers for SIGTERM,
    SIGHUP and SIGINT are back in
    place when it returns; one of these signals that came while the command was being stopped is sent again then, to
    those handlers."""
    conflict = _renderer_conflict(kind)
    if conflict:
        raise ValueError(conflict)
    env = dict(os.environ, **{HOLDER_ENV: str(os.getpid())})
    if kind == "gpu":
        env[renderer.ENV] = "gpu"
    sigs = _STOP_SIGS
    before = {sig: signal.getsignal(sig) for sig in sigs}
    late = []  # signals that came while the command was being stopped

    def on_signal(sig, _frame):
        raise SystemExit(128 + sig)  # unwinds through acquire (ticket removed) or the finally below

    for sig in sigs:
        signal.signal(sig, on_signal)
    try:
        acquire(label, kind=kind, slots=slots)
        child = None
        try:
            # its own process group, so that a stop reaches the browser and every process it started. HOLDER_ENV makes
            # an acquire() inside the command refuse at once, instead of waiting behind this holder until the limit.
            child = subprocess.Popen(cmd, start_new_session=True, env=env)
            rc = child.wait()
        finally:
            for sig in sigs:  # held, not acted on: a signal now must not cut the stop short and free the lock early
                signal.signal(sig, lambda s, _frame: late.append(s))
            try:
                if child is not None:
                    _stop_group(child)  # also what the command left running after it exited
            finally:
                release()
    finally:
        for sig, handler in before.items():
            # None: a handler set outside Python, which cannot be put back from here; it is left ignoring the signal
            signal.signal(sig, signal.SIG_IGN if handler is None else handler)
    # Here only when the command ended by itself (a signal before that is already unwinding as SystemExit): a signal
    # held during the stop goes to the caller's own handler now, as if it had come just after the return.
    for sig in late:
        os.kill(os.getpid(), sig)
    return 128 - rc if rc < 0 else rc


USAGE = "usage: chromium_lock.py status | chromium_lock.py run [--gpu [--slots N]] <label> -- <command...>"


def main(args):
    if args == ["status"]:
        return status()
    if args[:1] != ["run"]:
        sys.exit(USAGE)
    args, kind, slots = args[1:], None, None
    if args[:1] == ["--gpu"]:
        args, kind = args[1:], "gpu"
        if args[:1] == ["--slots"]:
            if len(args) < 2 or not args[1].isdigit() or not 1 <= int(args[1]) <= GPU_SLOTS:
                sys.exit(USAGE)
            args, slots = args[2:], int(args[1])
    if len(args) < 3 or args[1] != "--":
        sys.exit(USAGE)
    conflict = _renderer_conflict(kind)
    if conflict:
        print(f"chromium_lock.py: {conflict}", file=sys.stderr)
        return 2
    return run(args[0], args[2:], kind=kind, slots=slots)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
