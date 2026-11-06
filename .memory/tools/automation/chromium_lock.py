#!/usr/bin/env python3
"""chromium_lock.py — one holder at a time on this machine among the scripts that take this lock, in turn (first
come, first served). The holder decides how many headless Chromiums it starts: one of our own test scripts starts two.

Why: on 2026-11-04 several software-rendered browsers at once used up the memory (1.6 to 1.8 GB available), and the
system's out-of-memory guard (earlyoom) stopped a test's page processes. Scripts that take this lock never run beside
one another; a script that starts a Chromium without it is not held back. Before the queue, every waiter polled and
the fastest grabber won, so one waiter could wait for ever.

    import chromium_lock
    chromium_lock.acquire("my-test 5173")   # waits for its turn; prints its place in the queue while it waits
    try: ...
    finally: chromium_lock.release()

    python3 chromium_lock.py status          # holder and queue, oldest first
    python3 chromium_lock.py run <label> -- <command...>
        # for a script in another language: waits for its turn, runs the command (in its own process group) while
        # holding the lock, then releases it. Exit = the command's status (128+n if signal n stopped it or the
        # wrapper). SIGTERM, SIGHUP or SIGINT to the wrapper stops the whole command, then releases the lock.
        # SIGKILL cannot: the command runs in a session of its own, so a SIGKILL to the wrapper (as `timeout -k`
        # sends) leaves it running without the lock. A command that takes the lock itself (scripted_browser.py, or
        # any script that imports this module) waits for its own turn: under `run` its acquire() refuses at once. The
        # command has no controlling terminal (no /dev/tty): nothing that prompts.
        # Hold the lock per step (one page, one build), not per job: between steps others in the queue get their turn.

How: a waiter puts a ticket into QUEUE (a file named by the time it arrived) and takes LOCK only once its ticket is
the oldest of a live process. Every entry appears with its whole text at once (written to a temporary file, then
linked into place), records the process id and its PID namespace, and is removed by whoever finds that its process is
gone. Only processes of the machine's own PID namespace may queue: inside a sandbox other processes are invisible, and
a live holder would look dead. A holder that keeps the lock longer than the hold limit is reported, not waited for.
Linux only (/proc).
"""
import os
import signal
import subprocess
import sys
import time

LOCK = "/tmp/headless-chromium.lock"
QUEUE = "/tmp/headless-chromium.queue"
# Older scripts of ours (not published) take only OLD_LOCK, with no namespace mark and in two steps (create, then
# write), and others still watch it; so a holder takes both.
OLD_LOCK = "/tmp/ody-battery.lock"
INIT_PIDNS = "pid:[4026531836]"  # the kernel's initial PID namespace (PROC_PID_INIT_INO): the machine's own
HOLD_LIMIT = 3600  # s; the longest test run measured took 27 min (2026-11-06): an hour leaves room for twice that
EMPTY_GRACE = 10   # s an entry may stay empty (an older writer creates the file before writing it); then it is dead
POLL = 0.5         # s between looks while waiting
SAY = 60           # s between "still waiting" lines (a change is said at once)

HOLDER_ENV = "CHROMIUM_LOCK_HOLDER"  # set by run() for its command: the pid that holds the lock on the command's behalf

_held = []      # the lock files this process holds, in the order taken
_foreign = set()  # tickets from another PID namespace, already reported


def _log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] chromium_lock: {msg}", file=sys.stderr, flush=True)


def _pidns():
    return os.readlink("/proc/self/ns/pid")


def _require_host():
    if _pidns() != INIT_PIDNS:
        raise RuntimeError(f"this process runs in PID namespace {_pidns()}, not the machine's own ({INIT_PIDNS}): "
                           "it cannot see the other runs (a sandbox or container?); run it outside")


def _entry(label):
    return f"{os.getpid()} {time.strftime('%H:%M:%S')} {label} pidns={_pidns()}\n"


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


def _publish(path, text):
    """Make path appear with its whole text at once, if it does not exist yet. False if it exists."""
    tmp = f"{os.path.dirname(path)}/.{os.path.basename(path)}.{os.getpid()}.tmp"
    with open(tmp, "w") as f:
        f.write(text)
    try:
        os.link(tmp, path)
        return True
    except FileExistsError:
        return False
    finally:
        os.remove(tmp)


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
        raise RuntimeError(f"{path}: not '<pid> <time> <label> pidns=…': {text!r}; remove it once no run is going on")
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


def _try_take(path, label):
    """Take a lock file. False if a live process holds it; a dead holder's file is taken over."""
    while True:
        if _publish(path, _entry(label)):
            _held.append(path)
            return True
        text = _read(path)
        if text is not None and not _drop_if_dead(path, text):
            return False


def holder(path=LOCK):
    return _read(path)


