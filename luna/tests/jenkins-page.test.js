const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "..", "src/features/jenkins/jenkins-page.js"),
  "utf8"
);

class MockTextarea {
  constructor(name = "value", value = "") {
    this.attributes = new Map();
    this.events = [];
    this.id = "";
    this.name = name;
    this._value = value;
    this.tagName = "TEXTAREA";
  }

  dispatchEvent(event) {
    this.events.push(event.type);
  }

  get value() {
    return this._value;
  }

  set value(nextValue) {
    this._value = String(nextValue);
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
}

class MockContainer {
  constructor(textarea) {
    this.textarea = textarea;
  }

  querySelector() {
    return this.textarea;
  }
}

class MockHidden {
  constructor(key, textarea) {
    this.value = key;
    this.parentElement = new MockContainer(textarea);
  }

  closest() {
    return this.parentElement;
  }
}

class MockEvent {
  constructor(type) {
    this.type = type;
  }
}

const buildPage = ({ missingKey = "", url }) => {
  const allKeys = [
    "SCRAPED_URLS",
    "CATEGORIES",
    "MAKES_MODELS",
    "TRIMS",
    "COLORS",
    "CONDITIONS",
    "SPECS",
    "TRANSMISSION_TYPES",
    "SUB_CATEGORIES",
    "SUB_SUB_CATEGORIES"
  ];
  const textareas = Object.fromEntries(allKeys.map((key) => [key, new MockTextarea()]));
  const email = new MockTextarea("EMAIL", "agent-must-enter-this");
  const password = new MockTextarea("PASSWORD", "never-touch-this");
  const whatsapp = new MockTextarea("WHATSAPP_NUMBER", "manual-number");
  const unrelated = new MockTextarea("PRODUCT_NAMES", "leave-this-alone");
  const hiddens = allKeys
    .filter((key) => key !== missingKey)
    .map((key) => new MockHidden(key, textareas[key]));
  const document = {
    querySelectorAll(selector) {
      if (selector === "textarea") {
        return [...Object.values(textareas), email, password, whatsapp, unrelated];
      }
      if (selector.includes('input[name="name"]')) return hiddens;
      return [];
    }
  };
  const context = {
    decodeURIComponent,
    document,
    Error,
    Event: MockEvent,
    HTMLTextAreaElement: MockTextarea,
    location: { href: url },
    Map,
    Number,
    Object,
    String,
    URL
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return {
    email,
    fill: context.LunaJenkinsPage.fillJenkinsPage,
    password,
    textareas,
    unrelated,
    whatsapp
  };
};

const dubicarsBatch = {
  fields: {
    CATEGORIES: "USED\nEXPORT",
    COLORS: "Black\nWhite",
    CONDITIONS: "VERY_GOOD\nEXCELLENT",
    MAKES_MODELS: "BMW 840Ci\nToyota Camry",
    SCRAPED_URLS: "https://www.dubicars.com/one\nhttps://www.dubicars.com/two",
    TRIMS: "M SPORT\nOther"
  },
  rowCount: 2,
  type: "dubicars"
};
const dubizzleBatch = {
  fields: {
    ...dubicarsBatch.fields,
    SCRAPED_URLS: "https://dubai.dubizzle.com/one\nhttps://dubai.dubizzle.com/two",
    SPECS: "GCC\nAmerican",
    TRANSMISSION_TYPES: "AUTOMATIC\nMANUAL"
  },
  rowCount: 2,
  type: "dubizzle"
};
const noonBatch = {
  fields: {
    SCRAPED_URLS:
      "https://www.noon.com/uae-en/watch/N1/p/\nhttps://www.noon.com/uae-en/makeup/N2/p/",
    CATEGORIES: "ELECTRONICS\nLIFESTYLE",
    SUB_CATEGORIES: "ACCESSORIES\nBEAUTY_HEALTH",
    SUB_SUB_CATEGORIES: "WEARABLE_TECHNOLOGY\nMAKEUP",
    CONDITIONS: "NEW_WITH_TAGS\nNEW_WITH_TAGS"
  },
  rowCount: 2,
  type: "noon"
};

const dubicarsPage = buildPage({
  url: "https://jenkins.example.invalid:8080/job/OPS%20Team%20-%20Dubicars%20Cars%20Scraping/build?delay=0sec"
});
const dubicarsResult = dubicarsPage.fill(dubicarsBatch);
assert.equal(dubicarsResult.ok, true);
assert.equal(dubicarsResult.filledFields, 6);
assert.equal(dubicarsResult.rowCount, 2);
assert.equal(dubicarsPage.textareas.SCRAPED_URLS.value, dubicarsBatch.fields.SCRAPED_URLS);
assert.equal(dubicarsPage.textareas.CONDITIONS.value, "VERY_GOOD\nEXCELLENT");
assert.equal(dubicarsPage.textareas.SPECS.value, "");
assert.equal(dubicarsPage.textareas.TRANSMISSION_TYPES.value, "");
assert.deepEqual(dubicarsPage.textareas.COLORS.events, ["input", "change"]);
assert.equal(dubicarsPage.email.value, "agent-must-enter-this");
assert.equal(dubicarsPage.password.value, "never-touch-this");
assert.equal(dubicarsPage.whatsapp.value, "manual-number");
assert.equal(dubicarsPage.unrelated.value, "leave-this-alone");

const dubizzlePage = buildPage({
  url: "https://jenkins.example.invalid:8080/job/OPS%20Team%20-%20Dubizzle%20Cars%20Scraping/build?delay=0sec"
});
const dubizzleResult = dubizzlePage.fill(dubizzleBatch);
assert.equal(dubizzleResult.ok, true);
assert.equal(dubizzleResult.filledFields, 8);
assert.equal(dubizzlePage.textareas.SPECS.value, "GCC\nAmerican");
assert.equal(dubizzlePage.textareas.TRANSMISSION_TYPES.value, "AUTOMATIC\nMANUAL");

const noonPage = buildPage({
  url: "https://jenkins.example.invalid:8080/job/OPS%20Team%20-%20Noon%20Scraping/build?delay=0sec"
});
const noonResult = noonPage.fill(noonBatch);
assert.equal(noonResult.ok, true);
assert.equal(noonResult.jobName, "OPS Team - Noon Scraping");
assert.equal(noonResult.filledFields, 5);
assert.equal(noonResult.rowCount, 2);
assert.equal(noonPage.textareas.SCRAPED_URLS.value, noonBatch.fields.SCRAPED_URLS);
assert.equal(noonPage.textareas.CATEGORIES.value, "ELECTRONICS\nLIFESTYLE");
assert.equal(noonPage.textareas.SUB_CATEGORIES.value, "ACCESSORIES\nBEAUTY_HEALTH");
assert.equal(noonPage.textareas.SUB_SUB_CATEGORIES.value, "WEARABLE_TECHNOLOGY\nMAKEUP");
assert.equal(noonPage.textareas.CONDITIONS.value, "NEW_WITH_TAGS\nNEW_WITH_TAGS");
assert.equal(noonPage.textareas.MAKES_MODELS.value, "");
assert.equal(noonPage.textareas.TRIMS.value, "");
assert.equal(noonPage.textareas.COLORS.value, "");
assert.equal(noonPage.textareas.SPECS.value, "");
assert.equal(noonPage.textareas.TRANSMISSION_TYPES.value, "");
assert.equal(noonPage.email.value, "agent-must-enter-this");
assert.equal(noonPage.password.value, "never-touch-this");
assert.equal(noonPage.whatsapp.value, "manual-number");
assert.equal(noonPage.unrelated.value, "leave-this-alone");

const wrongJobPage = buildPage({
  url: "https://jenkins.example.invalid:8080/job/OPS%20Team%20-%20Dubizzle%20Cars%20Scraping/build?delay=0sec"
});
const wrongJobResult = wrongJobPage.fill(dubicarsBatch);
assert.equal(wrongJobResult.ok, false);
assert.match(wrongJobResult.detail, /Dubicars Cars Scraping.*Build with Parameters/);
assert.equal(wrongJobPage.textareas.SCRAPED_URLS.value, "");

const wrongHostPage = buildPage({
  url: "http://example.com:8080/job/OPS%20Team%20-%20Dubicars%20Cars%20Scraping/build"
});
assert.equal(wrongHostPage.fill(dubicarsBatch).ok, false);
assert.equal(wrongHostPage.textareas.SCRAPED_URLS.value, "");

const wrongPathPage = buildPage({
  url: "https://jenkins.example.invalid:8080/job/OPS%20Team%20-%20Dubicars%20Cars%20Scraping/build-and-submit"
});
assert.equal(wrongPathPage.fill(dubicarsBatch).ok, false);
assert.equal(wrongPathPage.textareas.SCRAPED_URLS.value, "");

const missingFieldPage = buildPage({
  missingKey: "TRIMS",
  url: "https://jenkins.example.invalid:8080/job/OPS%20Team%20-%20Dubicars%20Cars%20Scraping/build"
});
const missingResult = missingFieldPage.fill(dubicarsBatch);
assert.equal(missingResult.ok, false);
assert.match(missingResult.detail, /TRIMS was not found.*Nothing was filled/);
assert.equal(missingFieldPage.textareas.SCRAPED_URLS.value, "");

const unequalResult = dubicarsPage.fill({
  ...dubicarsBatch,
  fields: { ...dubicarsBatch.fields, COLORS: "Black" }
});
assert.equal(unequalResult.ok, false);
assert.match(unequalResult.detail, /COLORS does not contain exactly 2 complete lines/);

assert.doesNotMatch(source, /\.click\s*\(/);
assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|chrome\./);
assert.doesNotMatch(source, /EMAIL|PASSWORD|WHATSAPP_NUMBER/);

console.log("Jenkins page fill tests passed.");
