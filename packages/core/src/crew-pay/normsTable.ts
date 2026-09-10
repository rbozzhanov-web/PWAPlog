/**
 * Published list of CrewPay Norm block times, version 1.64 (issued 31 October 2025),
 * effective for flights from 01/10/25 to 31/03/26.
 *
 * The document's own notes, which settle how this is meant to be used:
 *
 *   "Crew are paid for each operated flight, but *disregarding* the actual block time of each
 *    flight. The block time for each flight is taken as per a published list of CrewPay Norms.
 *    The basis of the published list of times is the 75th percentile of the actual block times.
 *    Based on agreement with finance department the basis are updated only if the time was
 *    changed for 10 mins or more. Not all destinations in the list are operated during the
 *    effective period."
 *
 *   "If a sector is operated that does not appear on this list, the block time will be taken as
 *    the actual operated."
 *
 * The table is kept as published — IATA codes, HH:MM, one line per sector — so it can be diffed
 * against the PDF by eye. Conversion to the ICAO codes the logbook stores happens at load time.
 *
 * DIRECTIONAL, and not nearly symmetric: of the 98 city pairs published in both directions, 97
 * carry different times. ALA->NQZ is 1:55 while NQZ->ALA is 1:53. The key is the ordered pair, and
 * a sector absent from the list falls to the actual-operated rule above rather than borrowing the
 * reverse direction's figure.
 */
export const CREWPAY_NORM_VERSION = '1.64';
export const CREWPAY_NORM_EFFECTIVE_FROM = '2025-10-01';
export const CREWPAY_NORM_EFFECTIVE_TO = '2026-03-31';

