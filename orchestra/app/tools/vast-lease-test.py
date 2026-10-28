import importlib.util
import os
from pathlib import Path
import subprocess
import time
import unittest

spec = importlib.util.spec_from_file_location('lease', Path(__file__).with_name('vast-lease.py'))
lease = importlib.util.module_from_spec(spec); spec.loader.exec_module(lease)

class LeaseTests(unittest.TestCase):
    def test_real_child_death_and_pid_reuse_fail_closed(self):
        child = subprocess.Popen(['sleep', '10'])
        try:
            ticks = lease.fingerprint(child.pid)[0]
            row = dict(owner_pid=child.pid, owner_start_ticks=ticks,
                       controller_pid=os.getpid(), controller_start_ticks=lease.fingerprint(os.getpid())[0],
                       expires_epoch=time.time()+300, deadline_epoch=time.time()+600)
            self.assertTrue(lease.valid(row, time.time()))
            self.assertFalse(lease.valid(dict(row, owner_start_ticks='wrong'), time.time()))
            self.assertFalse(lease.valid(dict(row, deadline_epoch=0), time.time()))
            self.assertFalse(lease.valid(dict(row, expires_epoch=0), time.time()))
            child.terminate(); child.wait()
            self.assertFalse(lease.valid(row, time.time()))
        finally:
            if child.poll() is None: child.terminate(); child.wait()

if __name__ == '__main__': unittest.main()
