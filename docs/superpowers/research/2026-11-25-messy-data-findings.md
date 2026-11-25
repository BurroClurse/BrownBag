# How real sources write medicines, allergies, names and birth dates

Looked at 2026-11-25. This builds on `tests/spellings.test.mjs` and docs/LIMITS.md #16 and #18 (capitals,
"LISINOPRIL TABLET [REMEDYREPACK INC.]", "40 mg/1", NDC with and without dashes, brand vs generic),
and doesn't repeat them.

**How it was checked.** Every "Brown Bag does" line below comes from running the app's own functions
(`personOf`, `samePerson`, `matchOf`, `plainName`, `verdictsFor`, `isWeekly`, `readDrug` through
`fromMedicationRequest`/`fromMedicationStatement`, `dedupe`, `strengthsOf`, `formOf`,
`fromAllergyRecords`, `snapshotSource`) on the example strings, from a scratch script outside the repo.
Nothing in the repo was changed. Everything quoted is public, synthetic (Synthea, CMS synthetic,
vendor sandboxes) or de-identified (FAERS). Only the strings needed to show a format are copied.

Verdict words: **joins correctly**, **stays apart safely**, **wrongly joins**, **wrongly keeps apart**,
**drops** (a real medicine or allergy disappears from the list), **misreads** (shown, but wrong).

---

## Ranked: the dangerous ones first

