# @wirelab/suite-mqtt

This package holds the conformance suite of the MQTT client MQTT.js (the npm package `mqtt`). The suite connects MQTT.js to the Eclipse Paho test broker and examines the packets of the client. Each test names the normative statements of the MQTT specifications that it examines.

## What the suite tests

The suite tests the client, not the broker. The broker is a fixed reference: the Paho test broker at the commit `fdab9d2b1ce125385135e5d9f282a0ad315268cc` of `eclipse-paho/paho.mqtt.testing`.

| File | What it has |
| --- | --- |
| `src/paho-v5.test.ts` | The 27 tests of `client_test5.py` (MQTT 5.0), ported to the client. |
| `src/paho-v311.test.ts` | The 10 tests of `client_test.py` (MQTT 3.1.1), ported to the client. |
| `src/client-limits.test.ts` | The checks that Paho does not have: the limits of the server, the resend after a reconnect, the packet identifiers, the reason codes. |
| `src/scenarios.test.ts` | A check with no broker: each scenario of `src/index.ts` has a test, and each test names its statements. |
| `src/harness.ts` | The helpers of the tests: a client that records each packet, and the counts of the packets in flight. |
| `src/index.ts` | The scenarios as data, with their normative statements. |

- A normative statement has the form `[MQTT-x.x.x-y]`. The title or a comment of the test names it.
- Some statements of a Paho test apply only to the broker. A comment `// broker:` names them. The test then examines the client side of the same exchange.
- A test that shows a fault of MQTT.js is `it.fails`, with a comment `// client bug:`. The test passes while the fault stays. When a release of MQTT.js removes the fault, the test fails. Then change it to `it`.
- A fault of the broker gets `it.skip`, with a comment `// broker:`. The suite has no such test now.
- Each test has a time limit, removes its clients and uses its own client identifiers and topics.

## Run the suite on your computer

The suite needs Python 3 for the broker. The broker needs no other Python package.

1. Get the Paho test broker at the fixed commit:

   ```sh
   git clone https://github.com/eclipse-paho/paho.mqtt.testing.git
   git -C paho.mqtt.testing checkout fdab9d2b1ce125385135e5d9f282a0ad315268cc
   ```

2. Start the broker with the configuration of this package:

   ```sh
   cd paho.mqtt.testing/interoperability
   python3 startbroker.py -c <path of wirelab>/packages/suite-mqtt/broker.conf
   ```

3. In a second terminal, run the suite from the root of wirelab:

   ```sh
   MQTT_BROKER_URL=mqtt://127.0.0.1:1883 pnpm --filter @wirelab/suite-mqtt test
   ```

4. To run one scenario, add its name as a filter:

   ```sh
   MQTT_BROKER_URL=mqtt://127.0.0.1:1883 pnpm --filter @wirelab/suite-mqtt exec vitest run -t "flow_control2"
   ```

- When `MQTT_BROKER_URL` has no value, Vitest skips the tests that need a broker. Thus `pnpm test` passes on a computer with no broker.
- Some tests wait for the Keep Alive of the server, for about one minute. The full suite runs in CI, in the workflow `.github/workflows/suite-mqtt.yml`.

## The broker configuration

The file `broker.conf` sets the limits that the broker sends in its `CONNACK`. The constant `broker` in `src/harness.ts` has the same values. Change the two files together.

| Setting | Value |
| --- | --- |
| Receive Maximum | 20 |
| Topic Alias Maximum | 2 |
| Maximum Packet Size | 1024 |
| Server Keep Alive | 60, when the Keep Alive of the client is more than 60 |

## CI

The workflow `.github/workflows/suite-mqtt.yml` runs the suite at these times:

- on each pull request that changes this package or the workflow,
- each Monday, so that a new release of MQTT.js gets a run,
- when a person starts it: `gh workflow run suite-mqtt.yml`.

Each run uploads the artifact `suite-mqtt`, with the log of the broker and the JSON report of Vitest.

## The scenarios

A number in the tables is a normative statement: `3.1.0-1` is `[MQTT-3.1.0-1]`. The column "Client statements" has the statements that apply to the client. The column "Broker statements" has the statements of the Paho test that apply only to the broker.

### MQTT 5.0, from `client_test5.py`

