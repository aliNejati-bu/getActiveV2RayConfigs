const {
    urlTest, addConfig, getConfigsToTest, getConnectedConfigsToTest, getConfigsToTestOverTenTry,
    getConfigsToTestNoTry
} = require("./testConfig");
const mongoose = require('mongoose');
const fs = require("node:fs");
const {ProxyClient} = require("./Logic/ProxyClient");
const {ConfigModel} = require("./DB/ConfigModel");
const base64subs = require("./subsb64.json");
const path = require("node:path");
const axios = require("axios");
const channels = require("./telegrams.json");
const {connect} = require("mongoose");
const cliProgress = require("cli-progress");
const readline = require("node:readline");

let dbExt = "";
if (process.argv.length > 3) {
    dbExt = "-" + process.argv[3];
}

mongoose.connect('mongodb://localhost:27017/vpns' + dbExt)
    .then(() => {
        main();
    }).catch(err => console.error('Connection failed:', err));


async function main() {

    if (process.argv[2] === 'add') {
        await addSubsToDB();
        setInterval(addSubsToDB, 30 * 60 * 1000);
    }
    if (process.argv[2] === 'test') {
        while (true) {
            const configTotest = await getConfigsToTest(100);
            if (configTotest.length) {
                await testConfigs(configTotest);
            }
        }
    }
    if (process.argv[2] === 'createfile') {
        exportConnectedConfigsToTxt();
    }
    if (process.argv[2] === 'testConnected') {
        while (true) {
            const configTotest = await getConnectedConfigsToTest(4);
            if (configTotest.length) {
                await testConnectedConfigs(configTotest);
            }
            await sleep(5000);
        }
    }
    if (process.argv[2] === 'telegram') {
        while (true) {
            const channels = require("./telegrams.json");
            for (let i = 0; i < channels.length; i++) {
                console.log(Date.now(), new Date(), channels[i])
                let configs;
                try {
                    configs = await getTelegramChannelConfig(channels[i]);
                } catch (e) {
                    console.log(Date.now(), new Date(), channels[i], "ERR");
                    continue;
                }
                for (let j = 0; j < configs.length; j++) {
                    let result = await addConfig(configs[j]);
                    if (result)
                        console.log(Date.now(), new Date(), "added");
                }
                console.log(Date.now(), new Date(), channels[i], "Ended")
            }
            await sleep(1000 * 60 * 60);
        }
    }
    if (process.argv[2] === 'testOLD') {
        while (true) {
            const configTotest = await getConfigsToTestOverTenTry(20);
            if (configTotest.length) {
                await testConfigs(configTotest);
            }
        }
    }
    if (process.argv[2] === 'testAll') {
        while (true) {
            const configTotest = await getConfigsToTestNoTry(100);
            if (configTotest.length) {
                await testConfigs(configTotest);
            }
        }
    }
    if (process.argv[2] === "disconnect") {
        await ConfigModel.updateMany({}, {
            connectionStatus: false,
            tries: 1
        });
    }
    if (process.argv[2] === 'export') {
        console.log("askfopewkop")
        await exportConfigs();
    }
    if (process.argv[2] === "import") {
        await importConfigs();
    }
}


/**
 * برای اضافه کردن کانفیگ ها از گیت هاب ها و سابسکریپشن ها
 * @returns {Promise<void>}
 */
async function addSubsToDB() {
    let base64subs = require("./subsb64.json");
    let configData = fs.readFileSync('./activeConfig').toString();
    const proxyClient = new ProxyClient(configData);
    await proxyClient.connect();
    process.on('exit', () => {
        proxyClient.disconnect();
    });
    for (let i = 0; i < base64subs.length; i++) {
        console.log(Date.now(), new Date(), "Start Proc For:", base64subs[i]);
        try {
            const data = await axios.get(base64subs[i]);
            //const data = await proxyClient.get(base64subs[i], {
            //    timeout: 15000,
            //});
            const realData = Buffer.from(data.data, 'base64').toString("utf-8");
            let configs = realData.split("\n");
            console.log(Date.now(), new Date(), "Number:", configs.length);
            for (let j = 0; j < configs.length; j++) {
                let result = await addConfig(configs[j]);
                if (result) {
                    console.log(Date.now(), new Date(), "added");
                }
            }
        } catch (err) {
            console.log(Date.now(), new Date(), err.message, "=>", base64subs[i], "=> ERR");

        }
    }
    base64subs = require("./subs.json");
    for (let i = 0; i < base64subs.length; i++) {
        console.log(Date.now(), new Date(), "Start Proc For:", base64subs[i]);
        try {
            const data = await axios.get(base64subs[i]);

            //const data = (await proxyClient.get(base64subs[i], {
            //    timeout: 30000,
            //}));
            let configs = data.data.split("\n");
            console.log(Date.now(), new Date(), "Number:", configs.length);
            for (let j = 0; j < configs.length; j++) {
                let result = await addConfig(configs[j]);
                if (result) {
                    console.log(Date.now(), new Date(), "added");
                }
            }
        } catch (err) {
            //console.log(err)
            console.log(Date.now(), new Date(), err.message, "=>", base64subs[i], "=> ERR");

        }
    }
    await proxyClient.disconnect();
}

