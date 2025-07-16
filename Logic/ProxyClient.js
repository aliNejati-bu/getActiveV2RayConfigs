const fs = require("fs");
const path = require("path");
const {execFile} = require("child_process");
const axios = require("axios");
const {SocksProxyAgent} = require("socks-proxy-agent");
const getPort = require("get-port");
const os = require("node:os");

class ProxyClient {
    constructor(url) {
        this.url = url;
        this.proc = null;
        this.port = null;
        this.configPath = null;
    }

    async connect() {
        const parsed = this.parseUrl(this.url);
        this.port = await getPort();

        const config = this.buildConfig(parsed, this.port);
        this.configPath = path.join(__dirname, `v2ray_temp_${Date.now()}-${Math.random()}.json`);
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

        return new Promise((resolve, reject) => {
            if (os.platform() === "win32") {
                this.proc = execFile("./bin/xray.exe", ["-config", this.configPath]);
            } else {
                this.proc = execFile("./bin/xray", ["-config", this.configPath]);
            }
            let errorLog = "";

            this.proc.stderr.on("data", (data) => {
                errorLog += data.toString();
            });

            this.proc.stdout.on("data", (data) => {
                data = data.toString();
                if (data.includes("started")) {
                    resolve(true);
                }
            });

            this.proc.on("error", (err) => {
                reject(err);
            });

            setTimeout(() => {
                reject(new Error("Timeout waiting for xray to start"));
            }, 7000);
        });
    }

    async disconnect() {
        if (this.proc) this.proc.kill();
        if (this.configPath && fs.existsSync(this.configPath)) fs.unlinkSync(this.configPath);
        this.proc = null;
        this.port = null;
        this.configPath = null;
    }

    async get(url, config = {}) {
        return this.request({method: "get", url, ...config});
    }

    async post(url, data = {}, config = {}) {
        return this.request({method: "post", url, data, ...config});
    }

    async request(config) {
        if (!this.port) throw new Error("Proxy is not connected. Call connect() first.");
        const agent = new SocksProxyAgent(`socks5h://127.0.0.1:${this.port}`);
        return axios({
            ...config,
            httpAgent: agent,
            httpsAgent: agent,
            proxy: false,
        });
    }

    parseUrl(url) {
        url = url.trim();

        if (url.startsWith("vmess://")) {
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

        if (url.startsWith("vless://")) {
            const match = url.match(/^vless:\/\/(.*?)@(.*?):(\d+)\?(.*?)(#.*)?$/);
            if (!match) throw new Error("Invalid VLESS URL format");
            const [_, userInfo, address, port, query] = match;
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

        if (url.startsWith("trojan://")) {
            const match = url.match(/^trojan:\/\/(.*?)@(.*?):(\d+)\??(.*)?$/);
            if (!match) throw new Error("Invalid Trojan URL format");
            const [_, password, address, port, query] = match;
            const params = Object.fromEntries(new URLSearchParams(query));
            return {
                protocol: "trojan",
                address,
                port: parseInt(port),
                password,
                sni: params.sni || undefined
            };
        }

        if (url.startsWith("ss://")) {
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

        throw new Error("Unsupported URL scheme");
    }

    buildConfig(parsed, port) {
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
        return config;
    }
}

module.exports.ProxyClient = ProxyClient;