| # | What | Verdict | Where |
|---|------|---------|-------|
| D1 | Epic lists several RxNorm codes per medicine, an ingredient (IN) code first. Excedrin's first code is `161` (acetaminophen). Brown Bag takes the first RxNorm code, so Excedrin and a Tylenol order become one line in one source (`dedupe`, key `rx:161`) and join across sources (`matchOf` = "rxcui"). The Excedrin disappears. | **wrongly joins, drops** | `meds.js:readDrug` |
| D2 | Bupropion SR (`993518`, 12 HR, twice a day) and XL (`993541`, 24 HR, once a day): same IN, same strength, same `formOf` words. They join as one card, and no dose question is asked. Diltiazem 12 HR/24 HR capsules join the same way. | **wrongly joins** | `reconcile.js:matchOf`, `meds.js:formOf` |
| D3 | Two coded records whose names have no strength (Epic "azaTHIOprine (IMURAN) tablet", Cerner IN-level "lisinopril"): `formOf` gives `null` for both, and `null === null` counts as the same form. So dexamethasone eye drops can join dexamethasone tablets, and morphine IR can join morphine ER. | **wrongly joins** | `reconcile.js:matchOf` |
| D4 | Epic-style names put "XL" or "24 hr" before the strength ("metoprolol succinate XL (TOPROL-XL) 25 MG tablet"). `formOf` reads only the words after the strength ("tablet"), so it joins "metoprolol tartrate (LOPRESSOR) 25 MG tablet". Same IN (6918), same strength, no dose question. | **wrongly joins** | `meds.js:formOf` |
| D5 | Cerner sends IN-level RxCUIs (lisinopril `29046`) and puts the strength only in the dose. Two current lisinopril orders at different strengths, or metoprolol tartrate and succinate both coded `6918`, share one key, and `dedupe` makes one line from them. | **wrongly joins** (in one source) | `meds.js:dedupe`/`makeItem` key |
| D6 | Claims fills attach by IN only, with no form or salt check. Once NDC-to-RxCUI lookup lands (LIMITS #16), a metoprolol succinate fill will attach to a *completed* metoprolol tartrate record and move it back to current ("completedButFilled"). Dexamethasone eye drop fills will revive old oral dexamethasone. | **wrongly joins** (latent) | `claims.js:attachFills` |
| D7 | Weekly methotrexate written "15MG/WEEK", "15 MG, QWK", "10 MG, QW", "20 MG, PER WEEK", "every Monday" (FAERS) isn't seen as weekly. Beside a daily record, the verdict is "worded", not "schedule", so the card says it's only worded differently. | **misreads** (hides the weekly/daily mistake) | `reconcile.js:WEEKLY`/`isWeekly` |
| D8 | ".5 mg" is read as 5 MG, so lorazepam ".5 mg" beside "5 mg" shows no dose question; "1,000 mg" is read as "000 MG". | **misreads** (a tenfold dose looks the same) | `meds.js:STRENGTH` |
| D9 | Contained or `urn:uuid` Medication references aren't resolved. 25 of the 43 HL7 R4 medication examples, and every MedicationStatement in the official IPS example bundles, become "Unnamed medicine", which `isPlaceholderDrug` then drops as a placeholder. | **drops** | `app.js` Medication map (`"Medication/"+id` only), `snapshot.js` (no map at all) |
| D10 | An IPS file whose medicines are MedicationRequests shows none: `snapshotSource` reads only MedicationStatement. | **drops** | `snapshot.js:snapshotSource` |
| D11 | Placeholder birth date "1900-01-01" plus a common name joins two people. Jr and Sr with the same birth date join too (both suffixes are stripped). | **wrongly joins** (rare) | `reconcile.js:samePerson`/`nameKey` |
| P1 | `personOf` reads only `name[0]`. US Core's own Patient example puts `use: "old"` (Shaw) first and the current `usual` name (Baxter) second. HL7's Peter Chalmers with the nickname first gives null. | **wrongly keeps apart** | `reconcile.js:personOf` |
| P2 | Text-only "SMART, JOE" (Cerner writes this in `name.text`) gives given "SMART," and family "JOE", so the same person is kept apart. "John Smith Jr." in text gives family "Jr." (already noted in progress.md). | **wrongly keeps apart** | `reconcile.js:personOf` |
| P3 | Synthea's numbers ("Loria621" vs "Loria"), a middle name inside `given[0]` ("Roelof Olaf", "Amy V."), a compound surname vs its first part ("García López" vs "Garcia"), "van de Heuvel" vs text "Pieter van de Heuvel", ue for ü, a nickname (Bill/William). | **wrongly keeps apart** | `reconcile.js:nameKey`/`personOf` |
| P4 | Names in non-Latin scripts (Cyrillic, Chinese, Arabic) reduce to "" in `nameKey`, so the same person is never matched. | **wrongly keeps apart** (said as "someone else") | `reconcile.js:nameKey` |
| P5 | A birth date as a datetime ("1950-01-02T00:00:00Z"), partial, or absent with `_birthDate` data-absent-reason: the source is kept out as "didn't share a name and birth date". | **wrongly keeps apart** (said) | `reconcile.js:personOf` |

The "keeps apart" cases are all said to the patient (kept out with "someone-else" or "no-identity"),
so they fail safe but lose a whole source. P2 and P4 are worded wrongly: they say "for someone else"
when it is the same person.

---

## 1. Medicine names and codes

**Case, dots, tall-man letters and brand in parentheses.**
- FAERS, 400 metoprolol reports (https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:metoprolol&limit=100, skip 0 to 300): 34 spellings. `"METOPROLOL"` 274, `"METOPROLOL TARTRATE"` 41, `"METOPROLOL SUCCINATE"` 22, `"METOPROLOL TARTRATE."` 20, `"METOPROLOL."` 13, `"TOPROL XL"` 7, `"METOPROLOL                         /00376902/"` 3, `"METOPROLOL (METOPROLOL)"`, `"LOPRESSOR (METOPROLOL TARTRATE)"`, `"METOPROLOL TARTRATE (LOPRESSOR)"`, `"SELOKEN//METOPROLOL SUCCINATE"`, `"METOPROLOL SUCCIANTE ER"`, `"METOPROLOL TABLET   50MG"`, `"METOPROLOL TARTRATE 50MG 50MG CARACO"`, `"GENERIC METOPROLOL"`. Levothyroxine: `"SYNTHROID (LEVOTHYROXINE SODIUM) LEVOTHYROXINE SODIUM)"`, `"LEVOTHROXINE (LEVOTHYROXINE)"`, `"L-THYROXINE//LEVOTHYROXINE"`. Very common: about a third of FAERS rows aren't the plain name.
  - Brown Bag: "METOPROLOL." vs "METOPROLOL" → `matchOf` null (the dot counts): **wrongly keeps apart**, but both show. "METOPROLOL" vs "Metoprolol" → "name": **joins**. That is wrong when one is tartrate and one is succinate, and FAERS says most people write neither (see D-list and fixture 9).
- Epic: `"azaTHIOprine (IMURAN) tablet"`, `"metFORMIN (GLUCOPHAGE) 500 MG tablet"`-style (repo `tests/fixtures/4970751-requests.json`, `medicationReference.display`), and `"aspirin-acetaminophen-caffeine (EXCEDRIN MIGRAINE) 250-250-65 MG per tablet"` (https://fhir.epic.com/Documentation?docId=testpatients, IPS sample). `plainName` strips only `[...]`, not `(...)`, so "azaTHIOprine (IMURAN) tablet" vs "azathioprine tablet [Imuran]" → "name-only": **stays apart safely**, with a note.
- SMART sandbox misspelling: `"Simvistatin 10 MG"` (code 316672, `tests/fixtures/e7de504a-...-requests.json`). Joins by code; without the code it would stay apart.
- Cerner: `text: "hepatitis B adult vaccine (hepatitis B adult vaccine dialysis 40 mcg/mL intramuscular suspension)"` beside RxNorm display `"Hepatitis B Surface Antigen Vaccine 0.04 MG/ML Injectable Suspension"` (https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-medicationrequest-id-get.html). Brown Bag uses the text. The strengths compare as equal (40 mcg/mL is 0.04 mg/ml), which is right.

**Abbreviations and truncation (claims and pharmacy names).**
- Medicaid drug products (data.gov → https://download.medicaid.gov/data/drugproducts-q2-2026.csv): `"BPL METOPROLOL SUCC ER TAB 100MG 100"`, `"METOPROLOL TARTRATE TABLETS 25 MG X 1000"`, `"BUDEPRION SR (BUPROPION HCL EXTENDED-RELEASE TABLETS), 150 MG"`, `"HYDROCODONE/APAP 10/325 MG TAB 100"`, `"SYNTHROID 137MCG TAB - LEVOTHYROXINE SODIUM"`. The pack size sits right after the strength.
- CMS Part D Spending by Drug (https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data): generic names cut at 30 characters (`"Bictegrav/Emtricit/Tenofov Ala"`, `"Amlodipine/Valsartan/HCThiazid"`, `"Insulin Glargine,Hum.Rec.Anlog"`). The release type is only in the brand column: `("Bupropion HCl SR","Bupropion HCl")`, `("Bupropion XL","Bupropion HCl")`.
  - Brown Bag: these never reach `matchOf` as names unless claims supply them. `formOf("potassium chloride 20 mEq ER tablet")` gives "er tablet", and "sertraline 50 mg tab" gives "tab", so "TAB" vs "Oral Tablet" never count as one form: **stays apart safely**.

**Salt forms.** RxNorm gives metoprolol tartrate and succinate one IN (`6918`) but separate PINs (`221124` succinate), and bupropion SR and XL one IN (`42347`) and one PIN (`203204`) (https://rxnav.nlm.nih.gov/REST/rxcui/993518/related.json?tty=IN+PIN). `ingredientsFor` asks only for `tty=IN`, so salt and release type are lost at the ingredient level. See D2, D4, D6.

**Combination separators.** FAERS: `"CALCIUM CARBONATE/CHOLECALCIFEROL"`, `"CALCIUM CARBONATE\\CHOLECALCIFEROL"`, `"CALCIUM CARBONATE W/CHOLECALCIFEROL/SODIUM"`, `"CALTRATE (CALCIUM CARBONATE (+) CHOLECALCIFEROL)"`, `"CALCIUM CARB-CHOLECALCIFEROL"`, `"CALCIUM CARBONATE,CHOLECALCIFEROL"`, `"HYDROCHLOROTHIAZIDE/METOPROLOL"`. NDC directory: `"Metoprolol Tartrate and Hydrochlorothiazide"` (https://api.fda.gov/drug/ndc.json?search=generic_name:metoprolol&limit=100). Epic: `"aspirin-acetaminophen-caffeine ... 250-250-65 MG"`. Drug reviews (Kaggle/UCI drugs.com, mirror https://huggingface.co/datasets/Mouwiya/drug-reviews): `"Ethinyl estradiol / norgestimate"`, `"Junel 1.5 / 30"`.
- Brown Bag: `strengthsOf("...250-250-65 MG per tablet")` = `["65 MG"]` and `strengthsOf("HYDROCODONE-ACETAMINOPHEN 5-325 MG TABLET")` = `["325 MG"]`. Beside RxNorm's three strengths, the counts differ, so a dose question is asked: a **false alarm** (safe). A text-only combination vs its single ingredient matches by first word only ("name-only" note): **stays apart safely**.

**NDC formats.** NDC directory, 100 metoprolol products: product NDC shapes `4-4` (4), `5-4` (49), `5-3` (47); package NDCs `0378-0032-11` (4-4-2), `70518-4533-0` (5-4-1), `80353-451-01` (5-3-2). CARIN example: `"code" : "0777-3105-02"` with dashes (https://hl7.org/fhir/us/carin-bb/STU2/ExplanationOfBenefit-EOBPharmacy1.json.html). Blue Button v1 sandbox: `"code": "16729000517"` (11 digits, no dashes) (https://gist.github.com/aviars/b6f1e74d5e0f699e05b53355a462cc3c). MIMIC-on-FHIR in the sandbox: `"10135011101"` beside `mimic-medication-gsn` `"003009"` (`tests/fixtures/e5408569-...-statements.json`). RxNav takes both `0378-0032-11` and `00378003211` (https://rxnav.nlm.nih.gov/REST/ndcstatus.json?ndc=0378-0032-11). Comparing NDCs as strings never joins them (already LIMITS #16).

**Repackagers and obsolete NDCs.** `71335-0158` Bryant Ranch, "25 mg/1", lists `openfda.rxcui` `["866427","866436"]` (25 and 50 mg). Mylan `0378-0032` (a bulk 55172-tablet container) has no rxcui. RxNav: `00378003211` is OBSOLETE but maps to `866514`. `45802064287` is OBSOLETE, mapped to `308416` ("aspirin 81 MG Delayed Release Oral Tablet") in 2009–2010 and to `243670` (plain) from 2010. `49999099410` Lantus maps to `311041` (SCD) then `285018` (SBD). The same NDC means a different RxCUI depending on the date, which is why the LIMITS #16 idea of looking up by date matters.

**RxNorm term types for the same drug** (https://rxnav.nlm.nih.gov/REST/rxcui/866412/allrelated.json): IN `6918` metoprolol, PIN `221124`, SCDC `1370483` "metoprolol succinate 100 MG", SCDF `378660`, SCD `866412`, SBD `866414` "[Toprol]", SBDF, BN `865575` "Toprol", SCDG `1163523` "metoprolol Oral Product". Seen in real data: SCDC `316672`/`315971` ("Lasix 40mg") and MIN `235389` "Mestranol / Norethynodrel [Enovid]" in the SMART sandbox fixture, an obsolete BPCK `749882` "Norinyl 1+50 28 Day Pack" (also there), SBDG `1187314` "Tylenol PM Pill" (https://hl7.org/fhir/us/core/MedicationRequest-self-tylenol.json), and Cerner IN `29046` "Lisinopril" with text "lisinopril" while the order is a 5 mg tablet (https://groups.google.com/g/cerner-fhir-developers/c/d3oD8YtbPME: "The system does not attempt to look at the dosage to choose a more specific coding").
- Brown Bag: SCD vs SBD of the same drug → different rxcui. After the brackets are stripped the names match ("name"): **joins correctly**. SCDC vs SCD → names differ, ingredients match, forms `null` vs "oral tablet" → "form": **stays apart** with "Possible duplicate". IN vs IN for different products → "rxcui": **wrongly joins** (D5).

**Obsolete and remapped RxCUIs** (https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRxcuiHistoryStatus.html). `105048` "Amantadine 100 MG Oral Capsule [Symmetrel]" is Remapped to `849389` (active SCD) and `849394`. `861765` (Avandamet) is Obsolete. `1360201` "albuterol 0.09 MG/ACTUAT Metered Dose Inhaler" is Quantified (→ `745679` 200 ACTUAT, `745682` 80 ACTUAT). `related.json?tty=IN` on `105048` returns an empty IN group, so `ingredientsFor` gives it no ingredient. Brown Bag: an old record with `105048` vs a new one with `849389` → "name-only" note: **wrongly keeps apart**, but both show.

**Local or proprietary codes beside or instead of RxNorm.** Cerner: `"system": "https://fhir.cerner.com/ec2458f2-.../synonym"`, `userSelected: true` on the local code. Epic Medication.code (Excedrin): ATC `N02BE51`, `urn:oid:2.16.840.1.113883.6.253` (MDDB), `urn:oid:2.16.840.1.113883.6.68` (Medi-Span GPI `64990003200350`), `urn:oid:2.16.840.1.113883.6.162` (Multum), then six RxNorm codes in the order IN 161, IN 1191, IN 1886, SBD 209468, SCD 308297, MIN 466584. Epic route: SNOMED plus `urn:oid:1.2.840.114350.1.13.0.1.7.4.798268.7025` code `"15"`. MIMIC: `mimic-medication-etc` `"00000414"` "Laxative - Surfactant" (a drug *class* as the display). SNOMED-only products in HL7 examples: `"Azithromycin 250mg capsule (product)"` (`medicationrequest0313.json`).
- Brown Bag: `shareable` keeps only RxNorm and NDC, so these drop out of the QR code (by design). When RxNorm is absent, the name falls to `codings[0].display`, which can be a class ("Laxative - Surfactant") if there's no text.

**Text-only and placeholders.** HL7 `medicationstatementexample3.json`: `{"text":"Little Pink Pill for water retention"}`. Brown Bag shows it (right). Placeholder check: `"Medication"` and `"UNKNOWN"` are dropped, but `"Unknown medication"`, `"Med"`, `"Rx"`, `"None"`, `"No current medications"`, `"Home medication"`, `"Patient's own medication"` show as medicines. FAERS writes "unknown" as `"METOPROLOL (UNKNOWN)"`, `"METHOTREXATE (MANUFACTURER UNKNOWN) (METHOTREXATE) (METHOTREXATE)"`, `"INSULIN NOS"`.

---

## 2. Doses, strengths and sigs

**Units as people write them** (FAERS `drugdosagetext`, levothyroxine and cholecalciferol pulls): `"150 ?G, QD"` (µ lost in encoding), `"50 MUG, QD"`, `"150 UG"`, `"100 MICROGRAM"`, `"112 MCG, QD"`, `"0.88 MG"` (meant 88 mcg; really 0.088 mg), `"0.1 MG, DAILY"`, `"DOSE= 30 IE DAILY"` (German IE), `"4000 UT, QD"`, `"10 U, DAILY"`, `"1000 IU, QD"`, `"400 IU (INTERNATIONAL UNIT)"`, `"1000 MG, QD"` (vitamin D with the wrong unit), `"100 IU/ML"`. NDC strengths: `"100 [iU]/mL"`, `"100 U/mL"`, `"1000 [iU]/1"`, `"150 ug/1"`, `"5 mg/5mL"`, `"12 [hp_X]/mL"`. HL7 examples: `"Levothyroxine Sodium 75micrograms tablet (product)"`, `"Fentanyl 25micrograms/hour patch (product)"`, `"Lantus 100 unit/ml injectable solution"`, `"Novolog 100u/ml"`, `"Nystatin 100,000 u/ml oral suspension"`, `"Potassium Chloride 20mEq in 1L Normal Saline"`, `"Dopamine 400mg in 500mL D5W"`, `"Proventil HFA 90mcg/actuat metered dose inhaler, 200 actuat"`. Synthea: `"72 HR Fentanyl 0.025 MG/HR Transdermal System"`, `"60 ACTUAT Fluticasone propionate 0.25 MG/ACTUAT / salmeterol 0.05 MG/ACTUAT Dry Powder Inhaler"`.
- Brown Bag `strengthsOf`: reads MG, MCG, G, UNT, MEQ, ML and %, with /ML, /HR and /ACTUAT. It reads **nothing** from "ug", "µg", "?G", "micrograms", "IU", "units", "unit/ml", "u/ml". Names with those have no strength, so `strengthsDiffer` is false and two different strengths aren't questioned unless doses are coded: **stays apart, no dose question** (a miss, not a join). ".5 mg" → `["5 MG"]` and "1,000 mg" → `["000 MG"]`: **misreads** (D8). "enoxaparin 40 mg/0.4 mL" → `["40 MG","0.4 ML"]` (two strengths). "albuterol HFA 90 mcg/actuation" → form "ion inhaler" (the regex stops inside "actuation"). "Dopamine 400mg in 500mL D5W" → two strengths, form "d5w".
- `massOf` knows g, mg and mcg only. A coded dose `{value: 88, unit: "ug"}` against a 0.088 MG tablet is read as 88 tablets (7.744 mg), so a dose question is asked: a **false alarm** (safe).
- Epic dose unit mismatch: `"text": "Take 100 mg by mouth 1 (one) time each day., Historical Med"` with `doseQuantity {"value": 100.0, "unit": "mg/kg"}` (`tests/fixtures/4970751-requests.json`, azathioprine). Brown Bag shows dose **"100 mg/kg"** beside the text: **misreads** (the shown dose is 70 times too high for an adult).

**Sig abbreviations** (FAERS): `"25 MG, BID"`, `"25 MG, 2X/DAY"`, `"100 MG, 1X/DAY"`, `"50 [MG/D ]"`, `"12.5 BID"`, `"200 QD"`, `"25 MG, QOD"`, `"1000 IU, QAM"`, `"5000 IU, BIW"`, `"T Q DAY"`, `"1 TAB TWICE A DAY"`, `"UNK"`, `"UNK UKN, UNK"`, `"UNK UNK, UNKNOWN FREQ."`, `"DF"`, `"2.5 MG TAKE 8 PILLS AS DIRECTED"`. Epic: `"1 tablet, Oral, EVERY 6 HOURS PRN Starting Tue 9/17/2024, Disp-30 tablet, R-0, Normal"` with `timing.code.text "Q6H PRN"` and `patientInstruction "For headaches, take 1 pill by mouth every 6 hours as needed."`. Epic fixture: `"Take 1 Cap by mouth 2 times daily., Starting 10/5/2013, Until Sun 10/5/14, Print"`, timing code text `"0711, 1800"` and `"0900"`, `repeat.count: 1`. Cerner: `"text": "40 mcg = 1 mL, IM, Once"`, `"patientInstruction": "1 Milliliters Intramuscular (in a muscle) once. Refills: 0."`, timing code `"Once"` in local codeSet 4003. HL7: `"0.25mg PO every 6-12 hours as needed for menses from Jan 15-20, 2015.  Do not exceed more than 4mg per day"`, `"500mg IV q6h x 3 days"`, `"Take 1-2 tablets once daily at bedtime as needed for restless legs"`, `"1000 mg/m2 orally twice daily from days 1-14 of cycle"`.
- Brown Bag: text wins and is shown as written. `CODE_WORDS` has no Q12H, Q8H, QHS, QAM, Q6H PRN or "Once", so a coded `timing.code` with only those and no repeat shows the display text. `words()` compares "BID" and "twice a day" as different, so two text-only records give a "worded" verdict: a **false alarm** (safe).

**Tapers, sliding scales, weekly and monthly.** Tapers: HL7 `medicationrequest0303.json` ("Take 4 tablets daily for 7 days starting January 16, 2015" / 2 / 1) and `0302` (prednisone "Two tablets at once" then "One tablet daily for 4 days"). Brown Bag numbers them "Direction 1: ...". Sliding scale: FAERS `"INSULIN ASPART SLIDING SCALE"`, `"SLIDING SCALE, SUBCUTANEOUS"`; HL7 `0321` "Novolog 100u/ml" with three directions. Weekly: FAERS methotrexate `"15MG/WEEK"`, `"15 MG, QWK"`, `"10 MG, QW"`, `"20 MG, PER WEEK"`, `"5 MG, 1/WEEK"`, `"0.8ML(20MG) IM WKLY?ONCE AS 2/20/14"`, `"2.5MG, 6 TABLETS ONCE WEEKLY"`, `"2.5 MG, 5 X PER WEEK"`. Monthly: `"50,000 IU 1/MO ORAL"`, `"1 DF, 50000 IU, MONTHLY"`. HL7 `0334`: "Apply to affected areas four times daily on Monday of each week".
- Brown Bag `isWeekly` on these: true only for "WEEKLY", "once a week", "Once weekly", "MONTHLY", "weekly on Sunday". False for "15MG/WEEK", "QWK", "QW", "PER WEEK", "1/WEEK", "1 time per week", "every Monday", "every 7 days", "Q7D", "q week", "1/MO", "every 28 days", "on Monday of each week". Checked: "Take 6 tablets by mouth every Monday" vs coded daily → `["worded"]`, and "15MG/WEEK" vs "Take 6 tablets once a day" → `["worded"]` (D7). Coded `{frequency: 3, period: 1, periodUnit: "wk"}` (HL7 `0327` fentanyl "three times per week") counts as weekly. That isn't "weekly or longer", but rates still compare, so it's harmless.

**Coded `Timing` / `doseAndRate` vs free text.** Synthea: `{"timing":{"repeat":{"frequency":1,"period":1.0,"periodUnit":"d"}},"doseAndRate":[{"type":{"coding":[{"code":"ordered",...}]},"doseQuantity":{"value":1.0}}]}`. The quantity has no unit, and "1" means one tablet. IPS Bundle-01: `"timing": {"repeat": {"count": 1, "periodUnit": "d"}}` (a periodUnit with no period, and `count`). Brown Bag says "See the record for how often" (right). Epic's `"type": {"coding": [{"system": "http://epic.com/CodeSystem/dose-rate-type", "code": "ordered"}]}` is read by code (right).

**Quantity and days supply on claims.** CARIN: `supportingInfo` `"code" : "dayssupply"`, `"valueQuantity" : {"value" : 30}`, `refillnum` 0, `brandgenericindicator` `"2"`, `dawcode` `"7"`, and product display `"Prozac, 100 CAPSULE in 1 BOTTLE (0777-3105-02) (package)"`. The same EOB has `billablePeriod.start "2019-10-30"` but `servicedDate "2019-07-02"`, four months apart. Blue Button v1: extensions `.../variables/fill_num` (34) and `.../variables/days_suply_num` (90), quantity `90.0`. CMS synthetic PDE (Synthea-made) fixes `CMPND_CD 0`, `DRUG_CVRG_STUS_CD C`, `BRND_GNRC_CD B, G`, `RX_ORGN_CD 0, 3, 4` (https://data.cms.gov/sites/default/files/2023-05/d51e1218-68c3-4c7c-9598-0b81f22fe903/User%20Guide%20-%20CMS%20Synthetic%20RIF%20Files%20May%202023_AM508_v2.pdf, Table 6-5).
- Brown Bag `fillsFromClaims`: the name is `product.text || rxnorm display || codings[0].display`. For CARIN that is the whole package sentence, and `plainName` keeps "(0777-3105-02) (package)", so two fills of one NDC from different packages never group by name: **wrongly keeps apart** (safe, but two cards). The date uses `servicedDate` first (right). No days supply is read yet (constraints mention "Fill suggests about <n> a day", still to come).

---

## 3. Status and dates

**Statuses seen.** Synthea MedicationRequest: `completed` 6119, `active` 349, all `intent: "order"`. SMART sandbox fixtures: requests `completed` 37, `active` 18, `stopped` 16; statements `unknown` 12 (MIMIC). Epic: `"on-hold"` for an as-needed Excedrin; `"status": "active", "intent": "plan", "reportedBoolean": true` with `"Historical Med"`. Cerner: `active` with category `inpatient` and a pharmacy-verification extension. HL7: `on-hold` (0325, 0326, 0329, 0334, 0335), statement `entered-in-error` (example5). CARIN EOB `"status" : "active"`.
- Brown Bag: on-hold counts as current (Excedrin PRN on hold stays on the list, right per spec). Cerner inpatient → hospital order → older (right). MedicationRequest `draft` and `unknown` → "unknown". `intent: "plan"` isn't looked at, so an Epic "Historical Med" counts as a current prescription (fine for a list).

**Dates with time zones.** Synthea `"authoredOn": "2018-04-05T10:08:20+00:00"`, Cerner `"2020-07-06T15:37:13.000-05:00"`, Epic fixture `"2012-06-20T07:00:11Z"`, HL7 birth time `"1974-12-25T14:35:45-05:00"`. Brown Bag reads the date as written (`day()`, `monthYear`), so the zone never moves it (right). `claims.js:recent` uses `Date.parse` on day-only strings (UTC), which is off by under a day (harmless).

**Partial dates.** IPS `"effectivePeriod": {"start": "2015-03"}`, HL7 maiden name `"period":{"end":"2002"}`, US Core old name `"period": {"start": "2016-12-06", "end": "2020-07-22"}`. Brown Bag handles partial record dates (`before()` won't call "2026" before "2026-05-01"). Placeholder record dates ("1900-01-01") weren't seen in any source looked at. If one came in, it would count as oldest (right).

---

## 4. Allergies

**Free text and sentences.** HL7 `allergyintolerance-fishallergy.json`: text `"Allergic to fresh fish. Tolerates canned fish"` over SNOMED `227037002`. US Core: text `"sulfonamide antibacterial"` over SNOMED `763875007` "Product containing sulfonamide (product)". C-CDA free text (https://github.com/HL7/C-CDA-Examples/tree/master/Allergies/Free-text%20Allergy%20to%20clinical%20trial%20drug): `<code nullFlavor="OTH" codeSystem="2.16.840.1.113883.6.88" codeSystemName="RxNorm">` with `<originalText><reference value="#allergy1allergen"/>`, a `translation code="C95733" displayName="talazoparib"` (NCI), and narrative `<td ID="allergy1allergen">talazoparib</td>`.
- Brown Bag: shows the text as the name (right). Two sources with "Fish - dietary" vs the sentence stay as two cards: **stays apart safely**.

**Code systems.** SNOMED substances (Synthea: `"Mold (organism)"` 84489001, `"Shellfish (substance)"` 735029006, `"Bee venom (substance)"` 288328004). RxNorm ingredients (Synthea: `"Lisinopril"` 29046, `"Penicillin V"` 7984, `"Sulfamethoxazole / Trimethoprim"` 10831, a MIN for a "sulfa" allergy). HL7: RxNorm `7980` "Penicillin G", unconfirmed. Epic: `"NICKEL"` with RxNorm `31738`, `1311629`, `1546280` and several UNII codes `urn:oid:2.16.840.1.113883.4.9` without display, and the reaction `"(URTICARIA NOS) OR (HIVES)"` with text `"Hives"`. IPS: SNOMED `764146007` "Substance with penicillin structure" plus ATC `J01CA` "Penicillins with extended spectrum".
- Brown Bag: one source's "Penicillin", "Penicillins", "PCN", "penicillin - rash" and "Substance with penicillin structure" make **five** cards (same-name only), so they **stay apart safely** but are noisy. Epic's first code is the key, and `sameAllergy` matches by name, so "NICKEL" vs "Nickel" joins (right).

**Drug class allergies.** "Sulfa" (Synthea codes it as the sulfamethoxazole/trimethoprim MIN), US Core "sulfonamide antibacterial", IPS "Substance with penicillin structure", C-CDA "Allergy to specific drug class Penicillins". Brown Bag shows them as written. No class reasoning (fine; warnings are left to the care team, LIMITS #11).

**Reaction in the allergen text.** Not seen in the vendor examples looked at. FAERS-style typed text and patient-held lists do it ("penicillin - rash"). Brown Bag makes it its own allergy "penicillin - rash", apart from "Penicillin": **stays apart safely**, as a duplicate.

**Every way "none" was written, and what Brown Bag does:**

| Written as | Source | Brown Bag |
|---|---|---|
| SNOMED `716186003` "No Known Allergy (situation)", text `"NKA"` | https://hl7.org/fhir/R4/allergyintolerance-nka.json | statement (right) |
| SNOMED `409137002` "No Known Drug Allergy (situation)", text `"NKDA"` | R4 `allergyintolerance-nkda.json` | statement (right) |
| SNOMED `429625007` "No known food allergy (situation)" | IPS Bundle-01 | statement (right) |
| SNOMED `716184000` "No Known Latex Allergy (situation)" | R4 `allergyintolerance-nkla.json` | **shown as an allergy "No Known Latex Allergy"** |
| IPS `no-known-allergies` "No known allergies" | https://hl7.org/fhir/uv/ips/CodeSystem-absent-unknown-uv-ips.json | statement (by text) |
| IPS `no-allergy-info` "No information about allergies" | same | **shown as an allergy** (see §7) |
| text `"NKA"` / `"NKDA"` / `"No Known Allergies."` / `"Patient has no known allergies"`, no code | typed and converted | **shown as an allergy named NKA etc.** |
| text `"No Known Drug Allergies"`, `"No Known Medication Allergies"` | typed | statement (right) |
| `v3-NullFlavor` `NI` "NoInformation" | C-CDA converters | **shown as an allergy "NoInformation"** |
| `data-absent-reason` `unknown` "Unknown" | converters | **shown as an allergy "Unknown"** |
| C-CDA `negationInd="true"`, value `419199007` "Allergy to substance (disorder)", playingEntity `<code nullFlavor="NA"/>` | https://github.com/HL7/C-CDA-Examples/tree/master/Allergies/No%20Known%20Allergies | a converter that drops `negationInd` makes "Allergy to substance": **shown as an allergy** |
| C-CDA-on-FHIR map `716186003` ↔ `419199007`, `409137002` ↔ `416098002`, `428607008` unmatched | https://hl7.org/fhir/us/ccda/ConceptMap-FC-NoKnownAllergies.json | as above |

None of these hide a real allergy. They show a false one, or no "none" statement. Oracle's notes say
NKA (716186003) is accepted only when the patient has no other active allergies. Other sources don't
promise that.

**Entered-in-error and refuted.** Refuted Penicillin G is left out (right). `clinicalStatus` given only as
text (`{"text": "Inactive"}`) is read as active, so the allergy still shows (safe). A C-CDA "Not Allergic
to Peanuts" (negated) that a converter flattens shows as a peanut allergy (safe direction).

---

## 5. Names

| Pattern | Real example (source) | Brown Bag |
|---|---|---|
| Several given names | Synthea `"given": ["Carey440", "Romaine793"]`; HL7 `["Peter","James"]` | uses given[0]; joins with "Peter" (right) |
| Middle name inside given[0] | HL7 f201 `"given": ["Roelof Olaf"]`; US Core `["Amy","V."]` | "Roelof Olaf" vs "Roelof": **wrongly keeps apart** |
| Particles | HL7 f001 `"family": "van de Heuvel"` | vs text "Pieter van de Heuvel" (family "Heuvel"): **wrongly keeps apart**; "de la Cruz" vs "Delacruz": joins |
| Hyphenated and compound | (constructed) "Smith-Jones"/"Smith Jones" | joins; vs "Smith": apart; "García López" vs "Garcia": **wrongly keeps apart** |
| Apostrophes | Synthea `"family": "O'Connell601"` | O'Brien / OBRIEN / O’Brien all join (right) |
| Accents, other scripts | HL7 `"text":"张无忌"` | accents fold (right); Chinese text only → null; Cyrillic → `nameKey` "" → never same: **wrongly keeps apart** |
| ALL CAPS | Oracle `"family": "SMART", "given": ["JOE"]`; HL7 `"BROOKS"`/`"ALBERT"` | joins (right) |
| Suffix | HL7 f001 `"suffix":["MSc"]`; US Core `"suffix": ["PharmD"]`; Epic display `"Realistic, Jayden FHIR Jr."`; Synthea suffix `"JD"` | in `suffix` ignored (right); in family "Smith Jr." stripped (right); in text: family "Jr." (**apart**, known) |
| Prefix | Synthea `"prefix": ["Mrs."]` (57 Mr., 42 Mrs., 16 Ms. of 112); HL7 `"prefix":["Drs."]`; requester `"Dr. Clifton91 Lakin515"` | prefix field ignored (right); "Dr. John" in given: **apart** |
| Nickname, preferred vs legal | HL7 `{"use":"usual","given":["Jim"]}`; HL7 f201 official name with `"text":"Roel"`; Epic official + usual both "Jayden Jackson" | nickname first → null; text "Roel" isn't used while parts exist (right) |
| Old or maiden name | US Core `[{"use":"old","family":"Shaw"...},{"use":"usual","family":"Baxter"...}]`; Oracle `"use": "old"`, `"SMART, STEPHEN ALLEN"`; Synthea `"use": "maiden"` (21 of 112) | **name[0] only**: US Core's order compares the old name (P1) |
| name.text only | Oracle `"text": "SMART, JOE"`; Brown Bag's own IPS/QR export writes `{ text }` only (`ips.js:readPatient`, `formatName`) | "LAST, FIRST" is swapped: **wrongly keeps apart** (P2); "First Last" works |
| Synthea numbers | `"family": "McGlynn426"`, `"given": ["Carey440", ...]`, file names `Sharyl439_Nell215_Williamson769_...` | kept as digits: vs plain names, **wrongly keeps apart** |
| Malformed | `"given": "Ann"` (string, not array) | given becomes "A": **wrongly keeps apart**, no crash |

Synthea's FHIR (https://synthetichealth.github.io/synthea-sample-data/downloads/latest/synthea_sample_data_fhir_latest.zip,
112 patients): every patient has `use: "official"` first, a full `birthDate`, and a
`patient-mothersMaidenName` extension. Married women get a second `"use": "maiden"` name.

---

## 6. Birth dates

- **Full date:** all 112 Synthea patients (`"birthDate": "1987-01-08"` style), Oracle `"1976-04-29"`, Epic `"1991-08-23"`.
- **Birth time beside the date:** HL7 `"_birthDate":{"extension":[{"url":"http://hl7.org/fhir/StructureDefinition/patient-birthTime","valueDateTime":"1974-12-25T14:35:45-05:00"}]}`. Brown Bag ignores it (right).
- **A record that disagrees with itself, day and month swapped:** HL7 `patient-example-newborn.json` has `"birthDate": "2017-09-05"` but birthTime `"2017-05-09T17:11:00+01:00"`. This is in the FHIR spec itself, so it happens in real feeds. Two sources disagreeing this way → `samePerson` false → "for someone else": **wrongly keeps apart** (said).
- **Twins:** HL7 `infant-twin-1`/`-2`: same family, same `birthDate` "2017-05-15", given "Jaina" vs "Jacen" → apart (right). Twins with the same first initial and a source that sends only initials would still stay apart (right).
- **Missing:** HL7 examples `a`, `b`, `ihe-pcd`, `dicom` have no birthDate; the newborn has no name. Medicare lets the patient withhold name and birth date (https://bluebutton.cms.gov/api-documentation/: enrollees "may always opt to omit personal data such as name, date of birth"). Brown Bag: "no-identity", kept out (right, said).
- **data-absent-reason:** `"_birthDate": {"extension": [{"url": ".../data-absent-reason", "valueCode": "unknown"}]}` (constructed in the spec's shape; not seen in a vendor example) → null → kept out (right).
- **Datetime or partial:** "1950-01-02T00:00:00Z" or "1950-01" → null → kept out. A converter that turns a C-CDA `birthTime value="19500102000000-0500"` into UTC and then cuts it gives "1950-01-02" or "1950-01-01", and the shifted one doesn't match: **wrongly keeps apart** (said). Not seen in a published example. It's a known converter risk, so it gets a fixture.
- **Placeholder "1900-01-01":** not seen in any source looked at. If both sources had it with a common name, `samePerson` → true (D11).

---

## 7. IPS "no information" entries (coordinator's request)

Exact codes and displays, from https://hl7.org/fhir/uv/ips/CodeSystem-absent-unknown-uv-ips.json
(system `http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips`):

| code | display |
|---|---|
| `no-allergy-info` | No information about allergies |
| `no-known-allergies` | No known allergies |
| `no-medication-info` | No information about medications |
| `no-known-medications` | No known medications |
| `no-immunization-info`, `no-known-immunizations`, `no-problem-info`, `no-known-problems`, `no-procedure-info`, `no-known-procedures`, `no-device-info`, `no-known-devices` | (not used by Brown Bag) |

In IPS they go in `AllergyIntolerance.code` and `MedicationStatement.medicationCodeableConcept`
(IPS also allows `Composition.section.emptyReason`, as in `Bundle-bundle-no-info-required-sections.json`,
which has no allergy or medicine resources at all).

Brown Bag, checked:
- MedicationStatement `no-medication-info` → a **current medicine card "No information about medications"**. `isPlaceholderDrug` is false (only the exact words in `PLACEHOLDER` count). **Misreads.**
- MedicationStatement `no-known-medications` → a **current medicine card "No known medications"**. **Misreads**, and it would go in the QR code and the IPS file as a medicine.
- AllergyIntolerance `no-known-allergies` → statement "No known allergy" (right, but only because the display text matches `/^no known allerg(y|ies)$/`; the code isn't known).
- AllergyIntolerance `no-allergy-info` → an **allergy card "No information about allergies"**. **Misreads**, and it isn't treated as "not known", so the box can't say "none known" correctly either.
- An IPS with "no information" beside real entries: the placeholder shows as one more line.

---

## Fixtures to build

Each: input → expected behavior. "Today" says what the code does now, where it differs.

1. **Epic multi-code Excedrin and Tylenol, one source.** Medication A codes `[161, 1191, 1886, 209468, 308297, 466584]`, text "aspirin-acetaminophen-caffeine (EXCEDRIN MIGRAINE) 250-250-65 MG per tablet". Medication B codes `[161, 198440]`, text "acetaminophen (TYLENOL) 500 MG tablet". → two lines. Today: one line, "x2".
2. **Same Excedrin across two sources** (Epic vs pharmacy SCD `308297`) → one card, by its SCD/SBD code, never by IN `161`.
3. **Pick the most specific code:** codings `[IN 6918, SCD 866412]` → rxcui `866412`; `[SBD 866414, SCD 866412]` → either joins with SCD 866412 elsewhere.
4. **Bupropion SR vs XL:** `993518` "12 HR bupropion hydrochloride 150 MG Extended Release Oral Tablet" vs `993541` "24 HR ... " in two sources → apart, with a "Possible duplicate" note. Today: "ingredients" join.
5. **Diltiazem 12 HR vs 24 HR capsule** (`830872` vs `830861`) → apart with a note.
6. **Null forms:** coded "dexamethasone ophthalmic" vs coded "dexamethasone oral", IN-mapped alike, no strengths → apart. Today: "ingredients".
7. **Epic-style ER before the strength:** "metoprolol tartrate (LOPRESSOR) 25 MG tablet" vs "metoprolol succinate XL (TOPROL-XL) 25 MG tablet", both IN 6918 → apart. Today: joined, no dose question.
8. **Cerner IN-level codes, one source:** two active orders coded `29046` "Lisinopril", doses 5 mg and 40 mg → two lines, or one card that says both are active. Today: `dedupe` makes one line.
9. **Text-only "METOPROLOL" vs "Metoprolol"** from two sources → joined with a "same words" match is acceptable, but a "METOPROLOL TARTRATE" vs "METOPROLOL SUCCINATE" pair must stay apart (it does: pin it).
10. **FAERS trailing dot:** "METOPROLOL." vs "METOPROLOL" → should be name-only or name. Today: null (no note).
11. **Claims fill by ingredient across salt/form:** completed record `866924` metoprolol tartrate; fill rxcui `866412` (succinate ER) recent → the record stays older; the fill gets its own card. Today: revived as current.
12. **Claims fill eye drop vs tablet:** completed oral dexamethasone; recent fill of dexamethasone ophthalmic → stays older.
13. **Weekly in words:** "15MG/WEEK", "15 MG, QWK", "10 MG, QW", "20 MG, PER WEEK", "5 MG, 1/WEEK", "1 time per week", "Take 6 tablets by mouth every Monday", "every 7 days", "Q7D", "50,000 IU 1/MO ORAL", "every 28 days" → `isWeekly` true. Against a daily record → verdict "schedule". Today: false / "worded".
14. **".5 mg":** "Lorazepam .5 mg tablet" vs "lorazepam 5 MG Oral Tablet" → dose question. Today: none (both read 5 MG).
15. **"1,000 mg":** "metformin 1,000 mg tablet" → strength 1000 MG (today "000 MG").
16. **Microgram spellings:** "levothyroxine 88 ug", "88 µg", "150 ?G", "75micrograms", "50 MUG" → read as mcg. Against "levothyroxine 0.088 MG Oral Tablet" → same strength. Against "0.88 MG" → different.
17. **Unit spellings:** "1000 IU", "1000 UT", "30 IE", "100 units/mL", "100 unit/ml", "100u/ml", "100 [iU]/mL" → one unit; never a strength of "U" meaning tablets.
18. **Coded dose "ug":** `doseQuantity {value: 88, unit: "ug"}` on a 0.088 MG tablet vs `{value: 1, unit: "tablet"}` → same dose. Today: a dose question.
19. **Epic dose unit mismatch:** text "Take 100 mg by mouth 1 (one) time each day., Historical Med", doseQuantity 100 "mg/kg" → don't show "100 mg/kg" as the dose when the text says mg (or show "See the record for how much").
20. **Combination strengths with dashes:** "...250-250-65 MG per tablet" vs SCD "acetaminophen 250 MG / aspirin 250 MG / caffeine 65 MG Oral Tablet" → no dose question. Today: a false alarm.
21. **Contained Medication:** MedicationRequest `medicationReference {reference: "#med0310"}` with `contained: [Medication]` (HL7 `medicationrequest0301.json` shape) → named from the contained code. Today: dropped as a placeholder.
22. **IPS urn:uuid Medication:** HL7 IPS `Bundle-IPS-examples-Bundle-01.json` shape → two medicines (anastrozole, Cimicifuga). Today: 0 medicines, 2 placeholders.
23. **IPS with MedicationRequest only** → medicines listed. Today: none.
24. **Absolute reference:** `medicationReference {reference: "https://ehr.example/fhir/Medication/123"}` with `_include` → resolves.
25. **Placeholder words:** "Unknown medication", "Med", "Rx", "None", "No current medications" → not shown as medicines (counted like "Medication").
26. **Obsolete/remapped RxCUI:** `105048` vs `849389` → one card after a history lookup, or at least a "Possible duplicate" note (today: name-only note; pin it).
27. **Repackager NDC with two openFDA rxcuis:** `71335-0158-1` → RxNav ndcstatus `866427` (25 mg), not the first of `["866427","866436"]`.
28. **Same NDC, RxCUI changed over time:** `45802064287` dated 2010-03 → `308416` (DR); dated 2012 → `243670`.
29. **CARIN package display as the fill name:** two fills, displays "Prozac, 100 CAPSULE in 1 BOTTLE (0777-3105-02) (package)" and a 30-capsule package of the same product → one fill card.
30. **CARIN dates disagree:** `billablePeriod.start 2019-10-30`, `servicedDate 2019-07-02` → the fill dated 2019-07-02 (pins today's behavior).
31. **IPS `no-medication-info`** → no medicine card; "No information about medications" said as a statement. Today: a current medicine.
32. **IPS `no-known-medications`** → a statement, not a medicine, and not in the QR code as a MedicationStatement drug.
33. **IPS `no-allergy-info`** → an "allergies not known" state, not an allergy. Today: an allergy card.
34. **IPS `no-known-allergies`, code only, no display** → statement "No known allergy". Today: unnamed allergy (display needed).
35. **NKA spellings with no code:** "NKA", "NKDA", "No Known Allergies.", "Patient has no known allergies", "NKMA" → statements. Today: allergies named that.
36. **SNOMED `716184000` No Known Latex Allergy** → a statement. Today: an allergy.
37. **nullFlavor and data-absent-reason allergen:** code `{system: v3-NullFlavor, code: NI, display: "NoInformation"}` → unnamed or no-info, not an allergy named "NoInformation".
38. **C-CDA NKA flattened:** code SNOMED `419199007` "Allergy to substance", no negation → shown, but flagged as unnamed (like `609328004`), not as an allergen called "Allergy to substance".
39. **Penicillin family in one source:** "Penicillin", "Penicillins", "PCN", "penicillin - rash", SNOMED `764146007` → five cards today; pin that nothing is lost (and none joins a non-penicillin).
40. **US Core name order:** `name: [{use:"old", family:"Shaw", given:["Amy","V."]}, {use:"usual", family:"Baxter", given:["Amy","V."]}]` vs `{family:"Baxter", given:["Amy"]}`, same birth date → same person (use the official/usual current name, then check old names).
41. **Nickname first:** `[{use:"usual", given:["Jim"]}, {use:"official", family:"Chalmers", given:["Peter","James"]}]` vs Peter Chalmers → same person. Today: no identity.
42. **"LAST, FIRST" text only:** `{text: "SMART, JOE"}` vs `{family:"SMART", given:["JOE"]}` → same person. Today: someone else.
43. **Text with suffix:** `{text: "John Smith Jr."}` vs `{family: "Smith", given:["John"]}` → same person (known; still open).
44. **Middle name in given[0]:** `given: ["Roelof Olaf"]` vs `["Roelof","Olaf"]`; `["Amy V."]` vs `["Amy"]` → same person.
45. **Particles in text:** `{text: "Pieter van de Heuvel"}` vs `{family: "van de Heuvel", given: ["Pieter"]}` → same person.
46. **Synthea digits:** `{family:"Jenkins344", given:["Loria621"]}` vs `{family:"Jenkins", given:["Loria"]}` → decide: strip trailing digits only when the other side has none? (Today: someone else.) At minimum pin it.
47. **Cyrillic same person:** `{family:"Иванов", given:["Иван"]}` both sides → same person. **Cyrillic different people** (Иванов Иван vs Петров Пётр, same date) → different. Today: both "different", and the first is wrong.
48. **Placeholder birth date:** both "1900-01-01", same common name → not the same person (treat 1900-01-01, 1901-01-01, 0001-01-01 like a missing date). Today: joins.
49. **Jr vs Sr, same birth date** → not the same person. Today: joins.
50. **Day/month swap:** "2017-09-05" vs "2017-05-09" (HL7 newborn's own disagreement) → kept out, with a message that the birth dates differ (not "someone else").
51. **Birth date as datetime:** "1950-01-02T00:00:00Z" vs "1950-01-02" → same person. Today: no identity.
52. **Shifted by a converter:** "1950-01-01" vs "1950-01-02", same name → kept out (pin it), says the dates differ by a day.
53. **`_birthDate` data-absent-reason, no birthDate** → no identity, kept out (pin it).
54. **Malformed given string:** `given: "Ann"` → read as "Ann", not "A".

## Gaps in Brown Bag's code

- `js/meds.js:readDrug`: takes the first RxNorm coding. Epic puts IN codes first, so different products share an IN rxcui (D1). Prefer `userSelected`, then SCD/SBD/GPCK/BPCK over SCDC/SBDF/MIN/IN/BN (needs the TTY: one RxNav `properties` call per code, or keep all codes and match on any SCD/SBD).
- `js/meds.js:makeItem` key `"rx:" + rxcui` and `dedupe`: an IN-level rxcui (Cerner) merges different strengths and salts in one source (D5).
- `js/meds.js:formOf` / `js/reconcile.js:matchOf`: release-type prefixes before the ingredient ("12 HR", "24 HR") and before the strength ("XL", "ER", "24 hr") aren't part of the form, and `null === null` counts as the same form (D2–D4, D3; the last was noted as a minor in progress.md).
- `js/rxnorm.js:ingredientsFor`: asks for `tty=IN` only, so salts (PIN) and remapped codes (empty IN group) are lost. Remapped RxCUIs get no ingredient (`105048`).
- `js/claims.js:attachFills`: ingredient-only match, no form or salt check, and it can move a completed record back to current (D6).
- `js/meds.js:STRENGTH`: misses "ug", "µg", "micrograms", "IU", "units", "unit", "u/ml" and "[iU]". It reads ".5" as 5 and "1,000" as "000", and stops inside "actuation" (D8).
- `js/reconcile.js:massOf` / `doseAmounts`: "ug" and "microgram" aren't masses, so a coded microgram dose is read as a count of tablets.
- `js/reconcile.js:WEEKLY` / `isWeekly`: misses "/WEEK", "QW", "QWK", "PER WEEK", "1/WEEK", "every Monday", "every 7 days", "Q7D", "1/MO", "every 28 days", "each week" (D7).
- `js/meds.js:formatDosage`: shows a coded dose whose unit contradicts the text (Epic "mg/kg" vs "100 mg").
- `js/app.js` (Medication map, `"Medication/" + r.id`): contained (`#id`), `urn:uuid` and absolute references aren't resolved, so real medicines are dropped as placeholders (D9).
- `js/snapshot.js:snapshotSource`: no Medication map at all (every IPS `medicationReference` is lost), and MedicationRequest is ignored (D9, D10).
- `js/meds.js:PLACEHOLDER` / `isPlaceholderDrug`: IPS `no-medication-info` and `no-known-medications`, and "Unknown medication"/"None"/"No current medications", show as medicines. A code-only record (SNOMED or a local code, no display) becomes "Unnamed medicine" and is silently counted as a placeholder.
- `js/allergies.js:NONE_CODES` / `statementOf`: no IPS absent-unknown codes, no `716184000` (latex), no text "NKA", "NKDA", "NKMA", "No Known Allergies.". `NO_CODE` filters nullFlavor and data-absent-reason codes but still uses their display ("NoInformation", "Unknown") as the allergen's name.
- `js/allergies.js:fromAllergyRecords`: `clinicalStatus` given only as text is ignored (fails safe).
- `js/reconcile.js:personOf`: reads `name[0]` only, ignoring `use` (official/usual/old/maiden/nickname), and splits text as "first ... last", so "LAST, FIRST" and "... Jr." break (P1, P2). `given` as a string is indexed by character.
- `js/reconcile.js:nameKey`: removes every non-Latin letter, so Cyrillic, Greek, Arabic and CJK names never match (P4). Digits are kept (Synthea). Ü/ue aren't folded together.
- `js/reconcile.js:samePerson`: no placeholder birth dates, strips Jr/Sr so they compare equal, and requires the exact `YYYY-MM-DD` string (a datetime is "no identity") (D11, P5).
- `js/reconcile.js:keptOutWhy`: says "someone-else" for a birth-date typo or a name the code can't read, where "doesn't match" would be truer (P2, P4, fixture 50).
- `js/claims.js:fillsFromClaims`: uses a CARIN package sentence as the drug name, and reads no days supply or quantity yet.

## Sources that couldn't be reached / out of scope

- **Out of scope for now (owner, 2026-11-25): ATC-only European records** (`http://www.whocc.no/atc` with no RxNorm). US sources only.

- **Kaggle** pages and API (`www.kaggle.com/api/v1/...` 404 from curl; the dataset pages are scripts). Its UCI source (archive.ics.uci.edu, 403 to WebFetch) was also blocked. Used the Hugging Face mirror of the same drugs.com reviews instead. One Hugging Face README returned 401.
- **data.gov catalog API** (`catalog.data.gov/api/3/action/package_search` → "Not Found"). Used WebSearch and a catalog dataset page instead; no allergy dataset found on data.gov.
- **data.cms.gov synthetic collection page** (JavaScript only, no download links readable). Used its user guide PDF (field values) instead; the synthetic `pde.csv` itself wasn't opened.
- **Blue Button 2.0 v2 sample EOB/Patient files**: no sample download link on the developer pages; used a v1 sandbox PDE (gist) and the CARIN pharmacy example. The BB2 v2 NDC `display` text wasn't confirmed.
- **Oracle Health (Cerner)**: fhir.cerner.com redirects to docs.oracle.com. The MedicationRequest and Patient examples were read; the AllergyIntolerance page returned 404.
- **Epic**: only the test-patients page's IPS sample was read (the page is 870 kB; the first 200 kB were read). Epic's per-resource Specifications pages weren't fetched. Epic's allergy "No Known Allergies" coding is still unconfirmed.
- **MEDITECH**: no public example responses found.
- **openFDA FAERS counts** over 100 rows need an API key (`API_KEY_MISSING`), so variants came from 300–400 raw reports per drug, not the full counts.
- **C-CDA examples**: read three (NKA, free text, withdrawn epinephrine README); "No Known Medication Allergies" and "Not Allergic to Peanuts" weren't opened.