def acquire(label, hold_limit=HOLD_LIMIT):
    """Wait for this process's turn, then hold LOCK (and OLD_LOCK). Prints its place while it waits; raises
    TimeoutError if the run it waits for has held the lock longer than hold_limit seconds."""
    _require_host()
    if _held:
        raise RuntimeError(f"this process already holds {_held}")
    outer = os.environ.get(HOLDER_ENV)
    if outer is not None:
        text = holder(LOCK)
        if text and text.split()[0] == outer and _alive(LOCK, text):
            raise RuntimeError(f"this process runs under `chromium_lock.py run` (pid {outer}), which holds the lock for "
                               "it: waiting here would wait behind that. A command that takes the lock itself waits for "
                               "its own turn; run it without `run`")
        _log(f"{HOLDER_ENV}={outer}, but that process does not hold the lock: queueing as usual")
    os.makedirs(QUEUE, exist_ok=True)
    mine = f"{time.time_ns():020d}-{os.getpid()}"
    said, last = None, 0.0
    try:
        if not _publish(f"{QUEUE}/{mine}", _entry(label)):
            raise RuntimeError(f"{QUEUE}/{mine} exists already")
        while True:
            names = _queue()
            if mine not in names:
                raise RuntimeError(f"this process's ticket {QUEUE}/{mine} is gone: something removed it")
            place = names.index(mine) + 1
            # Once LOCK is ours, keep it and wait only for OLD_LOCK, whatever our place: a ticket that sorts earlier
            # can still appear (a clock step), and giving way then would leave both waiting for ever.
            if (LOCK in _held or (place == 1 and _try_take(LOCK, label))) and _try_take(OLD_LOCK, label):
                os.utime(LOCK)  # the hold limit counts from here: the wait for OLD_LOCK was not holding
                if said is not None:
                    _log(f"my turn after waiting: {label}")
                return
            if LOCK in _held:
                # Waiting for an older script's OLD_LOCK, perhaps through several of its runs in a row: keep LOCK young,
                # so that a waiter who looks between two of them does not count our wait as holding. A head that hangs
                # stops refreshing it and is reported as usual.
                os.utime(LOCK)
            # What the queue waits for: LOCK's holder once it holds both; while it waits for an older script's OLD_LOCK
            # (another process holds that), the older script.
            lock_text, old_text = holder(LOCK), holder(OLD_LOCK)
            mixed = old_text is not None and old_text.split()[:1] != (lock_text or "").split()[:1]
            blocker = OLD_LOCK if LOCK in _held or not lock_text or mixed else LOCK
            text, age = holder(blocker), _age(blocker)
            # A dead holder is not stuck: the waiter at place 1 removes its entry on its next look.
            if text is not None and age is not None and age > hold_limit and _alive(blocker, text):
                raise TimeoutError(f"{blocker} held by {text or '(empty)'} for {age / 60:.0f} min, over the "
                                   f"{hold_limit / 60:.0f}-min hold limit: is that run stuck? Stop it, or pass a "
                                   "larger hold_limit")
            now = time.monotonic()
            if (place, text) != said or now - last >= SAY:
                said, last = (place, text), now
                _log(f"waiting: place {place} of {len(names)}; {blocker} held by {text or 'nobody'}"
                     + (f" for {age / 60:.0f} min" if age is not None and text else ""))
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
    """Remove the lock files this process holds. Raises if one is gone or now holds another process."""
    problems = []
    for path in reversed(_held):
        text = _read(path)
        if text is None:
            problems.append(f"{path} is gone: something removed it while this process held it")
        elif text.split()[0] != str(os.getpid()):
            problems.append(f"{path} now holds {text!r}, not this process ({os.getpid()}); left as it is")
        else:
            os.remove(path)
    _held.clear()
    if problems:
        raise RuntimeError("; ".join(problems))


def status():
    _require_host()
    for path in (LOCK, OLD_LOCK):
        text, age = holder(path), _age(path)
        if text is None:
            print(f"{path}: free")
        else:
            state = "alive" if _alive(path, text) else "GONE"
            print(f"{path}: held by {text or '(empty)'} for {(age or 0) / 60:.0f} min ({state})")
    if not os.path.isdir(QUEUE):
        print(f"{QUEUE}: no queue yet")
        return
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
        print(f"  {i}. {text or '(empty)'}  (waiting {waited:.0f} s, {state})")


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


def run(label, cmd):
    """Run cmd while holding the lock. Returns its exit status, 128+n if signal n stopped it. The caller's handlers
    for SIGTERM, SIGHUP and SIGINT are back in place when it returns; one of these signals that came while the command
    was being stopped is sent again then, to those handlers."""
    sigs = (signal.SIGTERM, signal.SIGHUP, signal.SIGINT)
    before = {sig: signal.getsignal(sig) for sig in sigs}
    late = []  # signals that came while the command was being stopped

    def on_signal(sig, _frame):
        raise SystemExit(128 + sig)  # unwinds through acquire (ticket removed) or the finally below

    for sig in sigs:
        signal.signal(sig, on_signal)
    try:
        acquire(label)
        child = None
        try:
            # its own process group, so that a stop reaches the browser and every process it started. HOLDER_ENV makes
            # an acquire() inside the command refuse at once, instead of waiting behind this holder until the limit.
            child = subprocess.Popen(cmd, start_new_session=True, env=dict(os.environ, **{HOLDER_ENV: str(os.getpid())}))
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


if __name__ == "__main__":
    if sys.argv[1:] == ["status"]:
        status()
    elif len(sys.argv) >= 5 and sys.argv[1] == "run" and sys.argv[3] == "--":
        sys.exit(run(sys.argv[2], sys.argv[4:]))
    else:
        sys.exit("usage: chromium_lock.py status | chromium_lock.py run <label> -- <command...>")