/** As published: "DEP ARR H:MM", IATA. */
const PUBLISHED = `
AKX ALA 2:38
AKX NQZ 1:49
ALA AKX 2:48
ALA AUH 5:15
ALA AYT 6:07
ALA BKK 6:48
ALA BJV 6:15
ALA BOM 4:49
ALA BSZ 0:51
ALA BUS 4:36
ALA CAN 6:12
ALA CMB 6:23
ALA CIT 1:32
ALA CTU 4:28
ALA CXR 7:36
ALA DAD 6:50
ALA DEL 3:35
ALA DME 4:53
ALA DOH 5:16
ALA DXB 5:02
ALA DYU 1:57
ALA FRA 8:23
ALA GOI 5:01
ALA GUW 3:23
ALA GYD 3:45
ALA HER 6:33
ALA HKT 7:09
ALA HRG 7:16
ALA ICN 5:47
ALA IST 6:18
ALA JED 7:02
ALA KBP 5:31
ALA KGF 1:27
ALA KZO 1:50
ALA LHR 9:38
ALA LED 5:33
ALA MED 6:42
ALA MLE 6:49
ALA NQZ 1:55
ALA OVB 2:31
ALA OSS 1:21
ALA PEK 4:50
ALA PLX 1:32
ALA PQC 7:22
ALA PWQ 1:47
ALA SCO 3:31
ALA SSH 7:10
ALA SYX 6:35
ALA TAS 1:40
ALA TBS 4:13
ALA TGD 6:57
ALA TLV 6:37
ALA UKK 1:37
ALA UBN 3:25
ALA URA 3:24
ALA URC 1:48
AMS GUW 5:55
AUH ALA 4:16
AUH NQZ 4:52
AYT ALA 5:20
AYT NQZ 4:56
BJV ALA 5:26
BJV NQZ 5:05
BKK ALA 7:15
BOM ALA 4:38
BSZ ALA 1:00
BUS ALA 3:57
BUS NQZ 3:42
CAN ALA 6:40
CMB ALA 6:26
CIT ALA 1:15
CIT DOH 4:08
CIT JED 6:21
CIT MED 5:36
CTU ALA 5:08
CXR ALA 7:58
DAD ALA 7:27
DAD NQZ 8:38
DEL ALA 3:31
DME ALA 4:32
DMB NQZ 1:49
DME NQZ 3:30
DOH ALA 4:41
DOH CIT 3:41
DOH NQZ 4:57
DXB ALA 4:21
DXB GUW 3:59
DXB NQZ 4:44
DYU ALA 1:51
FRA ALA 7:18
FRA GUW 5:53
FRA NQZ 7:14
FRA URA 6:03
FRU NQZ 1:39
GOI ALA 5:12
GUW ALA 2:51
GUW AMS 6:31
GUW DXB 3:59
GUW FRA 6:24
GUW GYD 1:27
GUW IST 3:59
GUW NQZ 2:16
GUW SCO 0:55
GUW TBS 1:49
GUW URA 1:00
GYD ALA 3:05
GYD GUW 1:30
HER ALA 5:49
HKT ALA 7:32
HKT NQZ 7:28
HRG ALA 6:32
HRG NQZ 6:11
ICN ALA 7:02
ICN NQZ 7:37
IST ALA 5:10
IST GUW 3:32
IST NQZ 4:53
JED CIT 6:03
JED ALA 6:01
KBP ALA 5:02
KBP NQZ 4:08
KGF ALA 1:32
KGF NQZ 0:52
KSN NQZ 1:14
KZO ALA 1:42
KZO NQZ 1:35
LED ALA 4:39
LED NQZ 4:02
LHR ALA 8:14
LHR NQZ 7:50
LHR SCO 5:54
MED ALA 5:39
MED CIT 4:44
MLE ALA 6:45
MLE NQZ 7:37
OSS ALA 1:17
PEK ALA 5:36
PEK NQZ 6:11
PQC ALA 7:52
PQC NQZ 8:59
SCO ALA 3:09
SCO GUW 0:58
SCO LHR 6:51
SCO MED 3:51
SCO NQZ 2:41
SSH NQZ 6:25
SSH ALA 6:21
SYX ALA 7:16
SYX NQZ 7:35
TAS ALA 1:31
TAS NQZ 2:02
TBS ALA 3:45
TBS GUW 1:50
TBS NQZ 3:21
TGD ALA 5:58
TGD NQZ 5:41
TLV ALA 5:34
NQZ AKX 1:58
NQZ ALA 1:53
NQZ AUH 5:18
NQZ AYT 5:42
NQZ BJV 5:52
NQZ BUS 4:17
NQZ CXR 8:05
NQZ DAD 7:21
NQZ DMB 1:46
NQZ DME 3:56
NQZ DOH 5:32
NQZ DXB 5:13
NQZ FRA 8:01
NQZ FRU 1:44
NQZ GUW 2:39
NQZ HKT 7:59
NQZ HRG 6:41
NQZ ICN 6:32
NQZ IST 5:56
NQZ KSN 1:23
NQZ KBP 4:42
NQZ KZO 1:40
NQZ LED 4:27
NQZ PEK 5:27
NQZ PLX 1:23
NQZ PQC 8:08
NQZ LHR 8:36
NQZ SCO 3:00
NQZ SSH 6:55
NQZ TAS 2:11
NQZ TBS 3:49
NQZ TGD 6:30
NQZ UKK 1:31
NQZ URA 2:31
NQZ URC 2:37
NRT ALA 9:02
OVB ALA 2:46
PLX ALA 1:35
PLX GUW 2:10
PLX NQZ 1:25
UBN ALA 4:02
UKK ALA 1:40
UKK NQZ 1:35
URA ALA 3:20
URA FRA 6:35
URA NQZ 2:12
URC ALA 2:00
URC NQZ 2:39
`;

export interface PublishedSector {
  /** IATA, exactly as published. */
  dep: string;
  arr: string;
  minutes: number;
}

function parse(): PublishedSector[] {
  const sectors: PublishedSector[] = [];

  for (const line of PUBLISHED.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const [dep, arr, time] = trimmed.split(/\s+/);
    const [hours, minutes] = time.split(':');
    sectors.push({ dep, arr, minutes: Number(hours) * 60 + Number(minutes) });
  }

  return sectors;
}

export const PUBLISHED_SECTORS: PublishedSector[] = parse();
