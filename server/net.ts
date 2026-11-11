import { networkInterfaces } from 'node:os';
import type { NetworkInterfaceInfo } from 'node:os';

export interface LanCandidate {
  /** 网卡名，如 WLAN / 以太网 / Clash */
  name: string;
  address: string;
  /** 越大越像家里那张真实网卡；≤0 表示基本不该用 */
  score: number;
}

/**
 * 代理 / 虚拟机的网卡名。Clash、Hyper-V、WSL、Docker、VMware 这些都会插一张网卡，
 * 而且经常排在内置网卡前面，直接把它们的地址印出来手机是连不上的。
 */
const VIRTUAL_NAME =
  /(vethernet|hyper-?v|default switch|wsl|vmware|virtualbox|vbox|docker|podman|br-|veth|npcap|loopback|tailscale|zerotier|wireguard|hamachi|openvpn|tap|tun|utun|ppp|clash|mihomo|surge|sing-?box|vpn)/i;

/** 常见真实网卡名（Windows 中文系统是「以太网」「WLAN」）。 */
const REAL_NAME = /^(wi-?fi|wlan|wlp|以太网|本地连接|ethernet|en\d|eth\d)/i;

function toInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function inRange(value: number, base: string, bits: number): boolean {
  const baseValue = toInt(base);
  if (baseValue === null) return false;
  const size = 2 ** (32 - bits);
  return value >= baseValue && value < baseValue + size;
}

/** 语法合法、且不是回环 / 组播 / 保留段的 IPv4。 */
export function isValidIPv4(ip: string): boolean {
  const value = toInt(ip);
  if (value === null) return false;
  return (
    !inRange(value, '0.0.0.0', 8) &&
    !inRange(value, '127.0.0.0', 8) &&
    !inRange(value, '224.0.0.0', 3) &&
    !inRange(value, '240.0.0.0', 4)
  );
}

/**
 * 给每个非内部 IPv4 打分：
 * 192.168/16 > 10/8 > 172.16/12 > 公网地址 > CGNAT(100.64/10)；
 * 198.18/15（Clash 等的 fake-ip 段）、169.254/16（没拿到 DHCP）直接负分。
 */
function scoreOne(name: string, address: string): number {
  const value = toInt(address);
  if (value === null) return -100;

  let score: number;
  if (inRange(value, '127.0.0.0', 8)) score = -100;
  else if (inRange(value, '0.0.0.0', 8)) score = -100;
  else if (inRange(value, '224.0.0.0', 3) || inRange(value, '240.0.0.0', 4)) score = -100;
  else if (inRange(value, '192.168.0.0', 16)) score = 60;
  else if (inRange(value, '10.0.0.0', 8)) score = 55;
  else if (inRange(value, '172.16.0.0', 12)) score = 50;
  else if (inRange(value, '198.18.0.0', 15)) score = -50; // 代理工具的 fake-ip 段
  else if (inRange(value, '169.254.0.0', 16)) score = -60; // 链路本地：没连上 DHCP
  else if (inRange(value, '100.64.0.0', 10)) score = 5; // 运营商 NAT / Tailscale
  else score = 20; // 其它看起来是公网地址

  if (VIRTUAL_NAME.test(name)) score -= 25;
  else if (REAL_NAME.test(name)) score += 5;
  return score;
}

/** 按「像不像真实局域网网卡」排序，返回全部非内部 IPv4（含被扣成负分的）。 */
export function rankLanAddresses(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): LanCandidate[] {
  const seen = new Set<string>();
  const candidates: LanCandidate[] = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      // Node <18.4 的 family 是数字，两代都兼容
      const family = String(info.family);
      if (family !== 'IPv4' && family !== '4') continue;
      if (info.internal) continue;
      if (seen.has(info.address)) continue;
      seen.add(info.address);
      candidates.push({ name, address: info.address, score: scoreOne(name, info.address) });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));
  return candidates;
}

export interface PickedLanAddress {
  address: string | null;
  /** 是否来自 .env 的 LAN_IP */
  fromEnv: boolean;
  /** .env 的 LAN_IP 写了但用不了时的提示（此时已回退到自动挑选） */
  overrideError?: string;
  candidates: LanCandidate[];
}

/**
 * 选一个给手机用的地址。.env 里的 LAN_IP 优先（家里网卡多、或者想固定 IP 时用）。
 * 都没有可用的就返回 null，由调用方打印提示。
 */
export function pickLanAddress(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
  override?: string,
): PickedLanAddress {
  const candidates = rankLanAddresses(interfaces);
  const best = candidates.find((candidate) => candidate.score > 0)?.address ?? null;
  const forced = override?.trim();
  if (!forced) return { address: best, fromEnv: false, candidates };

  if (!isValidIPv4(forced)) {
    return { address: best, fromEnv: false, overrideError: `.env 的 LAN_IP=${forced} 不是合法 IPv4，已忽略`, candidates };
  }
  return { address: forced, fromEnv: true, candidates };
}
