export type OfficePolicy = {
  officeLatitude: number | null;
  officeLongitude: number | null;
  allowedRadiusMeters: number;
  authorizedIps: string[];
  requireLocation: boolean;
  requireNetwork: boolean;
  hrApprovalForExceptions: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
};

export function parseShiftTime(value?: string | null) {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function arrivalStatus(checkIn: Date, shiftStart?: string | null) {
  const start = parseShiftTime(shiftStart);
  if (start == null) return 'PRESENT' as const;
  const minutes = checkIn.getHours() * 60 + checkIn.getMinutes();
  if (minutes > start) return 'LATE' as const;
  if (minutes < start) return 'EARLY' as const;
  return 'PRESENT' as const;
}

export function storedArrivalStatus(checkIn: Date, shiftStart?: string | null) {
  return arrivalStatus(checkIn, shiftStart) === 'LATE' ? ('LATE' as const) : ('PRESENT' as const);
}

/** Early arrivals stay PRESENT in storage. The attendance screens show them as Early. */
export function displayedStatus(status: string, checkIn?: Date | string | null, shiftStart?: string | null) {
  if ((status !== 'PRESENT' && status !== 'EARLY') || !checkIn) return status;
  const start = parseShiftTime(shiftStart);
  if (start == null) return status === 'EARLY' ? 'PRESENT' : status;
  const when = new Date(checkIn);
  if (Number.isNaN(when.getTime())) return status;
  const minutes = when.getHours() * 60 + when.getMinutes();
  if (minutes < start) return 'EARLY';
  if (minutes > start) return 'LATE';
  return 'PRESENT';
}

export function overtimeMinutes(checkOut: Date, shiftEnd?: string | null) {
  const end = parseShiftTime(shiftEnd);
  if (end == null) return 0;
  const minutes = checkOut.getHours() * 60 + checkOut.getMinutes();
  return Math.max(0, minutes - end);
}

export type LocationFix = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  capturedAt?: string;
};

export type VerificationResult = {
  locationVerified: boolean;
  networkVerified: boolean;
  distanceMeters: number | null;
  accuracy: number | null;
  latitude: number | null;
  longitude: number | null;
  capturedAt: Date | null;
  publicIp: string;
  locationMessage: string;
  networkMessage: string;
};

const EARTH_RADIUS_M = 6_371_000;
const MAX_ACCURACY_M = 1000;
const MAX_FIX_AGE_MS = 3 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeIp(ip: string) {
  let value = ip.trim().replace(/^::ffff:/i, '');
  if (value === '::1') value = '127.0.0.1';
  return value;
}

export function clientIpFromRequest(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
}

const NON_PUBLIC_RANGES = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
];

export function isNonPublicIp(ip: string) {
  const normalized = normalizeIp(ip);
  if (!normalized) return true;
  if (normalized.includes(':')) {
    const lower = normalized.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
  }
  return isAuthorizedIp(normalized, NON_PUBLIC_RANGES);
}

let egressCache: { ip: string; at: number } | null = null;

async function fetchEgressIp() {
  const sources = ['https://api.ipify.org', 'https://checkip.amazonaws.com'];
  for (const url of sources) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      const text = (await response.text()).trim();
      const ip = normalizeIp(text);
      if (response.ok && ip && !isNonPublicIp(ip)) return ip;
    } catch {
      // Try the next public-IP service.
    } finally {
      clearTimeout(timer);
    }
  }
  return '';
}

