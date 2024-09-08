# How to obtain the data for the Anova Precision Cooker Wi-Fi protocol

1. use `tcpdump` to capture any traffic related to the Anova Precision Cooker

```console
tcpdump host HF-LPT220 -w anova_traffic.pcap
```

2. create a dump file with the data

```console
PCAP=anova_traffic.pcap OUTPUT=anova_traffic_dump.txt; tshark -r $PCAP -Y "tcp.port == 8080" -T fields -e frame.time_relative -e tcp.srcport -e tcp.dstport -e tcp.payload > $OUTPUT
```

3. extract the payload from the dump file

```console
cd research
cat rawdump_with_direction.txt | python parse_to_csv.py <output_csv>
```

Unless second argument is provided, this will create a parsed data under `../src/anova_wifi/test_data.csv`.
**Notice** when pushing this to git, ensure to remove any sensitive data.


Shorthand for local parsing:
```console
PCAP=anova_traffic.pcap; tshark -r $PCAP -Y "tcp.port == 8080" -T fields -e frame.time_relative -e tcp.srcport -e tcp.dstport -e tcp.payload | python parse_to_csv.py ${PCAP}.csv
```

Shorthand for live parsing via remote router:
```console
NAME=anova_traffic; ssh root@openwrt.lan "tcpdump -i any -s0 -w - host 192.168.1.210 and tcp port 8080" | \
tshark -r - -Y "tcp.port == 8080" -T fields -e frame.time_relative -e tcp.srcport -e tcp.dstport -e tcp.payload -l 2>/dev/null | \
tee ${NAME}.txt | \
tee >(python parse_to_csv.py ${NAME}.csv)
```