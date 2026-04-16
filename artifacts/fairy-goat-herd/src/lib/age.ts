import { parseDate } from "@/lib/date";

export function formatAge(dateOfBirth: string | Date | null | undefined): string {
  if (!dateOfBirth) return "Unknown age";

  const dob = parseDate(dateOfBirth);
  if (!dob) return "Unknown age";

  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  let years = now.getFullYear() - dob.getUTCFullYear();
  let months = now.getMonth() - dob.getUTCMonth();
  let days = now.getDate() - dob.getUTCDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0));
    days += prevMonth.getUTCDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  void todayUTC;

  if (years < 0) return "Unknown age";

  if (years >= 2) {
    return months > 0 ? `${years} yr ${months} mo` : `${years} years`;
  }

  if (years === 1) {
    return months > 0 ? `1 yr ${months} mo` : "1 year";
  }

  if (months >= 2) {
    return days > 0 ? `${months} mo ${days} d` : `${months} months`;
  }

  if (months === 1) {
    return days > 0 ? `1 mo ${days} d` : "1 month";
  }

  if (days === 1) return "1 day";
  return `${days} days`;
}
