export function formatTicketNumber(
  year: number,
  sequence: number,
): string {
  if (
    !Number.isInteger(year) ||
    year < 1000 ||
    year > 9999
  ) {
    throw new RangeError(
      "Ticket Number year must contain four digits.",
    );
  }

  if (
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > 99999
  ) {
    throw new RangeError(
      "Ticket Number sequence must be between 1 and 99999.",
    );
  }

  return `TKT-${year}-${String(sequence).padStart(5, "0")}`;
}