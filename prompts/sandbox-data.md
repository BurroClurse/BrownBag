# Sandbox data prompts

For an AI agent that can open web links.

## Quick look

Counts 20 record types, then asks what your app does.

```text
Find out what clinical data the SMART Health IT test server really holds, so I can choose a feature for my app. Server: https://r4.smarthealthit.org (FHIR R4, no sign-in, made-up patients).

Rules: GET requests only. 50 requests at most. Read only what I list, and do not print raw records. If you can run code, write one short script that makes the requests and prints only the results. If you cannot open web addresses, say so and stop. If a request fails, write failed. Never guess a number.

Part 1. Get the total for each type below with /TYPE?_summary=count
Condition, Observation, DiagnosticReport, Procedure, Immunization, AllergyIntolerance, MedicationRequest, MedicationStatement, MedicationAdministration, Encounter, CarePlan, CareTeam, Goal, ImagingStudy, DocumentReference, QuestionnaireResponse, FamilyMemberHistory, Device, Coverage, ExplanationOfBenefit

Show type and total, most first, and list the empty types on one line. Then stop. Ask me what my app does and which types to look at, three at most.

Part 2, after I answer. For each type I choose:
- Get /TYPE?_count=5 and tell me the fields that are filled in, the code systems, and the dates. Call it a sample of 5.
- Take patient ids from those samples. Choose up to five patients in all, and get /TYPE?patient=ID&_summary=count for each patient and each type I chose.

Show one table of the types and one of the patients, with their totals for each type. Say that people can add patients to this server and they can disappear. Finish with up to three short ideas for my app that these totals support, and anything the data cannot support.
```

## Full inventory

Checks every record type. Slow, and uses many more tokens.

```text
Use the SMART Health IT test server at https://r4.smarthealthit.org (FHIR R4, no sign-in, made-up patients). Tell me what clinical data is really there, so I can choose a feature for my app. Only read (GET requests). Do not create, change or delete anything.

1. Get /metadata and list the record types it supports. Supported does not mean there is data.
2. For each type, get /TYPE?_summary=count and note the total. Pause between requests.
3. For every type with a total above 0, get /TYPE?_count=20. Say which fields are filled in, which are usually empty, the code systems used (LOINC, SNOMED CT, RxNorm, ICD-10), the date range, and which values repeat. Label this as a sample of 20.
4. For the ten types that hold the most, estimate how many different patients have them, and name five patient ids with good variety. Use patients that came with the server. Skip ones that look added by other people, such as several with the same name, because people add test patients and they can disappear.
5. If a request fails or a search is not supported, say so. Never guess or make up a number.

Give me one table, most data first: type, total, filled-in fields, usually empty fields, newest date, example patient id. Below it list the types with no data, then three app ideas the data can support and two it cannot, with the request and the total behind each one.
```
