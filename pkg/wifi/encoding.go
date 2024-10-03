package wifi

import (
	"encoding"
	"errors"
	"strings"
)

type AnovaMessage string

// MarshalBinary implements encoding.BinaryMarshaler
func (m *AnovaMessage) MarshalBinary() ([]byte, error) {
	message := string(*m)
	if !strings.HasSuffix(message, "\r") {
		message += "\r"
	}

	messageBytes := []byte(message)
	length := len(messageBytes)

	result := make([]byte, 0, length+3) // header + length + message + checksum
	result = append(result, 'h', byte(length))

	var checksum byte

	for i, b := range messageBytes {
		n := (i + 1) % 7
		encodedByte := rollShift(b, n)
		result = append(result, encodedByte)
		checksum += encodedByte
	}

	result = append(result, checksum)

	return result, nil
}

// UnmarshalBinary implements encoding.BinaryUnmarshaler
func (m *AnovaMessage) UnmarshalBinary(data []byte) error {
	if len(data) < 3 {
		return errors.New("invalid data length")
	}

	if data[len(data)-1] == 0x16 { // Remove SYN character if present
		data = data[:len(data)-1]
	}

	if data[0] != 'h' {
		return errors.New("invalid header byte")
	}

	length := int(data[1])
	if len(data) < length+3 {
		return errors.New("invalid data length")
	}

	payload := data[2 : length+3] // header + length + payload + checksum
	checksumByte := payload[len(payload)-1]

	var calculatedChecksum byte
	chars := make([]byte, 0, length)

	for i, b := range payload[:len(payload)-1] {
		calculatedChecksum += b
		n := (i + 1) % 7
		decodedByte := reverseRollShift(b, n)
		chars = append(chars, decodedByte)
	}

	if checksumByte != calculatedChecksum {
		return errors.New("checksum mismatch")
	}

	*m = AnovaMessage(strings.TrimRight(string(chars), "\r"))
	return nil
}

func rollShift(b byte, n int) byte {
	return byte((uint(b) << n) | (uint(b) >> (8 - n)))
}

func reverseRollShift(b byte, n int) byte {
	return byte((uint(b) >> n) | ((uint(b) & ((1 << n) - 1)) << (8 - n)))
}

// Ensure AnovaMessage implements the interfaces
var _ encoding.BinaryMarshaler = (*AnovaMessage)(nil)
var _ encoding.BinaryUnmarshaler = (*AnovaMessage)(nil)
