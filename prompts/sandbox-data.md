Use the SMART Health IT test server at https://r4.smarthealthit.org (FHIR R4, no sign-in, made-up patients). Tell me what clinical data is really there, so I can choose a feature for my app. Only read (GET requests). Do not create, change or delete anything.

1. Get /metadata and list the record types it supports. Supported does not mean there is data.
2. For each type, get /TYPE?_summary=count and note the total. Pause between requests.
3. For every type with a total above 0, get /TYPE?_count=20. Say which fields are filled in, which are usually empty, the code systems used (LOINC, SNOMED CT, RxNorm, ICD-10), the date range, and which values repeat. Label this as a sample of 20.
4. For the ten types that hold the most, estimate how many different patients have them, and name five patient ids with good variety. Use patients that came with the server. Skip ones that look added by other people, such as several with the same name, because people add test patients and they can disappear.
5. If a request fails or a search is not supported, say so. Never guess or make up a number.

Give me one table, most data first: type, total, filled-in fields, usually empty fields, newest date, example patient id. Below it list the types with no data, then three app ideas the data can support and two it cannot, with the request and the total behind each one.
