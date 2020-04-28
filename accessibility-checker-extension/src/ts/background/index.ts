/******************************************************************************
     Copyright:: 2020- IBM, Inc

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
  *****************************************************************************/

import BackgroundMessaging from "../util/backgroundMessaging";
import EngineCache from './helper/engineCache';
import Config from "./helper/config";


async function initTab(tabId: number, archiveId: string) {
    let engineCode = await EngineCache.getEngine(archiveId);

    await new Promise((resolve, reject) => {
        chrome.tabs.executeScript(tabId, {
            code: engineCode + "window.ace = ace;",
            frameId: 0,
            matchAboutBlank: true
        }, function (_res) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError.message);
            }
            resolve();
        })
    });
    await new Promise((resolve, reject) => {
        chrome.tabs.executeScript(tabId, {
            file: "tabListeners.js",
            frameId: 0,
            matchAboutBlank: true
        }, function (_res) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError.message);
            }
            resolve();
        });
    });
}

BackgroundMessaging.addListener("DAP_CACHED", async (message: any) => {
    await BackgroundMessaging.sendToTab(message.tabId, "DAP_CACHED_TAB", { tabId: message.tabId });
    return true;
});

BackgroundMessaging.addListener("DAP_SCAN", async (message: any) => {
    chrome.storage.local.get("OPTIONS", async function (result: any) {
        // Determine which archive we're scanning with
        let archiveId = Config.defaultArchiveId + "";
        const archives = await EngineCache.getArchives();
        const validArchive = ((id : string) => id && archives.some(archive => archive.id === id));

        if (!validArchive(archiveId)) archiveId = "latest";
        if (result.OPTIONS && result.OPTIONS.selected_archive && validArchive(result.OPTIONS.selected_archive.id)) {
            archiveId = result.OPTIONS.selected_archive.id;
        }
        let selectedArchive = archives.filter(archive => archive.id === archiveId)[0];

        // Determine which policy we're scanning with
        let policyId : string = selectedArchive.policies[0].id;
        const validPolicy = ((id : string) => id && selectedArchive.policies.some(policy => policy.id === id));
        if (!validPolicy(policyId)) policyId = "IBM_Accessibility";
        if (result.OPTIONS && result.OPTIONS.selected_ruleset && validPolicy(result.OPTIONS.selected_ruleset.id)) {
            policyId = result.OPTIONS.selected_ruleset.id;
        }

        await initTab(message.tabId, archiveId);
        await BackgroundMessaging.sendToTab(message.tabId, "DAP_SCAN_TAB", { 
            tabId: message.tabId,
            archiveId: archiveId,
            policyId: policyId
        });
        return true;
    });
});

BackgroundMessaging.addListener("DAP_SCAN_TAB_COMPLETE", async (message: any) => {
    BackgroundMessaging.sendToPanel("DAP_SCAN_COMPLETE", message);
    return true;
})

BackgroundMessaging.addListener("DAP_Rulesets", async (message: any) => {


    return await new Promise((resolve, reject) => {

        chrome.storage.local.get("OPTIONS", async function (result: any) {
            let archiveId = Config.defaultArchiveId + "";

            if (result.OPTIONS) {
                archiveId = result.OPTIONS.selected_archive.id;
            }

            await initTab(message.tabId, archiveId);
            chrome.tabs.executeScript(message.tabId, {
                code: "new window.ace.Checker().rulesets;",
                frameId: 0,
                matchAboutBlank: true
            }, function (res) {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError.message);
                }
                resolve(res[0]);
            })
        })

    });
});
