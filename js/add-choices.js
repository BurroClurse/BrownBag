// The "How much" and "How often" lists on the add form. "How much" fits the
// form at the end of the RxNorm name ("... Oral Tablet", "... Oral
// Suspension"); each choice also says what it means in FHIR, so a picked
// answer can go into the QR code as numbers. No DOM here, so Node's test
// runner can check it. The form adds "Other…" to both lists.

var UCUM_ML = { unit: "mL", system: "http://unitsofmeasure.org", code: "mL" };
var PLURAL = { suppository: "suppositories" };

function formOf(name) {
  var n = String(name || "").toLowerCase();
  if (/ophthalmic|otic/.test(n)) return "drop";
  if (/nasal spray/.test(n)) return "spray";
  if (/inhal|actuat/.test(n)) return "puff";
  if (/transdermal/.test(n)) return "patch";
  if (/cream|ointment|gel|lotion/.test(n)) return "apply";
  if (/oral solution|suspension|syrup|elixir/.test(n)) return "ml";
  var count = /tablet|capsule|suppository|lozenge/.exec(n);
  return count ? count[0] : "general";
}

function amountLabel(value) {
  if (value === 0.5) return "½";
  if (value === 1.5) return "1½";
  return String(value);
}

function counted(word, values) {
  return values.map(function (value) {
    var many = value > 1 ? (PLURAL[word] || word + "s") : word;
    return { label: amountLabel(value) + " " + many, quantity: { value: value, unit: word } };
  });
}

export function doseChoices(drugName) {
  var form = formOf(drugName);
  if (form === "apply") return [{ label: "Apply a thin layer", quantity: null }];
  if (form === "ml") {
    return [2.5, 5, 7.5, 10, 15, 20].map(function (value) {
      return { label: value + " mL", quantity: Object.assign({ value: value }, UCUM_ML) };
    });
  }
  if (form === "drop") return counted("drop", [1, 2, 3]);
  if (form === "puff" || form === "spray") return counted(form, [1, 2, 3, 4]);
  if (form === "patch") return counted("patch", [1]);
  if (form === "general") {
    return [
      { label: "1 tablet", quantity: { value: 1, unit: "tablet" } },
      { label: "1 capsule", quantity: { value: 1, unit: "capsule" } },
      { label: "5 mL", quantity: Object.assign({ value: 5 }, UCUM_ML) },
      { label: "1 scoop", quantity: { value: 1, unit: "scoop" } }
    ];
  }
  return counted(form, [0.5, 1, 1.5, 2, 3, 4]);
}

export var FREQUENCY_CHOICES = [
  { label: "Once a day", schedule: { frequency: 1, period: 1, periodUnit: "d" } },
  { label: "Twice a day", schedule: { frequency: 2, period: 1, periodUnit: "d" } },
  { label: "3 times a day", schedule: { frequency: 3, period: 1, periodUnit: "d" } },
  { label: "4 times a day", schedule: { frequency: 4, period: 1, periodUnit: "d" } },
  { label: "At bedtime", schedule: { frequency: 1, period: 1, periodUnit: "d", when: ["HS"] } },
  { label: "Every other day", schedule: { frequency: 1, period: 2, periodUnit: "d" } },
  { label: "Once a week", schedule: { frequency: 1, period: 1, periodUnit: "wk" } },
  { label: "As needed", schedule: { asNeeded: true } }
];
