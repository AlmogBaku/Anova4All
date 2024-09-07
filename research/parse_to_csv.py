import csv


def roll_shift(byte, n):
    return (byte >> n) | ((byte & ((1 << n) - 1)) << (8 - n))


def decode_message_with_checksum_fix(hex_string):
    p = 0
    chars = []
    chksum = 0
    chksum_ok = False
    length = 0
    for i in range(0, len(hex_string), 2):
        if hex_string[i:i + 2] == "\\n":  # Skip newline characters
            continue
        byte = int(hex_string[i:i + 2], 16)
        p += 1
        if p == 2:
            length = byte
            print(f"Len: {byte}")
        elif 3 <= p < (len(hex_string) / 2) - 1:
            chksum += byte
            n = (p - 2) % 7
            byte = roll_shift(byte, n)
            chars.append(chr(byte))
        elif p == (len(hex_string) // 2) - 1:
            # Verify the checksum with the calculated value
            chksum = chksum & 0xFF
            if byte == chksum:
                print("Chksum: OK")
                chksum_ok = True
            else:
                print(f"Chksum: FAIL. Read: {hex_string[i:i + 2]} != calc'd: {chksum:02X}")

    decoded_message = ''.join(chars)
    return length, decoded_message, chksum_ok


def process_line(line):
    parts = line.strip().split('\t')
    if len(parts) != 3:  # Ensure there are 3 parts (src, dst, payload) in the line
        return None, None, None, None, None  # Return default values if the line is invalid

    src_port, dst_port, payload = parts
    if not payload.strip():  # Skip lines with no payload
        return None, None, None, None, None  # Return default values if the line is invalid

    source = "client" if src_port == "6566" else "server"

    length, decoded_message, chksum_ok = decode_message_with_checksum_fix(payload)

    print(f"Source: {source}")
    print(f"Decoded message: {decoded_message}")
    print()  # Empty line for readability

    return payload[:-2], source, length, chksum_ok, decoded_message # last two characters of the payload are the SYN


# Read the raw input file and process it
def process_file(input_file, output_file):
    with open(input_file, 'r') as infile, open(output_file, 'w', newline='') as outfile:
        writer = csv.writer(outfile)
        # Write the CSV header
        writer.writerow(['original_bytes', 'length', 'checksum_ok', 'source', 'decoded'])

        for line in infile:
            payload, source, length, checksum_ok, decoded_data = process_line(line)
            if payload is None:
                print('Skipping invalid line')
                continue
            writer.writerow([payload, length, checksum_ok, source, decoded_data])


if __name__ == '__main__':
    input_file = 'rawdump_with_direction.txt'  # The file you provided
    output_file = '../src/anova_wifi/test_data.csv'  # Output CSV file path
    process_file(input_file, output_file)
    print(f'Processing complete. Output saved to {output_file}')