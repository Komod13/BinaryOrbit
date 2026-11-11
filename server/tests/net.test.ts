import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NetworkInterfaceInfo } from 'node:os';
import { pickLanAddress, rankLanAddresses } from '../net.ts';

function nic(address: string, family: 'IPv4' | 'IPv6' | 4 = 'IPv4', internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: family === 'IPv6' ? 'ffff:ffff:ffff:ffff::' : '255.255.255.0',
    family,
    mac: '00:00:00:00:00:00',
    internal,
    cidr: family === 'IPv6' ? `${address}/64` : `${address}/24`,
  } as NetworkInterfaceInfo;
}

test('Windows + 代理 TUN：跳过 198.18.0.1，选中真实 WiFi 网卡', () => {
  const interfaces = {
    // 顺序和 Windows 上踩坑时一致：虚拟网卡排在前面
    Clash: [nic('198.18.0.1')],
    'vEthernet (WSL)': [nic('172.28.96.1')],
    WLAN: [nic('192.168.88.209')],
    'Loopback Pseudo-Interface 1': [nic('127.0.0.1', 'IPv4', true)],
  };
  const picked = pickLanAddress(interfaces);
  assert.equal(picked.address, '192.168.88.209');
  assert.equal(picked.fromEnv, false);
});

test('只剩 fake-ip 段时不会误报一个能打印但连不上的地址', () => {
  const picked = pickLanAddress({ Clash: [nic('198.18.0.1')] });
  assert.equal(picked.address, null);
  assert.equal(picked.candidates.length, 1);
  assert.ok(picked.candidates[0]!.score < 0);
});

test('链路本地 169.254.x 也算不可用', () => {
  assert.equal(pickLanAddress({ 以太网: [nic('169.254.13.7')] }).address, null);
});

test('私有网段优先级：192.168 > 10 > 172.16–31', () => {
  const candidates = rankLanAddresses({
    以太网: [nic('172.20.1.5')],
    WLAN: [nic('10.0.0.7')],
    WiFi: [nic('192.168.1.20')],
  });
  assert.deepEqual(
    candidates.map((candidate) => candidate.address),
    ['192.168.1.20', '10.0.0.7', '172.20.1.5'],
  );
});

test('网卡名像虚拟机 / VPN 的会降权，真实网卡胜出', () => {
  const picked = pickLanAddress({
    'VMware Network Adapter VMnet8': [nic('192.168.163.1')],
    以太网: [nic('192.168.31.40')],
  });
  assert.equal(picked.address, '192.168.31.40');
});

test('忽略 IPv6、回环与重复地址', () => {
  const picked = pickLanAddress({
    WLAN: [nic('192.168.5.9'), nic('192.168.5.9'), nic('fe80::1', 'IPv6')],
    'Loopback Pseudo-Interface 1': [nic('127.0.0.1', 'IPv4', true)],
  });
  assert.equal(picked.address, '192.168.5.9');
  assert.equal(picked.candidates.length, 1);
});

test('兼容老版本 Node 的数字型 family', () => {
  const picked = pickLanAddress({ WLAN: [nic('192.168.7.8', 4)] });
  assert.equal(picked.address, '192.168.7.8');
});

test('.env 的 LAN_IP 优先；非法值则回退到自动挑选并给出提示', () => {
  const interfaces = { WLAN: [nic('192.168.88.209')] };
  const forced = pickLanAddress(interfaces, '192.168.88.10');
  assert.equal(forced.address, '192.168.88.10');
  assert.equal(forced.fromEnv, true);
  assert.equal(forced.overrideError, undefined);

  const bad = pickLanAddress(interfaces, '192.168.88');
  assert.equal(bad.address, '192.168.88.209');
  assert.equal(bad.fromEnv, false);
  assert.match(bad.overrideError ?? '', /LAN_IP=192\.168\.88/);
});

test('.env 的 LAN_IP 写回环地址时同样被忽略', () => {
  const interfaces = { WLAN: [nic('192.168.88.209')] };
  const loopback = pickLanAddress(interfaces, '127.0.0.1');
  assert.equal(loopback.address, '192.168.88.209');
  assert.equal(loopback.fromEnv, false);
  assert.match(loopback.overrideError ?? '', /不是合法 IPv4/);
});