/**
 * برسی کانفیگ های موجود
 * @param configs
 * @returns {Promise<Awaited<unknown>[]>}
 */
async function testConfigs(configs) {
    console.log(Date.now(), new Date(), "Start Testing...")
    return Promise.all(configs.map(async (config) => {
        try {
            if (config.tries < -1) {
                config.tries = -1;
            }
            // تست کانفیگ
            const testResult = await urlTest(config.uri);

            // اگر کانفیگ متصل شد، connectionStatus را true می‌کنیم و lastModifiedAt را آپدیت می‌کنیم
            if (testResult.success) {
                console.log(Date.now(), new Date(), "success");
                await ConfigModel.findByIdAndUpdate(config._id, {
                    $set: {
                        connectionStatus: true,
                        lastModifiedAt: new Date(),
                        tries: config.tries - 1,
                    },
                    $push: {
                        history: {
                            status: true
                        }
                    }
                });
            } else {
                // اگر متصل نشد، فقط تاریخ آخرین تغییرات را آپدیت می‌کنیم
                await ConfigModel.findByIdAndUpdate(config._id, {
                    $set: {
                        lastModifiedAt: new Date(),
                        tries: config.tries + 1,
                    },
                    $push: {
                        history: {
                            status: false
                        }
                    }
                });
            }

            return {success: testResult.success, uri: config.uri, status: testResult.status};
        } catch (error) {
            // در صورتی که خطا داشته باشیم، کانفیگ را به روز رسانی میکنیم و خطا را ذخیره میکنیم
            await ConfigModel.findByIdAndUpdate(config._id, {
                $set: {
                    lastModifiedAt: new Date(),
                    tries: config.tries + 1,
                },
                $push: {
                    history: {
                        status: false
                    }
                }
            });

            return {success: false, uri: config.uri, error: error.message};
        }
    }));
}


async function exportConnectedConfigsToTxt(outputPath = 'connected-configs.txt') {
    try {
        const connectedConfigs = await ConfigModel.find({connectionStatus: true});

        if (!connectedConfigs.length) {
            console.log('هیچ کانفیگ متصلی یافت نشد.');
            return;
        }

        const lines = connectedConfigs.map(config => config.uri);
        const fileContent = lines.join('\n');

        const fullPath = path.resolve(outputPath);
        fs.writeFileSync(fullPath, fileContent, 'utf8');

        console.log(`فایل با ${lines.length} کانفیگ متصل ساخته شد: ${fullPath}`);
    } catch (err) {
        console.error('خطا در exportConnectedConfigsToTxt:', err);
    }
}


/**
 * برسی کانکشن های متصل
 * @param configs
 * @returns {Promise<Awaited<unknown>[]>}
 */
async function testConnectedConfigs(configs) {
    console.log(Date.now(), new Date(), "Start Testing...")
    return Promise.all(configs.map(async (config) => {
        try {
            console.log(Date.now(), new Date(), config._id)
            // تست کانفیگ
            const testResult = await urlTest(config.uri);

            // اگر کانفیگ متصل شد، connectionStatus را true می‌کنیم و lastModifiedAt را آپدیت می‌کنیم
            if (testResult.success) {
                await ConfigModel.findByIdAndUpdate(config._id, {
                    $set: {
                        connectionStatus: true,
                        lastModifiedAt: new Date()
                    },
                    $push: {
                        history: {
                            status: true
                        }
                    }
                });
            } else {
                console.log(Date.now(), new Date(), "fail");
                // اگر متصل نشد، فقط تاریخ آخرین تغییرات را آپدیت می‌کنیم
                await ConfigModel.findByIdAndUpdate(config._id, {
                    $set: {
                        connectionStatus: false,
                        tries: 0,
                        lastModifiedAt: new Date(),
                    },
                    $push: {
                        history: {
                            status: false
                        }
                    }
                });
            }

            return {success: testResult.success, uri: config.uri, status: testResult.status};
        } catch (error) {
            console.log(Date.now(), new Date(), "success");
            // در صورتی که خطا داشته باشیم، کانفیگ را به روز رسانی میکنیم و خطا را ذخیره میکنیم
            await ConfigModel.findByIdAndUpdate(config._id, {
                $set: {
                    connectionStatus: false,
                    tries: 0,
                    lastModifiedAt: new Date(),
                },
                $push: {
                    history: {
                        status: false
                    }
                }
            });

            return {success: false, uri: config.uri, error: error.message};
        }
    }));
}


