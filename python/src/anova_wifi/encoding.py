class Encoder:
    @staticmethod
    def encode(message: str) -> bytes:
        """
        Encodes a message to bytes.
        If the message doesn't end with \r, it will be added.
        :param message: The message to encode
        :return: The encoded message as bytes
        """
        # Ensure the message ends with \n
        if not message.endswith('\r'):
            message += '\r'

        # Convert message to bytes
        message_bytes = message.encode('utf-8')

        # Calculate length
        length = len(message_bytes)

        # Initialize result with header and length
        result = bytearray([ord('h'), length])

        # Initialize checksum
        checksum = 0

        # Process each byte of the message
        for i, byte in enumerate(message_bytes):
            n = (i + 1) % 7
            encoded_byte = Encoder.roll_shift(byte, n)
            result.append(encoded_byte)
            checksum += encoded_byte

        # Append checksum
        result.append(checksum & 0xFF)

        return bytes(result)

    @staticmethod
    def roll_shift(byte: int, n: int) -> int:
        return ((byte << n) | (byte >> (8 - n))) & 0xFF

    @staticmethod
    def reverse_roll_shift(byte: int, n: int) -> int:
        return (byte >> n) | ((byte & ((1 << n) - 1)) << (8 - n))

    @staticmethod
    def decode(data: bytes) -> str:
        """
        Decodes bytes to a message.
        If the message ends with \r, it will be removed.
        :param data: The data to decode
        :return: The decoded message as a string
        """
        if data[-1:] == b'\x16':  # Remove SYN character if present
            data = data[:-1]

        header = data[0]
        if header != ord('h'):
            raise ValueError(f"Invalid header byte: {header:02X}")

        length = data[1]

        # Process all bytes except the very last one (which is likely a newline)
        payload = data[2:2 + length + 1]  # header + length + payload + checksum
        checksum_byte = payload[-1]  # The last byte of the payload is the checksum

        chars = []
        calculated_checksum = 0

        for i, byte in enumerate(payload[:-1]):  # Exclude the checksum byte from processing
            calculated_checksum += byte
            n = (i + 1) % 7
            decoded_byte = Encoder.reverse_roll_shift(byte, n)
            chars.append(chr(decoded_byte))

        if checksum_byte != calculated_checksum & 0xFF:
            raise ValueError(f"Checksum mismatch. Expected: {checksum_byte:02X}, Calculated: {calculated_checksum:02X}")

        decoded_message = ''.join(chars)

        # Remove trailing newline if present
        return decoded_message.rstrip('\r')
