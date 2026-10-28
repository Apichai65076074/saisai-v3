"""PID fingerprint and finite lease policy shared by controller and guard."""
import os
from pathlib import Path

def fingerprint(pid):
    # comm can contain spaces; fields after the final ')' start with state/ppid.
    raw = Path(f'/proc/{int(pid)}/stat').read_text()
    tail = raw[raw.rfind(')')+2:].split()
    if tail[0] == 'Z':
        raise ProcessLookupError('Owner is a zombie')
    return tail[19], int(tail[1])

def owner():
    explicit = os.environ.get('T23_WORKER_PID')
    if explicit:
        pid = int(explicit)
        return pid, fingerprint(pid)[0]
    pid = os.getppid()
    while pid > 1:
        ticks, parent = fingerprint(pid)
        name = Path(f'/proc/{pid}/comm').read_text().strip().lower()
        if name in ('codex', 'claude'):
            return pid, ticks
        pid = parent
    raise RuntimeError('No live worker ancestor; set T23_WORKER_PID explicitly')

def valid(lease, now):
    try:
        return (now < lease['expires_epoch'] and now < lease['deadline_epoch']
                and fingerprint(lease['owner_pid'])[0] == lease['owner_start_ticks']
                and fingerprint(lease['controller_pid'])[0] == lease['controller_start_ticks'])
    except (KeyError, FileNotFoundError, ProcessLookupError, ValueError):
        return False
