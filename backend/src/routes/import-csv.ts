import { parse } from "csv-parse/sync";
import { ApiError } from "../middleware/errors.js";

const requiredColumns: Record<string, string[]> = {
  PATIENT: [
    "internal_code",
    "first_name",
    "last_name",
    "date_of_birth",
    "sex",
  ],
  EMR: ["source_record_id", "source_patient_id", "encounter_type", "encounter_at", "status"],
  LIS: ["source_record_id", "source_patient_id", "test_code", "test_name", "status"],
  BILLING: [
    "source_record_id",
    "source_patient_id",
    "invoice_number",
    "currency",
    "total_amount",
    "paid_amount",
    "balance_amount",
    "status",
    "issued_at",
  ],
  INSURANCE: [
    "source_record_id",
    "source_patient_id",
    "payer_name",
    "member_reference",
    "coverage_status",
  ],
};

const previewColumns: Record<string, string[]> = {
  PATIENT: [
    "internal_code",
    "first_name",
    "last_name",
    "date_of_birth",
    "sex",
    "emr_patient_id",
    "lis_patient_id",
    "billing_patient_id",
    "insurance_patient_id",
  ],
  EMR: ["source_record_id", "source_patient_id", "encounter_type", "encounter_at", "status"],
  LIS: ["source_record_id", "source_patient_id", "test_code", "test_name", "specimen_collected_at", "status"],
  BILLING: [
    "source_record_id",
    "source_patient_id",
    "invoice_number",
    "currency",
    "total_amount",
    "paid_amount",
    "balance_amount",
    "status",
    "issued_at",
  ],
  INSURANCE: [
    "source_record_id",
    "source_patient_id",
    "payer_name",
    "member_reference",
    "coverage_status",
    "coverage_start",
    "coverage_end",
  ],
};

export function projectImportPreview(payload: Record<string, unknown>, sourceType: string) {
  const allowedColumns = previewColumns[sourceType] ?? [];
  return Object.fromEntries(
    allowedColumns
      .filter((column) => Object.hasOwn(payload, column))
      .map((column) => [column, String(payload[column] ?? "")]),
  );
}

export function duplicateRecordError(
  sourceType: string,
  recordId: string,
  seenInBatch: ReadonlySet<string>,
  existingInDatabase: ReadonlySet<string>,
) {
  if (seenInBatch.has(recordId)) {
    return {
      errorCode: "DUPLICATE_SOURCE_RECORD",
      errorMessage:
        sourceType === "PATIENT"
          ? `Duplicate internal_code ${recordId} in this CSV batch.`
          : `Duplicate source_record_id ${recordId} in this CSV batch.`,
    };
  }

  if (existingInDatabase.has(recordId)) {
    return sourceType === "PATIENT"
      ? {
          errorCode: "PATIENT_ALREADY_EXISTS",
          errorMessage: `Patient internal_code ${recordId} already exists in the Patient Registry.`,
        }
      : {
          errorCode: "DUPLICATE_SOURCE_RECORD",
          errorMessage: `Source record ID ${recordId} already exists in this source system.`,
        };
  }

  return null;
}

function isValidDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!dateOnly && !dateTime) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return !dateOnly || date.toISOString().slice(0, 10) === value;
}

export function parseImportCsv(text: string, sourceType: string) {
  const required = requiredColumns[sourceType];
  if (!required) {
    throw new ApiError(400, "UNSUPPORTED_SOURCE_TYPE", "This source type cannot import CSV data.");
  }

  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 64 * 1024,
    }) as string[][];
  } catch {
    throw new ApiError(400, "INVALID_CSV", "CSV format is invalid. Check its rows and quoting.");
  }

  const [rawHeaders, ...values] = records;
  if (!rawHeaders) {
    throw new ApiError(400, "CSV_HEADER_REQUIRED", "CSV must include a header row and data rows.");
  }

  const headers = rawHeaders.map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new ApiError(400, "INVALID_CSV_HEADERS", "CSV headers must be non-empty and unique.");
  }

  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new ApiError(
      400,
      "CSV_HEADERS_MISSING",
      `CSV is missing required columns: ${missing.join(", ")}.`,
    );
  }
  if (values.length === 0) {
    throw new ApiError(400, "CSV_ROWS_REQUIRED", "CSV must include at least one data row.");
  }

  return values.map((valuesForRow) =>
    Object.fromEntries(headers.map((header, index) => [header, valuesForRow[index] ?? ""])),
  );
}

export function validateImportRow(row: Record<string, string>, sourceType: string) {
  const required = requiredColumns[sourceType];
  if (!required) {
    return { errorCode: "UNSUPPORTED_SOURCE_TYPE", errorMessage: "Source type cannot be imported." };
  }

  if (sourceType === "PATIENT" && !String(row.sex ?? "").trim()) {
    return {
      errorCode: "MISSING_REQUIRED_FIELD",
      errorMessage: "Sex is required.",
    };
  }

  if (
    sourceType === "PATIENT" &&
    !["Male", "Female"].includes(String(row.sex ?? "").trim())
  ) {
    return {
      errorCode: "INVALID_SEX",
      errorMessage: "Sex must be either Male or Female.",
    };
  }

  if (required.some((field) => !String(row[field] ?? "").trim())) {
    return {
      errorCode: "MISSING_REQUIRED_FIELD",
      errorMessage: "One or more required fields are empty.",
    };
  }

  if (
    (sourceType === "EMR" && !isValidDate(row.encounter_at)) ||
    (sourceType === "BILLING" && !isValidDate(row.issued_at)) ||
    (sourceType === "PATIENT" && !isValidDate(row.date_of_birth))
  ) {
    return {
      errorCode: "INVALID_DATE",
      errorMessage: "A date must use YYYY-MM-DD or an ISO 8601 timestamp with timezone.",
    };
  }

  if (sourceType === "BILLING") {
    const amounts = [row.total_amount, row.paid_amount, row.balance_amount];
    if (
      !/^[A-Z]{3}$/i.test(row.currency) ||
      amounts.some((amount) => !/^\d+(?:\.\d{1,2})?$/.test(amount))
    ) {
      return {
        errorCode: "INVALID_BILLING_VALUE",
        errorMessage: "Currency must be a three-letter code and amounts must be non-negative decimals.",
      };
    }
  }

  if (
    sourceType === "INSURANCE" &&
    [row.coverage_start, row.coverage_end].some(
      (date) => Boolean(date?.trim()) && !isValidDate(date.trim()),
    )
  ) {
    return {
      errorCode: "INVALID_DATE",
      errorMessage: "Coverage dates must use YYYY-MM-DD or an ISO 8601 timestamp with timezone.",
    };
  }

  return null;
}
