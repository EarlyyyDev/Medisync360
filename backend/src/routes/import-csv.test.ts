import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  duplicateRecordError,
  parseImportCsv,
  projectImportPreview,
  validateImportRow,
} from "./import-csv.js";
import { patientSchema } from "./patients.js";

describe("CSV import validation", () => {
  it.each([
    ["../../../demo-data/patients-20-demo.csv", "PATIENT"],
    ["../../../demo-data/emr-demo.csv", "EMR"],
    ["../../../demo-data/lis-demo.csv", "LIS"],
    ["../../../demo-data/billing-demo.csv", "BILLING"],
    ["../../../demo-data/insurance-demo.csv", "INSURANCE"],
  ])("accepts the provided %s demo file", (filePath, sourceType) => {
    const text = readFileSync(new URL(filePath, import.meta.url), "utf8");
    const rows = parseImportCsv(text, sourceType);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => validateImportRow(row, sourceType) === null)).toBe(true);
  });

  it("accepts a source-specific CSV with trimmed headers", () => {
    const rows = parseImportCsv(
      " source_record_id ,source_patient_id,encounter_type,encounter_at,status\nE-1,P-1,Visit,2026-11-20T09:30:00Z,completed",
      "EMR",
    );

    expect(rows).toEqual([
      {
        source_record_id: "E-1",
        source_patient_id: "P-1",
        encounter_type: "Visit",
        encounter_at: "2026-11-20T09:30:00Z",
        status: "completed",
      },
    ]);
  });

  it("rejects CSVs missing columns required by the selected source", () => {
    expect(() => parseImportCsv("source_record_id,source_patient_id\nR-1,P-1", "LIS"))
      .toThrow("CSV is missing required columns");
    expect(() =>
      parseImportCsv(
        "internal_code,first_name,last_name,date_of_birth\nDEMO-021,Jamie,Sample,1990-01-01",
        "PATIENT",
      ),
    ).toThrow("sex");
  });

  it.each(["", "   "])("rejects a patient row with missing sex value %j", (sex) => {
    expect(validateImportRow({
      internal_code: "DEMO-021",
      first_name: "Jamie",
      last_name: "Sample",
      date_of_birth: "1990-01-01",
      sex,
    }, "PATIENT")).toMatchObject({
      errorCode: "MISSING_REQUIRED_FIELD",
      errorMessage: "Sex is required.",
    });
  });

  it.each(["Undeclared", "Other", "male"])("rejects unsupported patient sex value %s", (sex) => {
    expect(validateImportRow({
      internal_code: "DEMO-021",
      first_name: "Jamie",
      last_name: "Sample",
      date_of_birth: "1990-01-01",
      sex,
    }, "PATIENT")).toMatchObject({
      errorCode: "INVALID_SEX",
      errorMessage: "Sex must be either Male or Female.",
    });
  });

  it.each(["Male", "Female"])("accepts patient sex %s for CSV and direct registration", (sex) => {
    const patient = {
      internalCode: "DEMO-021",
      firstName: "Jamie",
      lastName: "Sample",
      dateOfBirth: "1990-01-01",
      sex,
    };

    expect(validateImportRow({
      internal_code: "DEMO-021",
      first_name: "Jamie",
      last_name: "Sample",
      date_of_birth: "1990-01-01",
      sex,
    }, "PATIENT")).toBeNull();
    expect(patientSchema.safeParse(patient).success).toBe(true);
  });

  it("explains duplicate rows found in the upload or existing database", () => {
    expect(duplicateRecordError("EMR", "E-1", new Set(["E-1"]), new Set()))
      .toMatchObject({
        errorCode: "DUPLICATE_SOURCE_RECORD",
        errorMessage: "Duplicate source_record_id E-1 in this CSV batch.",
      });
    expect(duplicateRecordError("BILLING", "B-1", new Set(), new Set(["B-1"])))
      .toMatchObject({
        errorCode: "DUPLICATE_SOURCE_RECORD",
        errorMessage: "Source record ID B-1 already exists in this source system.",
      });
    expect(duplicateRecordError("PATIENT", "DEMO-001", new Set(), new Set(["DEMO-001"])))
      .toMatchObject({
        errorCode: "PATIENT_ALREADY_EXISTS",
        errorMessage: "Patient internal_code DEMO-001 already exists in the Patient Registry.",
      });
  });

  it("accepts 20 distinct synthetic patient rows", () => {
    const text = readFileSync(new URL("../../../demo-data/patients-20-demo.csv", import.meta.url), "utf8");
    const rows = parseImportCsv(text, "PATIENT");

    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((row) => row.internal_code)).size).toBe(20);
  });

  it.each([
    ["emr-demo.csv", "EMR", "emr_patient_id"],
    ["lis-demo.csv", "LIS", "lis_patient_id"],
    ["billing-demo.csv", "BILLING", "billing_patient_id"],
    ["insurance-demo.csv", "INSURANCE", "insurance_patient_id"],
  ])("provides one mapped %s demo record for each of the 20 patients", (fileName, sourceType, patientIdColumn) => {
    const patientText = readFileSync(new URL("../../../demo-data/patients-20-demo.csv", import.meta.url), "utf8");
    const sourceText = readFileSync(new URL(`../../../demo-data/${fileName}`, import.meta.url), "utf8");
    const patients = parseImportCsv(patientText, "PATIENT");
    const sourceRows = parseImportCsv(sourceText, sourceType);

    expect(sourceRows).toHaveLength(20);
    expect(new Set(sourceRows.map((row) => row.source_patient_id))).toEqual(
      new Set(patients.map((row) => row[patientIdColumn])),
    );
    expect(new Set(sourceRows.map((row) => row.source_record_id)).size).toBe(20);
    expect(sourceRows.every((row) => validateImportRow(row, sourceType) === null)).toBe(true);
  });

  it("rejects malformed rows instead of failing during import", () => {
    expect(() =>
      parseImportCsv(
        'source_record_id,source_patient_id,encounter_type,encounter_at,status\nE-1,P-1,"unfinished',
        "EMR",
      ),
    ).toThrow("CSV format is invalid");
  });

  it("rejects invalid required values before the batch can be confirmed", () => {
    expect(
      validateImportRow(
        {
          source_record_id: "E-1",
          source_patient_id: "P-1",
          encounter_type: "Visit",
          encounter_at: "not-a-date",
          status: "completed",
        },
        "EMR",
      ),
    ).toMatchObject({ errorCode: "INVALID_DATE" });
  });

  it("rejects invalid billing amounts during validation", () => {
    expect(
      validateImportRow(
        {
          source_record_id: "B-1",
          source_patient_id: "P-1",
          invoice_number: "INV-1",
          currency: "PHP",
          total_amount: "1; DROP TABLE invoices",
          paid_amount: "0.00",
          balance_amount: "1.00",
          status: "open",
          issued_at: "2026-11-20T12:00:00Z",
        },
        "BILLING",
      ),
    ).toMatchObject({ errorCode: "INVALID_BILLING_VALUE" });
  });

  it("includes known source fields in review details but excludes arbitrary payload fields", () => {
    expect(
      projectImportPreview(
        {
          source_record_id: "E-1",
          source_patient_id: "P-1",
          encounter_type: "Visit",
          encounter_at: "2026-11-20T09:30:00Z",
          status: "completed",
          unexpected_private_field: "must not be returned",
        },
        "EMR",
      ),
    ).toEqual({
      source_record_id: "E-1",
      source_patient_id: "P-1",
      encounter_type: "Visit",
      encounter_at: "2026-11-20T09:30:00Z",
      status: "completed",
    });
  });
});
