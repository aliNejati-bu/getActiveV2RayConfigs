const fs = require("fs");
const path = require("path");
const {execFile} = require("child_process");
const axios = require("axios");
const {SocksProxyAgent} = require("socks-proxy-agent");
const getPort = require("get-port");
// --- Parsers for each protocol ---
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
        tls: data.tls === "tls" ? "tls" : "none",
        host: data.host,
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
        tls: params.security === "tls" ? "tls" : "none",
        net: params.type || "tcp",
        host: params.host || "",
        path: params.path || "",
        headerType: params.headerType || "none"
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

// --- Main Test Function ---
async function testV2rayConfig(rawUrl) {
    let parsed;
    if (rawUrl.startsWith("vmess://")) parsed = parseVmess(rawUrl);
    else if (rawUrl.startsWith("vless://")) parsed = parseVless(rawUrl);
    else if (rawUrl.startsWith("trojan://")) parsed = parseTrojan(rawUrl);
    else if (rawUrl.startsWith("ss://")) parsed = parseShadowsocks(rawUrl);
    else throw new Error("Unsupported protocol");
    console.log(parsed)
    const port = await getPort(); // پورت آزاد

    const config = {
        log: {loglevel: "warning"},
        inbounds: [{
            port,
            listen: "127.0.0.1",
            protocol: "socks",
            settings: {auth: "no"}
        }],
        outbounds: []
    };

    const outbound = {protocol: parsed.protocol};

    if (parsed.protocol === "vmess" || parsed.protocol === "vless") {
        outbound.settings = {
            vnext: [{
                address: parsed.address,
                port: parsed.port,
                users: [{
                    id: parsed.id,
                    encryption: parsed.encryption || "auto",
                    alterId: parsed.aid || 0
                }]
            }]
        };
        outbound.streamSettings = {
            network: parsed.net,
            security: parsed.tls
        };

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
            servers: [{
                address: parsed.address,
                port: parsed.port,
                password: parsed.password,
                level: 0
            }]
        };
        outbound.streamSettings = {security: "tls", tlsSettings: {}};
        if (parsed.sni) {
            outbound.streamSettings.tlsSettings.serverName = parsed.sni;
        }
    }

    if (parsed.protocol === "shadowsocks") {
        outbound.settings = {
            servers: [{
                address: parsed.address,
                port: parsed.port,
                method: parsed.method,
                password: parsed.password,
                level: 0
            }]
        };
    }

    config.outbounds.push(outbound);

    const configPath = path.join(__dirname, `v2ray_temp_${Date.now()}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return new Promise((resolve) => {
        const proc = execFile("./bin/xray.exe", ["-config", configPath]);
        let errorLog = "";

        proc.stderr.on("data", data => errorLog += data.toString());

        setTimeout(async () => {
            try {
                const res = await axios.get("http://www.google.com/generate_204", {
                    proxy: false,
                    timeout: 7000,
                    httpAgent: new SocksProxyAgent(`socks5h://127.0.0.1:${port}`)
                });

                proc.kill();
                fs.unlinkSync(configPath);
                resolve({success: true, status: res.status, port});
            } catch (err) {
                proc.kill();
                fs.unlinkSync(configPath);
                resolve({success: false, error: err.message, logs: errorLog});
            }
        }, 3000);
    });
}

module.exports.urlTest = testV2rayConfig;
