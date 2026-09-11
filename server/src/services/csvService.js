import fs from "node:fs";
import { parse } from "csv-parse/sync";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Column header candidates we treat as "the email" / "the name".
const EMAIL_KEYS = ["email", "email address", "e-mail", "mail", "recipient"];
const NAME_KEYS = ["name", "full name", "first name", "fullname", "contact"];

const isEmail = (v) => EMAIL_RE.test(String(v ?? "").trim().toLowerCase());

function pick(row, candidates) {
  const entries = Object.entries(row);
  for (const cand of candidates) {
    const hit = entries.find(([k]) => k.trim().toLowerCase() === cand);
    if (hit && String(hit[1]).trim()) return String(hit[1]).trim();
  }
  return "";
}

/**
 * Parse a recipients CSV into a de-duplicated list of { email, name, fields }.
 *
 * Works with:
 *   - a full sheet:      name,email,role,company
 *   - email + name only: email,name   (either order)
 *   - just emails with a header:   email\n a@x.com\n b@y.com
 *   - just a bare list of emails, no header at all
 *
 * Any column that is not the email/name is preserved in `fields` so the
 * email body can reference it as {{ColumnName}}.
 */
export function parseRecipientsCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");

  // First pass: assume there is a header row.
  let rows = parse(raw, {
    columns: (header) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  // If a "column name" is itself an email address, there was no header row.
  const headerless =
    rows.length > 0 && Object.keys(rows[0]).some((k) => isEmail(k));

  if (rows.length === 0 || headerless) {
    const arrays = parse(raw, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
    rows = arrays.map((cols) => {
      const email =
        cols.find((c) => isEmail(c)) ?? cols[0] ?? "";
      const name =
        cols.find((c) => c && c !== email && !isEmail(c)) ?? "";
      return { email, name };
    });
  }

  const seen = new Set();
  const recipients = [];
  let invalid = 0;

  for (const row of rows) {
    let email = pick(row, EMAIL_KEYS);
    if (!email) {
      // no recognised header — take the first cell that looks like an email
      const emailish = Object.values(row).find((v) => isEmail(v));
      if (emailish) email = String(emailish).trim();
    }
    email = String(email || "").trim().toLowerCase();

    if (!isEmail(email)) {
      invalid += 1;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);

    recipients.push({
      email,
      name: pick(row, NAME_KEYS) || row.name || "",
      fields: row,
    });
  }

  return { recipients, invalidCount: invalid, totalRows: rows.length };
}
