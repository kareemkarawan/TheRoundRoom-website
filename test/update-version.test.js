const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("updates existing versions on asset paths containing spaces on every run", t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "round-room-version-"));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    fs.copyFileSync(path.join(__dirname, "..", "update-version.js"), path.join(directory, "update-version.js"));
    fs.writeFileSync(
        path.join(directory, "index.html"),
        '<img src="webpimages/Plain Schmear.webp?v=123"><source data-fallback="videos/backup video.mp4?v=123">'
    );
    fs.writeFileSync(
        path.join(directory, "style.css"),
        '.hero { background-image: url("webpimages/menu bg.webp?v=123"); }'
    );

    execFileSync(process.execPath, ["update-version.js"], { cwd: directory });
    const firstHtml = fs.readFileSync(path.join(directory, "index.html"), "utf8");
    const firstCss = fs.readFileSync(path.join(directory, "style.css"), "utf8");
    const firstVersions = [...`${firstHtml} ${firstCss}`.matchAll(/\?v=(\d+)/g)].map(match => match[1]);

    assert.equal(firstVersions.length, 3);
    assert.equal(new Set(firstVersions).size, 1);

    execFileSync(process.execPath, ["update-version.js"], { cwd: directory });
    const secondHtml = fs.readFileSync(path.join(directory, "index.html"), "utf8");
    const secondCss = fs.readFileSync(path.join(directory, "style.css"), "utf8");
    const secondVersions = [...`${secondHtml} ${secondCss}`.matchAll(/\?v=(\d+)/g)].map(match => match[1]);

    assert.equal(secondVersions.length, 3);
    assert.equal(new Set(secondVersions).size, 1);
    assert.notEqual(secondVersions[0], firstVersions[0]);
});
