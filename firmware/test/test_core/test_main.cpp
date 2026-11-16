// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 douglasrolim and bruce-gate-relay contributors

// Host-side unit tests for the protocol and name validation: `pio test -e native`.

#include <unity.h>

#include "Backoff.h"
#include "GateNames.h"
#include "Protocol.h"
#include "RelayCore.h"
#include "WsUrl.h"

#include <map>

using namespace gate_relay;

static const char *ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";

class FakeRepo : public IGateRepository {
public:
    std::vector<std::string> files{"Garage", "Main Entrance"};
    std::vector<std::string> listed;
    std::vector<std::string> refresh() override {
        listed = files;
        return listed;
    }
    bool resolve(const std::string &name, std::string &path) const override {
        for (const auto &g : listed) {
            if (g == name) {
                path = "/BruceRF/gates/" + name + ".sub";
                return true;
            }
        }
        return false;
    }
};

class FakeTx : public ITransmitter {
public:
    std::vector<std::string> sent;
    TxResult result = TxResult::Ok;
    TxResult transmit(const std::string &path) override {
        sent.push_back(path);
        return result;
    }
};

void setUp() {}
void tearDown() {}

void test_gate_names() {
    TEST_ASSERT_TRUE(isValidGateName("Garage"));
    TEST_ASSERT_TRUE(isValidGateName("Front Gate"));
    TEST_ASSERT_TRUE(isValidGateName("Portão 2"));
    TEST_ASSERT_FALSE(isValidGateName(""));
    TEST_ASSERT_FALSE(isValidGateName("../x"));
    TEST_ASSERT_FALSE(isValidGateName("a/b"));
    TEST_ASSERT_FALSE(isValidGateName("a\\b"));
    TEST_ASSERT_FALSE(isValidGateName(".hidden"));
    TEST_ASSERT_FALSE(isValidGateName(" pad"));
    TEST_ASSERT_FALSE(isValidGateName(std::string(49, 'x')));
    TEST_ASSERT_FALSE(isValidGateName(std::string("a\x01")));
}

void test_gate_name_from_file() {
    TEST_ASSERT_EQUAL_STRING("Garage", gateNameFromFile("Garage.sub").c_str());
    TEST_ASSERT_EQUAL_STRING("Front Gate", gateNameFromFile("/BruceRF/gates/Front Gate.SUB").c_str());
    TEST_ASSERT_EQUAL_STRING("", gateNameFromFile("notes.txt").c_str());
    TEST_ASSERT_EQUAL_STRING("", gateNameFromFile(".sub").c_str());
    TEST_ASSERT_EQUAL_STRING("", gateNameFromFile("..sub").c_str());
}

void test_parse_server_messages() {
    ServerMessage m = parseServerMessage("{\"v\":1,\"type\":\"ping\"}");
    TEST_ASSERT_TRUE(m.type == ServerMessageType::Ping);

    m = parseServerMessage(std::string("{\"v\":1,\"type\":\"open\",\"id\":\"") + ID + "\",\"gate\":\"Garage\"}");
    TEST_ASSERT_TRUE(m.type == ServerMessageType::Open);
    TEST_ASSERT_EQUAL_STRING("Garage", m.gate.c_str());

    TEST_ASSERT_TRUE(parseServerMessage("garbage").type == ServerMessageType::Invalid);
    TEST_ASSERT_TRUE(parseServerMessage("{\"v\":2,\"type\":\"ping\"}").type == ServerMessageType::Invalid);
    TEST_ASSERT_TRUE(parseServerMessage("{\"v\":1,\"type\":\"open\",\"id\":\"x\",\"gate\":\"G\"}").type == ServerMessageType::Invalid);
    TEST_ASSERT_TRUE(parseServerMessage("{\"v\":1,\"type\":\"reboot\"}").type == ServerMessageType::Unknown);
    TEST_ASSERT_TRUE(parseServerMessage(std::string(5000, ' ')).type == ServerMessageType::Invalid);
}

void test_encode() {
    TEST_ASSERT_EQUAL_STRING("{\"v\":1,\"type\":\"hello\",\"fw\":\"fw/1\",\"gates\":[\"A\",\"B\"]}", encodeHello("fw/1", {"A", "B"}).c_str());
    TEST_ASSERT_EQUAL_STRING((std::string("{\"v\":1,\"type\":\"result\",\"id\":\"") + ID + "\",\"ok\":true}").c_str(), encodeResult(ID, true).c_str());
    TEST_ASSERT_EQUAL_STRING((std::string("{\"v\":1,\"type\":\"result\",\"id\":\"") + ID + "\",\"ok\":false,\"error\":\"TX_FAILED\"}").c_str(),
                             encodeResult(ID, false, "TX_FAILED").c_str());
}