| Scenario | Client statements | Broker statements |
| --- | --- | --- |
| `basic` | 3.1.0-1, 2.2.1-3, 2.2.1-5, 3.3.4-1, 4.3.3-11 | 2.2.1-6 |
| `retained_message` | none | 3.3.1-5, 3.3.1-6, 3.3.2-17, 3.3.2-18 |
| `will_message` | 3.1.2-9 | 3.1.2-7, 3.1.3-10 |
| `zero_length_clientid` | none | 3.1.3-6, 3.1.3-7 |
| `offline_message_queueing` | 3.1.2-23, 3.3.4-1 | 3.1.2-5 |
| `overlapping_subscriptions` | 3.3.4-1 | 3.8.4-6, 3.3.4-2 |
| `keepalive` | 3.1.2-20 | 3.1.2-22 |
| `redelivery_on_reconnect` | 4.3.2-4, 4.3.3-8 | 4.4.0-1, 3.3.1-1 |
| `subscribe_failure` | none | 3.8.4-7, 3.9.3-1 |
| `dollar_topics` | none | 4.7.2-1 |
| `unsubscribe` | none | 2.2.1-6, 3.10.4-1, 3.10.4-2, 3.10.4-4 |
| `session_expiry` | 3.1.2-23 | 4.1.0-2 |
| `user_properties` | none | 3.3.2-17, 3.3.2-18 |
| `payload_format` | none | 3.3.2-4, 3.3.2-20 |
| `publication_expiry` | none | 3.3.2-5, 3.3.2-6 |
| `subscribe_options` | none | 3.8.3-3, 3.3.1-9, 3.3.1-10, 3.3.1-11, 3.3.1-12, 3.3.1-13 |
| `assigned_clientid` | none | 3.1.3-7, 3.2.2-16 |
| `subscribe_identifiers` | none | 3.3.4-3, 3.3.4-4 |
| `request_response` | none | 3.3.2-15, 3.3.2-16 |
| `client_topic_alias` | 3.3.2-8, 3.3.2-9, 3.2.2-17 | 3.3.2-7 |
| `server_topic_alias` | 3.3.2-10 | 3.1.2-26, 3.1.2-27 |
| `maximum_packet_size` | 3.2.2-15 | 3.1.2-24, 3.1.2-25 |
| `server_keep_alive` | 3.1.2-21, 3.2.2-21 | none |
| `flow_control1` | none | 3.3.4-9 |
| `flow_control2` | 3.3.4-7, 4.9.0-2 | none |
| `will_delay` | 3.1.2-9 | 3.1.3-9 |
| `shared_subscriptions` | none | 4.8.2-1, 4.8.2-2 |

### MQTT 3.1.1, from `client_test.py`

| Scenario | Client statements | Broker statements |
| --- | --- | --- |
| `basic` | 3.1.0-1, 2.3.1-1, 2.3.1-6 | 2.3.1-7 |
| `retained_messages` | none | 3.3.1-5, 3.3.1-6, 3.3.1-9, 3.3.1-10, 3.3.1-11 |
| `zero_length_clientid` | 3.1.3-7 | 3.1.3-8 |
| `offline_message_queueing` | 3.1.2-4 | none |
| `overlapping_subscriptions` | none | 3.3.5-1 |
| `keepalive` | 3.1.2-23 | 3.1.2-24 |
| `redelivery_on_reconnect` | 2.3.1-6 | 4.4.0-1 |
| `subscribe_failure` | none | 3.9.3-1, 3.9.3-2 |
| `dollar_topics` | none | 4.7.2-1 |
| `unsubscribe` | none | 2.3.1-7, 3.10.4-2, 3.10.4-4 |

The file `client_test.py` also has a function `will_message_test`. Its name does not start with `test`, so Paho does not run it, and this suite has no port of it.

### The checks that this suite adds

| Scenario | Client statements | Broker statements |
| --- | --- | --- |
| `receive_maximum` | 3.3.4-7, 4.9.0-2 | none |
| `maximum_packet_size` | 3.2.2-15 | none |
| `topic_alias_maximum` | 3.2.2-17, 3.3.2-9 | none |
| `resend_with_dup_v5` | 3.3.1-1, 4.4.0-1 | none |
| `resend_with_dup_v311` | 3.3.1-1, 4.4.0-1 | none |
| `resend_pubrel` | 4.4.0-1, 4.3.3-6 | none |
| `resend_only_with_session` | 3.2.2-5, 3.1.2-4, 4.4.0-1 | none |
| `unique_packet_identifiers` | 2.2.1-3 | none |
| `server_keep_alive_timing` | 3.2.2-21 | none |
| `assigned_client_identifier` | none | 3.2.2-16 |
| `error_reason_codes` | 4.4.0-2 | none |
| `values_from_the_application` | 3.3.1-2, 3.3.4-6 | none |

## The known faults of MQTT.js 5.16.1

Each fault has one or more `it.fails` tests. A fault with two or more tests has two or more different paths to the same fault.

| Fault | Statements | Tests |
| --- | --- | --- |
| The client sends more QoS 1 and QoS 2 messages in flight than the Receive Maximum of the server. | 3.3.4-7, 4.9.0-2 | `flow_control2`, `receive_maximum` |
| The client sends packets larger than the Maximum Packet Size of the server. | 3.2.2-15 | `maximum_packet_size` (MQTT 5.0 port), `maximum_packet_size` (PUBLISH and SUBSCRIBE) |
| The client sends a PUBLISH with Topic Alias 0. | 3.3.2-8 | `client_topic_alias` |
| The client sends an unacknowledged PUBLISH again with DUP 0. | 3.3.1-1 | `resend_with_dup_v5` (QoS 1 and QoS 2), `resend_with_dup_v311` |
| The client sends old messages again after Session Present 0, or on a new session with Clean Start 1. | 3.2.2-5, 3.1.2-4, 4.4.0-1 | `resend_only_with_session` |
| The client gives a new PUBLISH a packet identifier that is in use. | 2.2.1-3 | `unique_packet_identifiers` |
| The client sends a QoS 0 PUBLISH with DUP 1 when the application asks for it. | 3.3.1-2 | `values_from_the_application` |
| The client sends a Subscription Identifier in a PUBLISH when the application gives one. | 3.3.4-6 | `values_from_the_application` |

The client also ignores the Assigned Client Identifier of the server. An automatic reconnect sends an empty Client Identifier again, so the session of the first connection is lost. No normative statement of the client covers this, so the suite has no `it.fails` test for it. The test `assigned_client_identifier` shows that the session resumes when the application gives this identifier.
