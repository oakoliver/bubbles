/** Formats a millisecond duration like Go's time.Duration.String. */
export function formatDuration(milliseconds: number): string {
  if (milliseconds === 0 || Object.is(milliseconds, -0)) return '0s';
  if (!Number.isFinite(milliseconds)) return String(milliseconds);

  const negative = milliseconds < 0;
  const nanoseconds = BigInt(Math.round(Math.abs(milliseconds) * 1_000_000));
  if (nanoseconds === 0n) return '0s';

  const sign = negative ? '-' : '';
  if (nanoseconds < 1_000n) return `${sign}${nanoseconds}ns`;
  if (nanoseconds < 1_000_000n) {
    return sign + formatDecimal(nanoseconds, 1_000n, 3) + 'µs';
  }
  if (nanoseconds < 1_000_000_000n) {
    return sign + formatDecimal(nanoseconds, 1_000_000n, 6) + 'ms';
  }

  let remainder = nanoseconds;
  const hours = remainder / 3_600_000_000_000n;
  remainder %= 3_600_000_000_000n;
  const minutes = remainder / 60_000_000_000n;
  remainder %= 60_000_000_000n;
  const seconds = remainder / 1_000_000_000n;
  const fraction = remainder % 1_000_000_000n;

  let result = sign;
  if (hours > 0n) result += `${hours}h`;
  if (hours > 0n || minutes > 0n) result += `${minutes}m`;
  result += seconds.toString();
  if (fraction > 0n) {
    result += `.${fraction.toString().padStart(9, '0').replace(/0+$/, '')}`;
  }
  return result + 's';
}

function formatDecimal(value: bigint, unit: bigint, fractionalDigits: number): string {
  const whole = value / unit;
  const fraction = value % unit;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(fractionalDigits, '0').replace(/0+$/, '')}`;
}