void test_relay_core_open_flow() {
    FakeRepo repo;
    FakeTx tx;
    RelayCore core(repo, tx, "fw/1");
    TEST_ASSERT_EQUAL_STRING("{\"v\":1,\"type\":\"hello\",\"fw\":\"fw/1\",\"gates\":[\"Garage\",\"Main Entrance\"]}", core.hello().c_str());

    std::string reply;
    TEST_ASSERT_TRUE(core.handle(std::string("{\"v\":1,\"type\":\"open\",\"id\":\"") + ID + "\",\"gate\":\"Garage\"}", reply));
    TEST_ASSERT_EQUAL(1, tx.sent.size());
    TEST_ASSERT_EQUAL_STRING("/BruceRF/gates/Garage.sub", tx.sent[0].c_str());
    TEST_ASSERT_TRUE(reply.find("\"ok\":true") != std::string::npos);
    TEST_ASSERT_TRUE(core.lastEvent().ok);

    tx.result = TxResult::Failed;
    core.handle(std::string("{\"v\":1,\"type\":\"open\",\"id\":\"") + ID + "\",\"gate\":\"Garage\"}", reply);
    TEST_ASSERT_TRUE(reply.find("TX_FAILED") != std::string::npos);
    TEST_ASSERT_EQUAL_STRING("TX_FAILED", core.lastEvent().error.c_str());
}

void test_relay_core_rejects_paths_and_unknown_gates() {
    FakeRepo repo;
    FakeTx tx;
    RelayCore core(repo, tx, "fw/1");
    core.hello();
    std::string reply;
    core.handle(std::string("{\"v\":1,\"type\":\"open\",\"id\":\"") + ID + "\",\"gate\":\"../../config\"}", reply);
    TEST_ASSERT_TRUE(reply.find("INVALID_NAME") != std::string::npos);
    core.handle(std::string("{\"v\":1,\"type\":\"open\",\"id\":\"") + ID + "\",\"gate\":\"Unknown\"}", reply);
    TEST_ASSERT_TRUE(reply.find("GATE_NOT_FOUND") != std::string::npos);
    TEST_ASSERT_EQUAL(0, tx.sent.size());

    TEST_ASSERT_TRUE(core.handle("{\"v\":1,\"type\":\"ping\"}", reply));
    TEST_ASSERT_EQUAL_STRING("{\"v\":1,\"type\":\"pong\"}", reply.c_str());
    TEST_ASSERT_FALSE(core.handle("{\"v\":1,\"type\":\"something-new\"}", reply));
}

void test_ws_url() {
    WsUrl u;
    TEST_ASSERT_TRUE(parseWsUrl("wss://gate.example.com/device", u));
    TEST_ASSERT_EQUAL_STRING("gate.example.com", u.host.c_str());
    TEST_ASSERT_EQUAL(443, u.port);
    TEST_ASSERT_EQUAL_STRING("/device", u.path.c_str());
    TEST_ASSERT_TRUE(parseWsUrl("wss://gate.example.com:8443/device", u));
    TEST_ASSERT_EQUAL(8443, u.port);
    TEST_ASSERT_FALSE(parseWsUrl("ws://gate.example.com/device", u));
    TEST_ASSERT_TRUE(parseWsUrl("ws://192.168.0.10:8787/device", u, true));
    TEST_ASSERT_FALSE(u.secure);
    TEST_ASSERT_FALSE(parseWsUrl("wss://user@host/device", u));
    TEST_ASSERT_FALSE(parseWsUrl("wss://:443/x", u));
    TEST_ASSERT_FALSE(parseWsUrl("https://gate.example.com", u));
}

void test_backoff() {
    Backoff b;
    const uint32_t expected[] = {2000, 4000, 8000, 16000, 32000, 60000, 60000};
    for (uint32_t e : expected) TEST_ASSERT_EQUAL_UINT32(e, b.next());
    b.reset();
    TEST_ASSERT_EQUAL_UINT32(2000, b.next());
}

int main(int, char **) {
    UNITY_BEGIN();
    RUN_TEST(test_gate_names);
    RUN_TEST(test_gate_name_from_file);
    RUN_TEST(test_parse_server_messages);
    RUN_TEST(test_encode);
    RUN_TEST(test_relay_core_open_flow);
    RUN_TEST(test_relay_core_rejects_paths_and_unknown_gates);
    RUN_TEST(test_ws_url);
    RUN_TEST(test_backoff);
    return UNITY_END();
}
