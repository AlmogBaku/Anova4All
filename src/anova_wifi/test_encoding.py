import csv
from os.path import dirname, realpath, join

import pytest

from .encoding import Encoder


# Helper function to load test cases from CSV
def load_test_cases():
    test_cases = []
    with open(join(dirname(realpath(__file__)), 'test_data.csv'), 'r') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            original_bytes = bytes.fromhex(row['original_bytes'])
            expected_length = int(row['length'])
            expected_checksum_ok = row['checksum_ok'] == 'True'
            expected_decoded = row['decoded'].rstrip('\r\n')

            if expected_checksum_ok:  # Only add test cases where the checksum is valid
                test_cases.append((original_bytes, expected_length, expected_decoded))

    return test_cases


@pytest.mark.parametrize("original_bytes, expected_length, expected_decoded", load_test_cases())
def test_async_encoder_decode(original_bytes, expected_length, expected_decoded):
    decoded_message = Encoder.decode(original_bytes)
    assert decoded_message == expected_decoded


@pytest.mark.parametrize("original_bytes, expected_length, expected_decoded", load_test_cases())
def test_async_encoder_encode(original_bytes, expected_length, expected_decoded):
    re_encoded = Encoder.encode(expected_decoded)
    assert re_encoded == original_bytes, f"Expected: {original_bytes}, Got: {re_encoded}"