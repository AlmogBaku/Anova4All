//go:build !no_wifi

package wifi

import (
	"encoding/csv"
	"encoding/hex"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// testCase represents a single test case from the CSV file
type testCase struct {
	originalBytes   []byte
	expectedLength  int
	expectedDecoded string
}

// loadTestCases reads test cases from the CSV file
func loadTestCases(t *testing.T) []testCase {
	t.Helper()

	// Open the CSV file
	file, err := os.Open(filepath.Join("testdata", "test_data.csv"))
	if err != nil {
		t.Fatalf("Failed to open test data file: %v", err)
	}
	defer file.Close()

	// Create a new CSV reader
	reader := csv.NewReader(file)

	// Read all records
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("Failed to read CSV: %v", err)
	}

	var testCases []testCase

	// Skip the header row
	for _, record := range records[1:] {
		originalBytes, err := hex.DecodeString(record[1]) // Use index 1 for original_bytes
		if err != nil {
			t.Fatalf("Failed to decode hex string: %v", err)
		}

		expectedLength, err := strconv.Atoi(record[2]) // Use index 2 for length
		if err != nil {
			t.Fatalf("Failed to parse expected length: %v", err)
		}

		checksumOK, err := strconv.ParseBool(record[3]) // Use index 3 for checksum_ok
		if err != nil {
			t.Fatalf("Failed to parse checksum_ok: %v", err)
		}

		// Only add test cases where the checksum is valid
		if checksumOK {
			testCases = append(testCases, testCase{
				originalBytes:   originalBytes,
				expectedLength:  expectedLength,
				expectedDecoded: strings.TrimSuffix(strings.TrimSuffix(record[5], "\n"), "\r"), // Use index 5 for decoded
			})
		}
	}

	return testCases
}

func TestEncoderDecode(t *testing.T) {
	testCases := loadTestCases(t)

	for _, tc := range testCases {
		t.Run(tc.expectedDecoded, func(t *testing.T) {
			decodedMessage := AnovaMessage("")
			err := decodedMessage.UnmarshalBinary(tc.originalBytes)
			if err != nil {
				t.Fatalf("Failed to decode message: %v", err)
			}
			if string(decodedMessage) != tc.expectedDecoded {
				t.Errorf("Expected: %q, Got: %q", tc.expectedDecoded, decodedMessage)
			}
		})
	}
}

func TestEncoderEncode(t *testing.T) {
	testCases := loadTestCases(t)

	for _, tc := range testCases {
		t.Run(tc.expectedDecoded, func(t *testing.T) {
			msg := AnovaMessage(tc.expectedDecoded)
			reEncoded, err := msg.MarshalBinary()
			if err != nil {
				t.Fatalf("Failed to encode message: %v", err)
			}

			reEncoded = append(reEncoded, 0x16) // Append the SYN character

			// Compare the lengths first
			if len(reEncoded) != len(tc.originalBytes) {
				t.Errorf("Encoded length mismatch. Expected: %d, Got: %d", len(tc.originalBytes), len(reEncoded))
			}

			// Compare the contents
			if string(reEncoded) != string(tc.originalBytes) {
				t.Errorf("Encoded content mismatch.\nExpected: %x\nGot:      %x", tc.originalBytes, reEncoded)
			}
		})
	}
}
