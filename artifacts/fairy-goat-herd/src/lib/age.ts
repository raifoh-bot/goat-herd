export function formatAge(dateOfBirth: string | Date | null | undefined): string {
  if (!dateOfBirth) return "Unknown age";

  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return "Unknown age";

  const today = new Date();

  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  let days = today.getDate() - dob.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

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
