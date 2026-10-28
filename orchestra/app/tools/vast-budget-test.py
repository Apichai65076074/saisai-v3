import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import json
import tempfile
import time

spec = importlib.util.spec_from_file_location('budget', Path(__file__).with_name('vast-budget.py'))
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)


class BudgetTests(unittest.TestCase):
    def test_actual_billing_policy_does_not_use_historical_blanket_reserves(self):
        self.assertLess(budget.spend_for_gate({'actual_usd': 8.101, 'estimated_usd': 13.5, 'burn_hr': 2.4}), budget.STOP_USD)
        self.assertGreaterEqual(budget.spend_for_gate({'actual_usd': 14.5, 'estimated_usd': 14.5, 'burn_hr': 2.4}), budget.STOP_USD)
        self.assertEqual(budget.CAP_USD, 15)

    def test_conservative_invoice_lag(self):
        ledger = {'instances': {'1': {'start_epoch': 0, 'burn_hr': 2,
                                     'network_reserve_usd': .5}}}
        self.assertEqual(budget.estimate(ledger, 3600, .1), 2.5)
        self.assertEqual(budget.estimate(ledger, 3600, 3), 3)

    def test_read_only_budget_check_preserves_live_watchdog_identity(self):
        state = {'vast-progress.json': {'watchdog_pid': 12345},
                 'vast-ledger.json': {'instances': {}},
                 'vast-lease.json': {'expires_epoch': 999999999999, 'stage': 'test'}}
        with patch.object(budget, 'read', side_effect=lambda name, default: state.get(name, default)), \
             patch.object(budget, 'write'), patch.object(budget, 'owned', return_value=([], 0)), \
             patch.object(budget.kit, 'charges', return_value=[]), \
             patch.object(budget, 'ROOT') as root:
            result = budget.check(object())
        self.assertEqual(result['watchdog_pid'], 12345)

    def test_watch_loop_sets_its_own_pid(self):
        state = {'vast-progress.json': {'watchdog_pid': 12345}, 'vast-ledger.json': {'instances': {}},
                 'vast-lease.json': {'expires_epoch': 999999999999}}
        with patch.object(budget, 'read', side_effect=lambda name, default: state.get(name, default)), \
             patch.object(budget, 'write'), patch.object(budget, 'owned', return_value=([], 0)), \
             patch.object(budget.kit, 'charges', return_value=[]), patch.object(budget, 'ROOT'):
            result = budget.check(object(), watchdog_pid=67890)
        self.assertEqual(result['watchdog_pid'], 67890)

    def test_hung_billing_is_killed_before_independent_cleanup(self):
        class Inventory:
            def show_instances(self): return []
        with tempfile.TemporaryDirectory() as folder, patch.object(budget, 'ROOT', Path(folder)), \
             patch.object(budget.kit, 'charges', side_effect=lambda *args: time.sleep(10)):
            started = time.monotonic()
            with self.assertRaises(TimeoutError):
                budget.bounded_call(budget.check, .15, Inventory())
            self.assertLess(time.monotonic()-started, 2)
            budget.bounded_call(budget.cleanup, 1, Inventory())
            proof=json.loads((Path(folder)/'vast-cleanup.json').read_text())
            self.assertTrue(proof['verified'])
            self.assertEqual(proof['task_instances'], 0)

    def test_inventory_error_cannot_be_reported_as_verified_zero(self):
        class MissingInventory:
            def show_instances(self): return None
        with self.assertRaises(RuntimeError):
            budget.kit.instances(MissingInventory())

    def test_empty_inventory_is_valid_zero(self):
        class EmptyInventory:
            def show_instances(self): return []
        self.assertEqual(budget.kit.instances(EmptyInventory()), [])

    def test_dead_worker_forces_cleanup_with_fresh_lease_and_low_bill(self):
        # The independent guard must react even if heartbeat expiry is in future.
        with tempfile.TemporaryDirectory() as folder, patch.object(budget, 'ROOT', Path(folder)):
            budget.write('vast-ledger.json', {'instances': {}})
            budget.write('vast-lease.json', {
                'expires_epoch': time.time()+300, 'deadline_epoch': time.time()+600,
                'owner_pid': 99999999, 'owner_start_ticks': 'missing',
                'controller_pid': 99999998, 'controller_start_ticks': 'missing'})
            rows = [{'id': 1, 'label': budget.PREFIX+'llm-1', 'dph_total': .5}]
            with patch.object(budget, 'owned', return_value=(rows, 1)), \
                 patch.object(budget.kit, 'charges', return_value=[]), \
                 patch.object(budget, 'cleanup') as cleanup:
                with self.assertRaises(SystemExit): budget.check(object())
                cleanup.assert_called_once()
            self.assertEqual(budget.read('vast-progress.json', {})['stage'], 'budget-stop')

    def test_network_reconciliation_only_applies_to_ended_instances(self):
        row = {'start_epoch': 0, 'burn_hr': 2, 'network_reserve_usd': .5, 'network_reconciled_usd': .1}
        ledger = {'instances': {'1': row}}
        self.assertEqual(budget.estimate(ledger, 3600, 0), 2.5)
        row['end_epoch'] = 3600
        self.assertEqual(budget.estimate(ledger, 7200, 0), 2.1)

    def test_destroyed_instances_stop_accrual(self):
        ledger = {'instances': {'1': {'start_epoch': 0, 'end_epoch': 1800,
            'burn_hr': 2, 'network_reserve_usd': .5}}}
        self.assertEqual(budget.estimate(ledger, 7200, .1), 1.5)


if __name__ == '__main__':
    unittest.main()
