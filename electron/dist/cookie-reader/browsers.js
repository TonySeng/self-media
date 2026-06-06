"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBrowserProfiles = listBrowserProfiles;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
function getUserDataDirs() {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return [
        {
            browser: 'chrome',
            dir: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
        },
        {
            browser: 'edge',
            dir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
        },
        {
            browser: 'brave',
            dir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data'),
        },
    ].filter((b) => fs.existsSync(b.dir));
}
function getProfiles(userDataDir) {
    const profileNames = [];
    // 新しい Chrome（v96+）は Cookies を Profile/Network/Cookies に置く。古い版は Profile/Cookies。
    const hasCookies = (profileDir) => fs.existsSync(path.join(profileDir, 'Network', 'Cookies')) ||
        fs.existsSync(path.join(profileDir, 'Cookies'));
    if (hasCookies(path.join(userDataDir, 'Default'))) {
        profileNames.push('Default');
    }
    try {
        const entries = fs.readdirSync(userDataDir);
        for (const e of entries) {
            if (/^Profile \d+$/.test(e) && hasCookies(path.join(userDataDir, e))) {
                profileNames.push(e);
            }
        }
    }
    catch {
        // ignore
    }
    return profileNames;
}
function listBrowserProfiles() {
    const results = [];
    for (const { browser, dir } of getUserDataDirs()) {
        const browserName = browser === 'chrome' ? 'Chrome' : browser === 'edge' ? 'Edge' : 'Brave';
        for (const profile of getProfiles(dir)) {
            const displayName = profile === 'Default' ? '默认' : profile;
            results.push({
                browserType: browser,
                label: `${browserName} - ${displayName}`,
                profilePath: path.join(dir, profile),
            });
        }
    }
    return results;
}
