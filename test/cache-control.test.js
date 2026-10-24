const assert = require("node:assert/strict");
const Module = require("node:module");
const test = require("node:test");
const { withNoStore } = require("../netlify/functions/utils");

function loadFunctionWithDatabaseStub(functionPath, databaseResult) {
    const resolvedPath = require.resolve(functionPath);
    const cachedModule = require.cache[resolvedPath];
    const originalLoad = Module._load;

    Module._load = function (request, parent, isMain) {
        if (request === "./db" && parent?.filename === resolvedPath) {
            return {
                getDB: async () => {
                    if (databaseResult instanceof Error) throw databaseResult;
                    return databaseResult;
                },
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    delete require.cache[resolvedPath];
    try {
        return require(resolvedPath).handler;
    } finally {
        Module._load = originalLoad;
        delete require.cache[resolvedPath];
        if (cachedModule) require.cache[resolvedPath] = cachedModule;
    }
}

test("withNoStore overrides cacheable response headers for all cache layers", async () => {
    const handler = withNoStore(async () => ({
        statusCode: 200,
        headers: {
            "Cache-Control": "public, max-age=60",
            "Netlify-CDN-Cache-Control": "public, max-age=60",
            "X-Response": "kept",
        },
        body: "{}",
    }));

    const response = await handler({});

    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(response.headers["CDN-Cache-Control"], "no-store");
    assert.equal(response.headers["Netlify-CDN-Cache-Control"], "no-store");
    assert.equal(response.headers["X-Response"], "kept");
    assert.equal(response.statusCode, 200);
});

test("withNoStore does not swallow handler errors", async () => {
    const expectedError = new Error("handler failed");
    const handler = withNoStore(async () => {
        throw expectedError;
    });

    await assert.rejects(handler({}), expectedError);
});

test("combined menu endpoint disables browser and CDN caching", async () => {
    const database = {
        collection(name) {
            if (name === "menu") return { find: () => ({ toArray: async () => [] }) };
            if (name === "combo_settings") return { findOne: async () => null };
            if (name === "bagel_boxes") {
                return { find: () => ({ sort: () => ({ toArray: async () => [] }) }) };
            }
            throw new Error(`Unexpected collection: ${name}`);
        },
    };
    const handler = loadFunctionWithDatabaseStub("../netlify/functions/menu-data", database);
    const response = await handler({ httpMethod: "GET" });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(response.headers["Netlify-CDN-Cache-Control"], "no-store");
    assert.deepEqual(JSON.parse(response.body).menu, []);
});

test("menu database failures are errors and are not cacheable", async () => {
    const handler = loadFunctionWithDatabaseStub(
        "../netlify/functions/menu",
        new Error("database unavailable")
    );
    const originalConsoleError = console.error;
    console.error = () => {};
    let response;
    try {
        response = await handler({ httpMethod: "GET", headers: {} });
    } finally {
        console.error = originalConsoleError;
    }

    assert.equal(response.statusCode, 503);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.deepEqual(JSON.parse(response.body), { error: "Menu is temporarily unavailable" });
});