/** Loopback and LAN addresses are not the office public IP. Look up this network's egress address on the server. */
export async function resolvePublicIp(peerIp: string) {
  const ip = normalizeIp(peerIp);
  if (ip && !isNonPublicIp(ip)) return ip;
  const now = Date.now();
  if (egressCache && now - egressCache.at < 60_000) return egressCache.ip;
  const egress = await fetchEgressIp();
  if (!egress) return ip;
  egressCache = { ip: egress, at: now };
  return egress;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

export function isAuthorizedIp(clientIp: string, rules: string[]) {
  const ip = normalizeIp(clientIp);
  for (const raw of rules) {
    const rule = raw.trim();
    if (!rule) continue;
    if (!rule.includes('/')) {
      if (normalizeIp(rule) === ip) return true;
      continue;
    }
    const [base, bitsRaw] = rule.split('/');
    const bits = Number(bitsRaw);
    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(normalizeIp(base));
    if (ipInt == null || baseInt == null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((ipInt & mask) === (baseInt & mask)) return true;
  }
  return false;
}

export function isPlausibleIpRule(rule: string) {
  const value = rule.trim();
  if (!value) return false;
  if (value.includes('/')) {
    const [base, bitsRaw] = value.split('/');
    const bits = Number(bitsRaw);
    return ipv4ToInt(normalizeIp(base)) != null && Number.isInteger(bits) && bits >= 0 && bits <= 32;
  }
  return ipv4ToInt(normalizeIp(value)) != null || normalizeIp(value).includes(':');
}

function hasCoords(fix: LocationFix): fix is LocationFix & { latitude: number; longitude: number } {
  return Number.isFinite(fix.latitude) && Number.isFinite(fix.longitude);
}

export function verifyAttendance(policy: OfficePolicy, publicIp: string, fix: LocationFix): VerificationResult {
  const ip = normalizeIp(publicIp);
  let locationVerified = !policy.requireLocation;
  let locationMessage = policy.requireLocation
    ? 'Location was not provided.'
    : 'Location verification is turned off.';
  let distance: number | null = null;
  let capturedAt: Date | null = null;
  const accuracy = Number.isFinite(fix.accuracy) ? Number(fix.accuracy) : null;
  const latitude = hasCoords(fix) ? fix.latitude : null;
  const longitude = hasCoords(fix) ? fix.longitude : null;

  if (hasCoords(fix) && policy.officeLatitude != null && policy.officeLongitude != null) {
    distance = distanceMeters(policy.officeLatitude, policy.officeLongitude, fix.latitude, fix.longitude);
  }

  if (policy.requireLocation) {
    if (policy.officeLatitude == null || policy.officeLongitude == null) {
      locationMessage = 'Office location is not configured.';
    } else if (!hasCoords(fix)) {
      locationMessage = 'Location permission was denied or the device did not provide coordinates.';
    } else if (accuracy == null || accuracy < 0) {
      locationMessage = 'Location accuracy was not provided.';
    } else if (accuracy > MAX_ACCURACY_M) {
      locationMessage = `GPS accuracy is ${Math.round(accuracy)} meters, which is too coarse to confirm the office.`;
    } else if (!fix.capturedAt) {
      locationMessage = 'Location timestamp is missing.';
    } else {
      const when = new Date(fix.capturedAt);
      const age = Date.now() - when.getTime();
      if (Number.isNaN(when.getTime())) {
        locationMessage = 'Location timestamp is invalid.';
      } else if (age > MAX_FIX_AGE_MS) {
        locationMessage = 'Location reading is too old. Refresh and try again.';
        capturedAt = when;
      } else if (age < -MAX_FUTURE_SKEW_MS) {
        locationMessage = 'Location timestamp is in the future.';
      } else {
        capturedAt = when;
        locationVerified = distance != null && distance <= policy.allowedRadiusMeters;
        locationMessage = locationVerified
          ? `Within the office radius (${Math.round(distance!)} m of ${policy.allowedRadiusMeters} m).`
          : `Outside the office radius (${Math.round(distance ?? 0)} m; allowed ${policy.allowedRadiusMeters} m).`;
      }
    }
  } else if (hasCoords(fix) && policy.officeLatitude != null && policy.officeLongitude != null) {
    distance = distanceMeters(policy.officeLatitude, policy.officeLongitude, fix.latitude, fix.longitude);
    capturedAt = fix.capturedAt ? new Date(fix.capturedAt) : null;
  }

  const networkConfigured = policy.authorizedIps.some((rule) => rule.trim());
  let networkVerified = !policy.requireNetwork;
  let networkMessage = policy.requireNetwork
    ? 'Office network was not verified.'
    : 'Office network verification is turned off.';
  if (policy.requireNetwork) {
    if (!networkConfigured) {
      networkMessage = 'No authorized office IP is configured.';
    } else if (!ip) {
      networkMessage = 'The server could not determine your public IP.';
    } else if (isAuthorizedIp(ip, policy.authorizedIps)) {
      networkVerified = true;
      networkMessage = 'Connected through an authorized office network.';
    } else {
      networkMessage = `This connection (${ip}) is not an authorized office IP.`;
    }
  }

  return {
    locationVerified,
    networkVerified,
    distanceMeters: distance,
    accuracy,
    latitude,
    longitude,
    capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
    publicIp: ip,
    locationMessage,
    networkMessage,
  };
}
