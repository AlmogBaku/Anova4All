# How to obtain the data for the Anova Precision Cooker Wi-Fi protocol

1. use `tcpdump` to capture any traffic related to the Anova Precision Cooker

```console
tcpdump -i eth0.1 host HF-LPT220 -w anova_traffic.pcap
```

2. create a dump file with the data

```console
tshark -r anova_traffic.pcap -Y "tcp.port == 6566" -T fields -e tcp.srcport -e tcp.dstport -e tcp.payload > rawdump_with_direction.txt 
```

3. extract the payload from the dump file

```console
python rawdump_with_direction.py
```

This will create a parsed data under `../src/anova_wifi/test_data.csv`.
**Notice** when pushing this to git, ensure to remove any sensitive data.