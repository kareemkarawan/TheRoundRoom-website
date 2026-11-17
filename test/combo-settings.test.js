const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");

function loadComboSettingsHandler(database) {
    const functionPath = require.resolve("../netlify/functions/combo-settings");
    const cachedModule = require.cache[functionPath];
    const originalLoad = Module._load;
    const originalToken = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = "test-admin-token";

    Module._load = function (request, parent, isMain) {
        if (request === "./db" && parent?.filename === functionPath) {
            return { getDB: async () => database };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    delete require.cache[functionPath];
    try {
        return require(functionPath).handler;
    } finally {
        Module._load = originalLoad;
        if (originalToken === undefined) delete process.env.ADMIN_TOKEN;
        else process.env.ADMIN_TOKEN = originalToken;
        delete require.cache[functionPath];
        if (cachedModule) require.cache[functionPath] = cachedModule;
    }
}

test("combo settings save optional image without requiring it from older clients", async () => {
    let savedSettings;
    const database = {
        collection(name) {
            assert.equal(name, "combo_settings");
            return {
                updateOne: async (_query, update) => {
                    savedSettings = update.$set;
                },
            };
        },
    };
    const handler = loadComboSettingsHandler(database);
    const baseSettings = {
        price: 250,
        isAvailable: true,
        availableBagels: ["plain"],
        availableSchmears: ["scallion"],
        description: "Bagel with schmear",
        allowedPincodes: [],
    };
    const event = imageUrl => ({
        httpMethod: "PUT",
        headers: { "x-admin-token": "test-admin-token" },
        body: JSON.stringify(imageUrl === undefined ? baseSettings : { ...baseSettings, imageUrl }),
    });

    const legacyResponse = await handler(event());
    assert.equal(legacyResponse.statusCode, 200);
    assert.equal(Object.hasOwn(savedSettings, "imageUrl"), false);

    const imageResponse = await handler(event(" images/sandwich.webp "));
    assert.equal(imageResponse.statusCode, 200);
    assert.equal(savedSettings.imageUrl, "images/sandwich.webp");
    assert.equal(savedSettings.price, baseSettings.price);
    assert.deepEqual(savedSettings.availableBagels, baseSettings.availableBagels);
});

test("Carbies combo settings save independently from the existing sandwich", async () => {
    let savedSettings;
    let storedSettings = null;
    const database = {
        collection(name) {
            assert.equal(name, "combo_settings");
            return {
                findOne: async () => storedSettings,
                updateOne: async (_query, update) => {
                    savedSettings = update.$set;
                    storedSettings = { ...storedSettings, ...update.$set };
                },
            };
        },
    };
    const handler = loadComboSettingsHandler(database);
    const response = await handler({
        httpMethod: "PUT",
        headers: { "x-admin-token": "test-admin-token" },
        body: JSON.stringify({
            carbiesSandwich: {
                sectionTitle: "The Round Room x Carbies",
                title: "The Carbie Special",
                description: "A collaboration sandwich",
                price: 350,
                isAvailable: true,
                availableBagels: ["plain"],
                availableSchmears: ["carbies-schmear", "another-schmear"],
                bagelLabel: "Pick your bagel",
                bagelPlaceholder: "Choose one",
                schmearLabel: "Pick your schmear",
                schmearPlaceholder: "Choose one",
                buttonLabel: "Add sandwich",
                imageUrl: "images/carbies.webp",
                allowedPincodes: [],
            },
        }),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(savedSettings.price, undefined);
    assert.equal(savedSettings.isAvailable, undefined);
    assert.equal(savedSettings.carbiesSandwich.title, "The Carbie Special");
    assert.equal(savedSettings.carbiesSandwich.imageUrl, "images/carbies.webp");
    assert.deepEqual(savedSettings.carbiesSandwich.availableBagels, ["plain"]);
    assert.deepEqual(savedSettings.carbiesSandwich.availableSchmears, ["carbies-schmear"]);

    const getResponse = await handler({
        httpMethod: "GET",
        headers: {},
    });
    const settings = JSON.parse(getResponse.body);
    assert.deepEqual(settings.availableBagels, []);
    assert.deepEqual(settings.availableSchmears, []);
    assert.equal(settings.isAvailable, false);
    assert.equal(settings.carbiesSandwich.title, "The Carbie Special");
});
