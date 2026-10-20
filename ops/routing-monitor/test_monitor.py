import io
import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from monitor import Store, normalize, normalize_cache, read_resp, resp_command


def when(seconds):
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


def record(**overrides):
    return {'timestamp': when(-120), 'provider': 'codex', 'model': 'gpt-6.1-sol', 'alias': 'claude-opus-5-5', 'execution_id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'session_id': '11111111-2222-3333-4444-555555555555', 'auth_index': '1234567890abcdef', **overrides}


class MonitorTests(unittest.TestCase):
    def test_replacement_is_distinct_from_alias_mapping_and_failed_attempt(self):
        self.assertEqual(normalize(record())['kind'], 'provider_replacement')
        self.assertEqual(normalize(record(alias='my-alias'))['kind'], 'model_mapping')
        self.assertEqual(normalize(record(alias='gpt-6.1-sol'))['kind'], 'direct')
        self.assertEqual(normalize(record(failed=True))['kind'], 'failed_attempt')

    def test_no_credentials_headers_or_error_bodies_survive_normalization(self):
        result = json.dumps(normalize(record(api_key='SECRET_KEY', source='SECRET_KEY', response_headers={'Authorization': 'SECRET_TOKEN'}, fail={'body': 'SECRET_BODY', 'status_code': 429}, session_id='SECRET_SESSION')))
        for secret in ('SECRET_KEY', 'SECRET_TOKEN', 'SECRET_BODY', 'SECRET_SESSION'):
            self.assertNotIn(secret, result)
        self.assertIsNone(normalize(record(model='sk-SECRET_KEY')))

    def test_cache_requires_canonical_non_overlapping_buckets(self):
        cache = {'schema_version': 2, 'quality': 'complete', 'input': {'total_tokens': 100, 'uncached_tokens': 10, 'cache_read_tokens': 80, 'cache_write_tokens': 10}}
        self.assertEqual(normalize_cache({'token_breakdown': cache})['total_tokens'], 100)
        self.assertIsNone(normalize_cache({'tokens': {'input_tokens': 100, 'cache_read_tokens': 80}}))
        cache['input']['total_tokens'] = 90
        self.assertIsNone(normalize_cache({'token_breakdown': cache}))

    def test_persistence_deduplicates_and_separates_account_change(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'history.sqlite'
            store = Store(path)
            first = record(alias='gpt-6.1-sol')
            store.add(first)
            store.add(first)
            store.add(record(alias='gpt-6.1-sol', execution_id='bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', timestamp=when(-60), auth_index='abcdef1234567890'))
            snapshot = Store(path).snapshot()
            self.assertEqual(len(snapshot['events']), 2)
            self.assertEqual(snapshot['events'][0]['kind'], 'account_change')
            self.assertEqual(snapshot['events'][0]['reason'], 'not_reported')

    def test_weighted_cache_summary_and_same_session_drop(self):
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        def cache(total, read):
            return {'schema_version': 2, 'quality': 'complete', 'input': {'total_tokens': total, 'uncached_tokens': total - read, 'cache_read_tokens': read, 'cache_write_tokens': 0}}
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'cache.sqlite')
            store.add(record(timestamp=(now - timedelta(seconds=5)).isoformat(), token_breakdown=cache(10000, 9000)))
            store.add(record(timestamp=now.isoformat(), token_breakdown=cache(90000, 0), execution_id='bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'))
            snapshot = store.snapshot()
            self.assertEqual(snapshot['cache_summary']['input_tokens'], 100000)
            self.assertEqual(snapshot['cache_summary']['read_tokens'], 9000)
            self.assertTrue(snapshot['events'][0]['cache_drop'])
            self.assertEqual(snapshot['events'][0]['previous_cache_hit'], 90)

    def test_reason_requires_an_earlier_attempt_of_the_same_request(self):
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'attempts.sqlite')
            store.add(record(failed=True, provider='claude', model='claude-opus-5-5', request_id='aaaaaaaa-1111-2222-3333-444444444444', fail={'status_code': 429}, timestamp=when(-120)))
            store.add(record(request_id='aaaaaaaa-1111-2222-3333-444444444444', execution_id='bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee', timestamp=when(-60)))
            self.assertEqual(store.snapshot()['latest_served']['reason'], 'rate_limit')
            store.add(record(request_id='bbbbbbbb-1111-2222-3333-444444444444', execution_id='cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee', timestamp=when(-30)))
            self.assertEqual(store.snapshot()['latest_served']['reason'], 'not_reported')

    def test_resp_is_bounded_and_decodes_binary_payloads(self):
        self.assertEqual(read_resp(io.BytesIO(b'*3\r\n$7\r\nmessage\r\n$5\r\nusage\r\n$2\r\n{}\r\n')), [b'message', b'usage', b'{}'])
        self.assertIsNone(read_resp(io.BytesIO(b'$-1\r\n')))
        with self.assertRaises(ValueError):
            read_resp(io.BytesIO(b'$999999999\r\n'))
        self.assertEqual(resp_command('PING'), b'*1\r\n$4\r\nPING\r\n')


if __name__ == '__main__':
    unittest.main()
