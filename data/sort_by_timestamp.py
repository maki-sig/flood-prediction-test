"""Sort the training CSV chronologically, preserving columns and equal-time order."""

import argparse
import csv
from datetime import datetime
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    folder = Path(__file__).resolve().parent
    parser.add_argument("input", nargs="?", type=Path,
                        default=folder / "raw_training_dataset.csv")
    parser.add_argument("output", nargs="?", type=Path,
                        default=folder / "sorted_training_dataset.csv")
    parser.add_argument("--timestamp-format", default="%m/%d/%Y %H:%M",
                        help="datetime format (default: month/day/year hour:minute)")
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Input and output must be different files.")

    with args.input.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        columns = reader.fieldnames
        if not columns or "timestamp" not in columns:
            parser.error("Input CSV must contain a 'timestamp' column.")
        rows = []
        for line_number, row in enumerate(reader, start=2):
            try:
                timestamp = datetime.strptime(row["timestamp"], args.timestamp_format)
            except (ValueError, TypeError) as error:
                parser.error(f"Invalid timestamp at CSV record {line_number}: {error}")
            rows.append((timestamp, row))

    rows.sort(key=lambda item: item[0])
    with args.output.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=columns)
        writer.writeheader()
        writer.writerows(row for _, row in rows)
    print(f"Sorted {len(rows):,} rows into {args.output}")


if __name__ == "__main__":
    main()