/**
 * sleep function
 */
function sleep(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    })
}

/**
 * دریافت کانیفگ از کانال تلگرام
 */
async function getTelegramChannelConfig(id) {
    let configData = fs.readFileSync('./activeConfig').toString();
    const proxyClient = new ProxyClient(configData);
    await proxyClient.connect();
    const result = await proxyClient.get("https://t.me/s/" + id);
    try {
        let text = result.data;
        const pattern_shadowsocks = /(?<![\w-])(ss:\/\/[^\s<>#]+)/g;
        const pattern_trojan = /(?<![\w-])(trojan:\/\/[^\s<>#]+)/g;
        const pattern_vmess = /(?<![\w-])(vmess:\/\/[^\s<>#]+)/g;
        const pattern_vless = /(?<![\w-])(vless:\/\/(?:(?!=reality)[^\s<>#])+(?=[\s<>#]))/g;
        const pattern_reality = /(?<![\w-])(vless:\/\/[^\s<>#]+?security=reality[^\s<>#]*)/g;
        const pattern_tuic = /(?<![\w-])(tuic:\/\/[^\s<>#]+)/g;
        const pattern_hysteria = /(?<![\w-])(hysteria:\/\/[^\s<>#]+)/g;
        const pattern_hysteria_ver2 = /(?<![\w-])(hy2:\/\/[^\s<>#]+)/g;
        const pattern_juicity = /(?<![\w-])(juicity:\/\/[^\s<>#]+)/g;

        const ssLinks = text.match(pattern_shadowsocks) ?? [];
        const trojanLinks = text.match(pattern_trojan) ?? [];
        const vmessLinks = text.match(pattern_vmess) ?? [];
        const vlessLinks = text.match(pattern_vless) ?? [];
        const realityLinks = text.match(pattern_reality) ?? [];
        const tuicLinks = text.match(pattern_tuic) ?? [];
        const hysteriaLinks = text.match(pattern_hysteria) ?? [];
        const hysteriaVer2Links = text.match(pattern_hysteria_ver2) ?? [];
        const juicityLinks = text.match(pattern_juicity) ?? [];

        await proxyClient.disconnect();


        return [...ssLinks, ...trojanLinks, ...vmessLinks, ...vlessLinks, ...realityLinks];
    } catch (err) {
        await proxyClient.disconnect();
        return [];
    }
}

async function exportConfigs() {
    console.log("Getting total count...");
    const total = await ConfigModel.countDocuments({});
    if (total === 0) {
        console.log("No configs found.");
        return;
    }

    const cursor = ConfigModel.find({}).cursor();
    const writeStream = fs.createWriteStream('./export.txt');
    const progressBar = new cliProgress.SingleBar({
        format: 'Progress |{bar}| {percentage}% || {value}/{total} configs',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    });

    let count = 0;
    progressBar.start(total, 0);

    for await (const config of cursor) {
        writeStream.write(config.uri + "\n");
        count++;
        progressBar.update(count);
    }

    writeStream.end();
    progressBar.stop();

    console.log(`\n✅ Done! Exported ${count} configs.`);
}

async function importConfigs(filePath = './export.txt') {
    if (!fs.existsSync(filePath)) {
        console.error("❌ File not found:", filePath);
        return;
    }

    const totalLines = await countLines(filePath);
    if (totalLines === 0) {
        console.log("⚠️ File is empty.");
        return;
    }

    let addedCount = 0;
    let duplicateCount = 0;
    let current = 0;

    const progressBar = new cliProgress.SingleBar({
        format: 'Importing |{bar}| {percentage}% || {value}/{total} configs || ➕ {added} | 🔁 {duplicate}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);

    progressBar.start(totalLines, 0, {
        added: addedCount,
        duplicate: duplicateCount
    });

    const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const uri = line.trim();
        if (uri.length === 0) continue;

        const result = await addConfig(uri);
        if (result === true) {
            addedCount++;
        } else {
            duplicateCount++;
        }

        current++;
        progressBar.update(current, {
            added: addedCount,
            duplicate: duplicateCount
        });
    }

    progressBar.stop();

    console.log(`\n✅ Done! Total: ${current}`);
    console.log(`➕ Added: ${addedCount}`);
    console.log(`🔁 Duplicates: ${duplicateCount}`);
}


// تابع کمکی برای شمارش تعداد خطوط فایل
function countLines(filePath) {
    return new Promise((resolve, reject) => {
        let count = 0;
        const rl = readline.createInterface({
            input: fs.createReadStream(filePath),
            crlfDelay: Infinity
        });
        rl.on('line', () => count++);
        rl.on('close', () => resolve(count));
        rl.on('error', reject);
    });
}