const fs = require("fs");
const path = require("path");
const {execFile} = require("child_process");
const axios = require("axios");
const {SocksProxyAgent} = require("socks-proxy-agent");
const getPort = require("get-port");
const {ConfigModel} = require("./DB/ConfigModel");

function parseVmess(url) {
    const decoded = Buffer.from(url.replace("vmess://", ""), "base64").toString("utf-8");
    const data = JSON.parse(decoded);
    return {
        protocol: "vmess",
        address: data.add,
        port: parseInt(data.port),
        id: data.id,
        aid: parseInt(data.aid || 0),
        net: data.net,
        tls: data.tls || "none",
        host: data.host || "",
        path: data.path || "",
        security: data.security || "auto"
    };
}

function parseVless(url) {
    const [_, userInfo, address, port, query] = url.match(/^vless:\/\/(.*?)@(.*?):(\d+)\?(.*?)(#.*)?$/);
    const params = Object.fromEntries(new URLSearchParams(query));
    return {
        protocol: "vless",
        address,
        port: parseInt(port),
        id: userInfo,
        encryption: params.encryption || "none",
        tls: params.security || "none",
        net: params.type || "tcp",
        host: params.host || params.sni || "",
        path: params.path || "",
        headerType: params.headerType || "none",
        fingerprint: params.fp || "",
        publicKey: params.pbk || "",
        shortId: params.sid || ""
    };
}

function parseTrojan(url) {
    const [_, password, address, port, query] = url.match(/^trojan:\/\/(.*?)@(.*?):(\d+)\??(.*)?$/);
    const params = Object.fromEntries(new URLSearchParams(query));
    return {
        protocol: "trojan",
        address,
        port: parseInt(port),
        password,
        sni: params.sni || undefined
    };
}

function parseShadowsocks(url) {
    const base = url.replace("ss://", "").split("#")[0];
    let decoded;
    if (base.includes("@")) {
        decoded = base;
    } else {
        decoded = Buffer.from(base, "base64").toString();
    }
    const [methodPass, serverPort] = decoded.split("@");
    const [method, password] = methodPass.split(":");
    const [address, port] = serverPort.split(":");
    return {
        protocol: "shadowsocks",
        method,
        password,
        address,
        port: parseInt(port)
    };
}

async function testV2rayConfig(rawUrl) {
    let parsed;
    if (rawUrl.startsWith("vmess://")) parsed = parseVmess(rawUrl);
    else if (rawUrl.startsWith("vless://")) parsed = parseVless(rawUrl);
    else if (rawUrl.startsWith("trojan://")) parsed = parseTrojan(rawUrl);
    else if (rawUrl.startsWith("ss://")) parsed = parseShadowsocks(rawUrl);
    else throw new Error("Unsupported protocol");
    const port = await getPort();

    const config = {
        log: {loglevel: "warning"},
        inbounds: [
            {
                port,
                listen: "127.0.0.1",
                protocol: "socks",
                settings: {auth: "no"}
            }
        ],
        outbounds: []
    };

    const outbound = {protocol: parsed.protocol};

    if (parsed.protocol === "vmess" || parsed.protocol === "vless") {
        outbound.settings = {
            vnext: [
                {
                    address: parsed.address,
                    port: parsed.port,
                    users: [
                        {
                            id: parsed.id,
                            encryption: parsed.encryption || "auto",
                            alterId: parsed.aid || 0
                        }
                    ]
                }
            ]
        };
        outbound.streamSettings = {
            network: parsed.net,
            security: parsed.tls
        };

        if (parsed.tls === "reality") {
            outbound.streamSettings.realitySettings = {
                serverName: parsed.host,
                publicKey: parsed.publicKey,
                shortId: parsed.shortId,
                fingerprint: parsed.fingerprint || "chrome"
            };
        }

        if (parsed.net === "ws") {
            outbound.streamSettings.wsSettings = {
                path: parsed.path,
                headers: {Host: parsed.host}
            };
        }

        if (parsed.net === "tcp" && parsed.headerType === "http") {
            outbound.streamSettings.tcpSettings = {
                header: {
                    type: "http",
                    request: {headers: {Host: [parsed.host]}}
                }
            };
        }
    }

    if (parsed.protocol === "trojan") {
        outbound.settings = {
            servers: [
                {
                    address: parsed.address,
                    port: parsed.port,
                    password: parsed.password,
                    level: 0
                }
            ]
        };
        outbound.streamSettings = {security: "tls", tlsSettings: {}};
        if (parsed.sni) {
            outbound.streamSettings.tlsSettings.serverName = parsed.sni;
        }
    }

    if (parsed.protocol === "shadowsocks") {
        outbound.settings = {
            servers: [
                {
                    address: parsed.address,
                    port: parsed.port,
                    method: parsed.method,
                    password: parsed.password,
                    level: 0
                }
            ]
        };
    }

    config.outbounds.push(outbound);

    const configPath = path.join(__dirname, `v2ray_temp_${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return new Promise((resolve) => {
        const proc = execFile("./bin/xray", ["-config", configPath]);
        let errorLog = "";
        let timeout;

        const finish = (result) => {
            clearTimeout(timeout);
            try {
                fs.unlinkSync(configPath);
            } catch (e) {
            }
            proc.kill();
            resolve(result);
        };

        const testLogic = async () => {
            try {
                const res = await axios.get("http://www.google.com/generate_204", {
                    proxy: false,
                    timeout: 7000,
                    httpAgent: new SocksProxyAgent(`socks5h://127.0.0.1:${port}`)
                });
                finish({success: true, status: res.status, port});
            } catch (err) {
                finish({success: false, error: err.message, logs: errorLog});
            }
        };

        proc.stderr.on("data", (data) => (errorLog += data.toString()));
        proc.stdout.on("data", (data) => {
            data = data.toString();
            if (data.includes("started") || data.includes("Xray") || data.includes("socks")) {
                testLogic();
            }
        });

        // اگر تا 10 ثانیه راه نیفتاد خودش fail بشه
        timeout = setTimeout(() => {
            finish({success: false, error: "Timeout: Xray did not start in time", logs: errorLog});
        }, 10000);
    });
}

