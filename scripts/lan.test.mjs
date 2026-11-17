import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLanIp } from './lan.mjs';
const nic = (address, internal = false) => [{ family: 'IPv4', address, internal }];

test('ưu tiên Wi-Fi thật, bỏ card ảo WSL/VirtualBox/Docker/link-local', () => {
  const r = pickLanIp({
    'vEthernet (WSL)': nic('172.28.0.1'),
    'VirtualBox Host-Only': nic('192.168.56.1'),
    'Ethernet 2': nic('169.254.3.4'),
    Loopback: nic('127.0.0.1', true),
    'Wi-Fi': nic('192.168.1.20'),
  });
  assert.equal(r.ip, '192.168.1.20');
});
test('LAN_IP / --ip luôn thắng tự dò', () => {
  assert.equal(pickLanIp({ 'Wi-Fi': nic('192.168.1.20') }, '10.0.0.9'), '10.0.0.9');
});
test('không có card hợp lệ -> ip undefined', () => {
  assert.equal(pickLanIp({ lo: nic('127.0.0.1', true) }).ip, undefined);
});
