# MediSync 360
### Healthcare Data Integration and Patient 360 Management System

MediSync 360 is a web-based healthcare data integration platform designed to consolidate information from multiple healthcare data sources into a centralized system.

The application demonstrates how information from Electronic Medical Records (EMR), Laboratory Information Systems (LIS), Billing, and Insurance systems can be collected, validated, transformed, and integrated into a unified patient profile.

Its primary feature, **Patient 360**, provides authorized users with a consolidated view of available patient information across different healthcare domains.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Problem Statement](#problem-statement)
3. [Project Objectives](#project-objectives)
4. [Core Features](#core-features)
5. [Healthcare Data Sources](#healthcare-data-sources)
6. [How the System Works](#how-the-system-works)
7. [ETL Process](#etl-process)
8. [Patient 360](#patient-360)
9. [System Architecture](#system-architecture)
10. [Technology Stack](#technology-stack)
11. [Security and Privacy](#security-and-privacy)
12. [Installation and Setup](#installation-and-setup)
13. [System Workflow](#system-workflow)
14. [Limitations](#limitations)
15. [Future Enhancements](#future-enhancements)

---

## 1. Project Overview

MediSync 360 addresses the challenge of disconnected healthcare information systems.

In a traditional healthcare environment, different departments may maintain separate databases and applications. Patient demographics, laboratory results, billing transactions, and insurance information may be stored independently.

MediSync 360 provides a centralized integration platform that collects information from these different sources and presents related records through a unified interface.

The system uses ETL (Extract, Transform, Load), REST API communication, and PostgreSQL database management to demonstrate healthcare data integration.

**Main goal:** To improve data accessibility, consistency, traceability, and monitoring by integrating information from multiple healthcare sources.

## 2. Problem Statement

Healthcare organizations may experience difficulties accessing complete patient information when their departments use disconnected information systems.

Common challenges include:

- Patient information distributed across different systems.
- Repeated searching for the same patient in multiple applications.
- Inconsistent data formats.
- Duplicate patient or source records.
- Missing or invalid information.
- Difficulty tracking data imports and changes.
- Limited visibility into integration activities.

MediSync 360 addresses these challenges by providing a centralized integration layer that processes data from multiple sources and presents consolidated patient information.

## 3. Project Objectives

The project aims to:

1. Integrate information from EMR, LIS, Billing, and Insurance sources.
2. Demonstrate the ETL process for healthcare data.
3. Validate, standardize, and organize imported records.
4. Establish patient identity mappings across different sources.
5. Provide a centralized Patient 360 profile.
6. Monitor data quality and integration activities.
7. Implement authentication and role-based access control.
8. Maintain audit records for accountability and monitoring.

## 4. Core Features

| Feature | Description |
|---|---|
| Dashboard | Displays healthcare data statistics and integration activities. |
| Patient Management | Maintains centralized patient profiles and identifiers. |
| EMR Management | Handles patient demographic and encounter information. |
| Laboratory Management | Handles laboratory orders and result records. |
| Billing Management | Manages invoices, charges, and payment information. |
| Insurance Management | Organizes imported insurance and coverage records. |
| Data Integration | Supports collecting and processing data from different sources; import history is paginated at 10 batches per page. |
| ETL Processing | Extracts, transforms, validates, and loads records. |
| Data Quality | Queues unresolved mapping issues and conflicts for review; rejected-row details remain available in Import History. |
| Patient 360 | Displays consolidated information from multiple healthcare domains. |
| Audit and Reports | Tracks system activities and generates reports. |
| User Management | Manages user accounts, roles, and permissions. |

## 5. Healthcare Data Sources

MediSync 360 integrates four primary healthcare data domains.

### EMR — Electronic Medical Records

Contains patient demographic information and medical encounter or visit records.

Examples:
- Patient ID
- Patient name
- Demographic information
- Encounter records
- Visit dates

### LIS — Laboratory Information System

Contains laboratory orders and test result information.

Examples:
- Laboratory test name
- Test code
- Specimen information
- Result values
- Units
- Result status

### Billing

Contains financial information associated with healthcare services.

Examples:
- Invoice numbers
- Charges
- Invoice line items
- Payments
- Outstanding balances

### Insurance

Contains imported insurance and coverage information.

Examples:
- Insurance provider
- Member or policy reference
- Coverage dates
- Imported coverage status

## 6. How the System Works

The system follows a centralized data integration workflow.

1. Data is collected from the different healthcare sources.
2. The system extracts the available records.
3. Data is validated and transformed into standardized formats.
4. Accepted records are stored in the centralized PostgreSQL database.
5. Related records are associated with the appropriate patient identity.
6. Patient 360 retrieves and presents consolidated information.
7. Integration activities and data-quality issues can be monitored through reporting modules.

The original source systems do not necessarily need to be physically merged. MediSync 360 provides a centralized way to access and organize their integrated information.

## 7. ETL Process

ETL stands for **Extract, Transform, and Load**. It is the primary data integration process used by MediSync 360.

### Extract

Collects information from the available healthcare sources, such as CSV datasets or API responses.

### Transform

Validates and standardizes the extracted information.

Examples:
- Checking required fields.
- Validating patient identifiers.
- Standardizing supported date formats.
- Detecting duplicate records.
- Identifying invalid or conflicting information.

### Load

Stores accepted and processed records in the Neon PostgreSQL database.

This process allows information from multiple healthcare domains to become available through the centralized application.

## 8. Patient 360

Patient 360 is the main integration feature of MediSync 360.

It provides a consolidated view of a patient's available information across the four healthcare domains.

A Patient 360 profile may contain:

- Patient demographic information.
- Medical encounter records from EMR.
- Laboratory records from LIS.
- Billing invoices and payments.
- Imported insurance information.
- Source identifiers and timestamps.
- Data-quality and reconciliation information.

Instead of navigating separate source modules to gather related information, authorized users can review the available linked records through one patient profile.

**Important:** Missing records do not imply a negative medical result or lack of insurance coverage. Imported information must retain its source and context.

## 9. System Architecture

MediSync 360 uses a three-layer web application architecture.

### Frontend — Next.js

Responsible for the user interface and interaction.

Responsibilities:
- Dashboard presentation.
- Patient management interface.
- Data import forms.
- Healthcare record tables.
- Patient 360 visualization.
- Reports and administration pages.

### Backend — Express.js

Responsible for application processing and business logic.

Responsibilities:
- REST API endpoints.
- Authentication and authorization.
- Data validation.
- ETL orchestration.
- Healthcare data processing.
- Database communication.
- Audit logging.

### Database — Neon PostgreSQL

Responsible for persistent data storage.

Stores the application's supported records, including:
- Patient information.
- EMR records.
- Laboratory records.
- Billing information.
- Insurance information.
- Import history.
- Data-quality records.
- Audit events.

### Architecture Diagram

```text
             USERS
               |
               v
      +-------------------+
      |   NEXT.JS         |
      |   FRONTEND        |
      |                   |
      | Dashboard         |
      | Patient 360       |
      | Data Integration  |
      | Reports           |
      +-------------------+
               |
          REST API
               |
               v
      +-------------------+
      |   EXPRESS.JS      |
      |   BACKEND         |
      |                   |
      | Authentication   |
      | Authorization    |
      | ETL Processing   |
      | Data Validation  |
      | Business Logic   |
      +-------------------+
               |
          Database
          Queries
               |
               v
      +-------------------+
      | NEON POSTGRESQL   |
      |                   |
      | Patients          |
      | EMR               |
      | LIS               |
      | Billing           |
      | Insurance         |
      | Audit Logs        |
      +-------------------+
```

## 10. Technology Stack

| Technology | Purpose |
|---|---|
| Next.js | Frontend development |
| React.js | User interface components |
| Express.js | Backend and REST API |
| Node.js | Backend runtime |
| Neon PostgreSQL | Cloud-hosted relational database |
| ETL | Data integration and transformation |
| REST API | Communication between application components |
| CSV | Source data import, where supported |

Actual dependency versions and libraries are defined by the project's package manifests.

## 11. Security and Privacy

Because healthcare information is sensitive, MediSync 360 incorporates security considerations such as:

- User authentication.
- Role-based access control.
- Password hashing.
- Server-side authorization.
- Input validation.
- Secure database access.
- Audit logging.
- Restricted access to protected records.

### Privacy and Governance References

**Philippine Data Privacy Act of 2012 (RA 10173)**

Relevant to the protection and processing of personal information in the Philippines, including sensitive personal information.

**HIPAA**

A United States healthcare privacy and security framework.

**ISO 15189**

An international standard concerning quality and competence requirements for medical laboratories.

These are governance references, not certifications automatically achieved by implementing this application. A real-world deployment requires separate legal, organizational, technical, and operational assessments.

## 12. Installation and Setup

### Prerequisites

- Node.js
- npm, pnpm, or yarn
- Visual Studio Code or another code editor
- Neon PostgreSQL database

### Clone the Repository

```bash
git clone <repository-url>
cd <project-folder>
```

### Install Dependencies

Install the dependencies in the frontend and backend directories according to their respective package manifests.

Example:

```bash
cd frontend
npm install

cd ../backend
npm install
```

### Environment Configuration

Configure the environment variables required by the application.

Backend configuration may include:
- Neon database connection string.
- Authentication secret.
- Backend port.
- Allowed frontend origin.

Frontend configuration may include:
- Backend API base URL.

Use the actual variable names defined in the project. Never commit real credentials or expose database secrets in frontend environment variables.

### Database Setup

Run the database migrations using the migration scripts configured in the project.

If synthetic seed data is available, run it against the intended development database.

### Start the Backend

Use the development script defined in the backend `package.json`.

Example:

```bash
npm run dev
```

### Start the Frontend

Use the development script defined in the frontend `package.json`.

Example:

```bash
npm run dev
```

The actual commands and ports may vary according to the repository configuration.

## 13. System Workflow

A typical system demonstration follows this process:

1. An authorized user logs into MediSync 360.
2. The user opens the Data Integration module.
3. The user selects a healthcare source.
4. The user uploads a synthetic source dataset.
5. The system validates and previews the records.
6. The user confirms the import.
7. The backend processes and stores accepted records.
8. The user reviews the integration results.
9. The user searches for a patient through Patient 360.
10. The system displays the available linked information.
11. Authorized personnel can review data-quality issues and audit records.

## 14. Limitations

MediSync 360 is an educational healthcare data integration project.

Unless separately implemented and verified, it does not:

- Connect directly to actual hospital EMR or LIS platforms.
- Perform live insurance eligibility verification.
- Process real insurance claims.
- Connect to laboratory instruments.
- Provide medical diagnoses or treatment recommendations.
- Guarantee real-time synchronization with external healthcare systems.
- Automatically achieve HIPAA compliance or ISO 15189 certification.

Simulated integrations and CSV imports demonstrate the concepts of healthcare data integration but are not equivalent to verified production integrations.

## 15. Future Enhancements

Potential future improvements include:

- Integration with healthcare interoperability standards such as HL7 FHIR.
- Verified external EMR and LIS API connections.
- Production-grade Change Data Capture.
- Background processing for large datasets.
- Advanced patient identity reconciliation.
- Improved integration monitoring and notifications.
- Expanded security testing and privacy assessments.
- Operational backup, disaster recovery, and incident response procedures.

---

## Project Summary

MediSync 360 demonstrates how information from multiple healthcare systems can be collected, processed, integrated, and presented through a centralized web application.

By using ETL, REST APIs, PostgreSQL, data validation, and Patient 360, the system illustrates how healthcare data from EMR, LIS, Billing, and Insurance sources can be organized into a unified view.

**The primary purpose of MediSync 360 is to demonstrate healthcare data integration, improve access to consolidated information, and provide visibility into data quality and integration activities.**