function sleep(ms) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    })
}

async function addConfig(rawUrl) {
    try {
        //await sleep(50);
        if (rawUrl.startsWith("#")) {
            return false;
        }

        if (rawUrl.trim() === "" || rawUrl.trim() === "\n") {
            return false;
        }
        let parsed;
        if (rawUrl.startsWith("vmess://")) parsed = parseVmess(rawUrl);
        else if (rawUrl.startsWith("vless://")) parsed = parseVless(rawUrl);
        else if (rawUrl.startsWith("trojan://")) parsed = parseTrojan(rawUrl);
        else if (rawUrl.startsWith("ss://")) parsed = parseShadowsocks(rawUrl);
        else {
            return false;
        }

        let uniqueValue = `${parsed.address}:${parsed.address}/`;
        if (parsed.protocol === "vmess" || parsed.protocol === "vless") {
            uniqueValue += "" + parsed.id;
        } else {
            uniqueValue += parsed.password;
        }
        let result = await ConfigModel.findOne({
            uniqueValue: uniqueValue,
        });

        if (result) {
            return false;
        }
        const config = new ConfigModel({
            uri: rawUrl,
            type: parsed.protocol,
            uniqueValue,
        });
        await config.save();
        return true;
    } catch (e) {
        return false;
    }
}

function getConfigsToTest(limit = 100) {
    return ConfigModel.find({
        connectionStatus: false,
        tries: {$lte: 10}, // فقط کانفیگ‌هایی که tries حداکثر 10 هستن
        trash: {$ne: true} // Exclude connections in trash
    })
        .sort({
            tries: 1,        // اولویت با tries کمتر
            createdAt: 1     // در صورت برابر بودن، اولویت با قدیمی‌ترها
        })
        .limit(limit);
}

function getConfigsToTestNoTry(limit = 100) {
    return ConfigModel.find({
        connectionStatus: false,
        trash: {$ne: true} // Exclude connections in trash
    })
        .sort({
            tries: 1,        // اولویت با tries کمتر
            createdAt: 1     // در صورت برابر بودن، اولویت با قدیمی‌ترها
        })
        .limit(limit);
}

function getConnectedConfigsToTest(limit = 100) {
    return ConfigModel.find({
        connectionStatus: true,
        trash: {$ne: true} // Exclude connections in trash
    })
        .sort({
            lastModifiedAt: 1     // در صورت برابر بودن، اولویت با قدیمی‌ترها
        })
        .limit(limit);
}


function getConfigsToTestOverTenTry(limit = 100) {
    return ConfigModel.find({
        connectionStatus: false,
        tries: {$gte: 11}, // فقط کانفیگ‌هایی که tries حداکثر 10 هستن
        trash: {$ne: true} // Exclude connections in trash
    })
        .sort({
            tries: 1,        // اولویت با tries کمتر
            createdAt: 1     // در صورت برابر بودن، اولویت با قدیمی‌ترها
        })
        .limit(limit);
}

module.exports.urlTest = testV2rayConfig;
module.exports.addConfig = addConfig;
module.exports.getConfigsToTest = getConfigsToTest;
module.exports.getConnectedConfigsToTest = getConnectedConfigsToTest;
module.exports.getConfigsToTestOverTenTry = getConfigsToTestOverTenTry;
module.exports.getConfigsToTestNoTry = getConfigsToTestNoTry;