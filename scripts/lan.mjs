import { networkInterfaces } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Card ảo (WSL, Docker, VirtualBox, VMware, VPN...) thường bị chọn nhầm trên Windows -> điểm cao = ít ưu tiên.
const VIRTUAL_NAME = /vethernet|wsl|virtual|vmware|vbox|docker|hyper-v|loopback|tailscale|zerotier|vpn|tap/i;
const score = ({ name, address }) =>
  (VIRTUAL_NAME.test(name) ? 20 : 0) +
  (/^192\.168\.56\./.test(address) ? 15 : 0) + // VirtualBox host-only
  (/^192\.168\./.test(address) ? 0 : /^10\./.test(address) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(address) ? 5 : 8);

/** Chọn IP LAN. Ưu tiên: --ip=... hoặc biến LAN_IP, sau đó card Wi-Fi/Ethernet thật. */
export function pickLanIp(interfacesByName, override) {
  if (override) return override;
  const candidates = Object.entries(interfacesByName).flatMap(([name, list]) =>
    (list || [])
      .filter((n) => n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.') && !n.address.startsWith('172.17.'))
      .map((n) => ({ name, address: n.address })));
  candidates.sort((a, b) => score(a) - score(b));
  return { ip: candidates[0]?.address, candidates };
}

function main() {
  const arg = process.argv.find((a) => a.startsWith('--ip='))?.slice(5);
  const override = arg || process.env.LAN_IP;
  const picked = pickLanIp(networkInterfaces(), override);
  const ip = override || picked.ip;
  if (!ip) { console.error('Không tìm thấy IP LAN. Kết nối Wi-Fi riêng trước khi chạy, hoặc đặt LAN_IP / --ip=.'); process.exit(1); }
  if (!override && picked.candidates.length > 1) {
    console.log('Các IP tìm thấy (chọn cái đầu tiên). Nếu sai, chạy lại với LAN_IP hoặc --ip=:');
    picked.candidates.forEach((c) => console.log(`  ${c.address}  (${c.name})`));
  }
  const env = { ...process.env, WEB_BIND_ADDRESS: '0.0.0.0', API_BIND_ADDRESS: '127.0.0.1', DB_BIND_ADDRESS: '127.0.0.1' };
  const run = spawnSync('docker', ['compose', 'up', '-d', '--build'], { env, stdio: 'inherit' });
  if (run.error || run.status !== 0) process.exit(run.status || 1);
  const url = `http://${ip}:5173/#/guest`;
  console.log('\nMở trên điện thoại cùng Wi-Fi riêng: ' + url);
  console.log('CHỈ cổng web 5173 được mở LAN. API 3000 và SQL 1433 vẫn ở loopback.');
  console.log('Không dùng trên Wi-Fi công cộng; QUÉT QR LAN chỉ dùng để thử, không dùng thay HTTPS public.');
  console.log(`Mobile (Expo) trên điện thoại thật: EXPO_PUBLIC_API_URL=http://${ip}:5173/backend và REACT_NATIVE_PACKAGER_HOSTNAME=${ip}`);
  const qr = spawnSync('python', ['scripts/lan-qr.py', url], { stdio: 'inherit' });
  if (qr.error || qr.status !== 0) console.log('Không tạo được QR terminal. Mở URL phía trên trực tiếp.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
