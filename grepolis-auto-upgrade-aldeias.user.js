// ==UserScript==
// @name         DEVICE AUTO-UPGRADE, UNLOCK & HUMANIZER (Central Integrated)
// @namespace    Device
// @version      3.7
// @description  Central de controle, simulação humana, desbloqueio e Auto Upgrade integrado ao HumanizerCentral
// @author       Device Grepolis
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const MODULE_NAME = "HumanizerCentral";
    const UPGRADE_MODULE_NAME = "AutoUpgrade";

    const Utils = {
        getUnsafeWindow: () => typeof unsafeWindow !== 'undefined' ? unsafeWindow : window,
        sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        getRandom: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,

        isBlocked: () => {
            const uw = Utils.getUnsafeWindow();
            const captchaContainer = document.getElementById('hcaptcha-container');
            const botCheckModal = document.querySelector('.bot_check, .bot_check_window, iframe[src*="hcaptcha"]');
            const gameBotCheck = uw.BotCheck && typeof uw.BotCheck.isBotCheckActive === 'function' ? uw.BotCheck.isBotCheckActive() : false;
            return !!(captchaContainer || botCheckModal || gameBotCheck);
        },

        sendDiscordAlert: (msg) => {
            console.error(`🚨 [${MODULE_NAME}] ALERTA DE CAPTCHA / SEGURANÇA: ${msg}`);
            const uw = Utils.getUnsafeWindow();
            if (uw.DeviceCentral && typeof uw.DeviceCentral.sendAlert === 'function') {
                uw.DeviceCentral.sendAlert(MODULE_NAME, msg);
            }
        }
    };

    const uw = Utils.getUnsafeWindow();

    // ==========================================
    // CLASSE DE CONTROLE DE FLUXO E SEMÁFORO LOCAL
    // ==========================================
    class DeviceFlowManager {
        constructor() {
            this.isBusy = false;       // Semáforo geral da conta
            this.queue = [];            // Fila para scripts secundários
            this.isFarmActive = false; // Flag de prioridade máxima do Farm
        }

        // Utilitário global de espera randômica (Jitter) com log detalhado
        async randomDelay(minSec, maxSec) {
            const ms = Utils.getRandom(minSec * 1000, maxSec * 1000);
            const seconds = (ms / 1000).toFixed(1);
            console.log(`⏱️ [${MODULE_NAME}] Aplicando delay/respiro de ${seconds} segundos (${ms}ms)...`);
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // Fila para scripts comuns (Respeita o jitter de 3 a 25 segundos entre requisições)
        async requestQueue(scriptName, actionCallback) {
            return new Promise((resolve) => {
                this.queue.push({ scriptName, actionCallback, resolve });
                this.processQueue();
            });
        }

        async processQueue() {
            if (this.isBusy || this.isFarmActive || this.queue.length === 0) return;
            
            if (Utils.isBlocked()) {
                Utils.sendDiscordAlert("CAPTCHA detectado! Fila pausada.");
                return;
            }

            this.isBusy = true;
            const currentTask = this.queue.shift();
            console.log(`[${MODULE_NAME}] Fluxo autorizado para o script: ${currentTask.scriptName}`);

            try {
                await currentTask.actionCallback();
            } catch (e) {
                console.error(`[${MODULE_NAME}] Erro na task de ${currentTask.scriptName}:`, e);
            }

            const delaySec = Utils.getRandom(3, 25);
            console.log(`[${MODULE_NAME}] Respiro de segurança (Jitter pós-requisição) configurado.`);
            await this.randomDelay(delaySec, delaySec);

            this.isBusy = false;
            this.processQueue();
        }

        // PRIORIDADE MÁXIMA: Auto-Farm (Pausa a fila e assume o controle exclusivo)
        async executeFarmPriority(farmCallback) {
            this.isFarmActive = true;
            console.log(`[${MODULE_NAME}] 🚨 Prioridade Máxima acionada: Auto-Farm assumindo controle absoluto!`);

            try {
                await farmCallback();
            } catch (e) {
                console.error(`[${MODULE_NAME}] Erro durante a execução prioritária do Farm:`, e);
            }

            console.log(`[${MODULE_NAME}] ⏱️ Iniciando respiro de segurança pós-ciclo de Farm.`);
            await this.randomDelay(2, 5);
            this.isFarmActive = false;
            console.log(`[${MODULE_NAME}] ✅ Ciclo de Farm finalizado. Fila comum liberada.`);
            
            this.processQueue();
        }
    }

    // Exporta a central globalmente
    uw.DeviceCentral = new DeviceFlowManager();

    // ==========================================
    // LÓGICA DE NAVEGAÇÃO HUMANA ORIGINAL
    // ==========================================
    async function ensureCityView() {
        const cityBtn = document.querySelector('.option.city_overview');
        const isCityActive = cityBtn && (cityBtn.classList.contains('checked') || cityBtn.classList.contains('active'));

        if (!isCityActive) {
            if (cityBtn) {
                cityBtn.click();
            } else {
                const altBtn = document.querySelector('.btn_city_overview, .icon_city_overview');
                if (altBtn) altBtn.click();
            }
            console.log(`⏱️ [${MODULE_NAME}] Delay de navegação: aguardando 1.5s para carregar a visão da cidade...`);
            await Utils.sleep(1500);
        }
    }

    async function ensureIslandView() {
        try {
            if (uw.WMC && typeof uw.WMC.showMap === 'function') {
                uw.WMC.showMap();
            } else if (uw.Layout && typeof uw.Layout.showIslandView === 'function') {
                uw.Layout.showIslandView();
            } else {
                const btnIsland = document.querySelector('.option_island_view, .circle_button[name="island_view"]');
                if (btnIsland) btnIsland.click();
            }
            console.log(`[${MODULE_NAME}] Visão da ilha aplicada ao finalizar o ciclo.`);
        } catch (e) {
            console.warn(`[${MODULE_NAME}] Erro ao retornar para a visão da ilha:`, e);
        }
    }

    async function closeCurrentWindow() {
        try {
            if (uw.GPWindowMgr) {
                if (typeof uw.GPWindowMgr.closeAll === 'function') {
                    uw.GPWindowMgr.closeAll();
                } else if (typeof uw.GPWindowMgr.getOpenWindows === 'function') {
                    const openWindows = uw.GPWindowMgr.getOpenWindows();
                    for (let windowId in openWindows) {
                        if (Object.prototype.hasOwnProperty.call(openWindows, windowId) && openWindows[windowId].close) {
                            openWindows[windowId].close();
                        }
                    }
                }
                console.log(`⏱️ [${MODULE_NAME}] Delay de fechamento: aguardando 1.0s...`);
                await Utils.sleep(1000);
                return;
            }

            const closeButtons = document.querySelectorAll('.gpwindow_frame .close, .ui-dialog-titlebar-close, .js-window-close, a.close');
            if (closeButtons.length > 0) {
                closeButtons.forEach(btn => btn.click());
                console.log(`⏱️ [${MODULE_NAME}] Delay de fechamento de janelas: aguardando 1.0s...`);
                await Utils.sleep(1000);
            }
        } catch (e) {
            console.warn(`[${MODULE_NAME}] Erro ao fechar janela:`, e);
        }
    }

    const TARGET_BUILDINGS = ['main', 'place', 'barracks', 'docks', 'academy', 'farm', 'storage', 'wall', 'temple'];
    const TARGET_MENU_OPTIONS = ['messages', 'reports', 'alliance', 'ranking', 'profile', 'inventory'];

    async function openRandomTarget(target) {
        if (uw.DeviceCentral.isFarmActive) return;
        if (Utils.isBlocked()) {
            Utils.sendDiscordAlert("Captcha detectado durante a abertura de alvos!");
            return;
        }

        console.log(`[${MODULE_NAME}] Simulando navegação humana no alvo: ${target}`);

        try {
            if (TARGET_BUILDINGS.includes(target)) {
                await ensureCityView();
                console.log(`⏱️ [${MODULE_NAME}] Delay pré-abertura de edifício: aguardando 0.8s...`);
                await Utils.sleep(800);

                if (uw.BuildingWindowFactory && typeof uw.BuildingWindowFactory.openWindow === 'function') {
                    uw.BuildingWindowFactory.openWindow(target);
                } else if (uw.Layout && uw.Layout.buildingWindowFactory && typeof uw.Layout.buildingWindowFactory.openWindow === 'function') {
                    uw.Layout.buildingWindowFactory.openWindow(target);
                } else {
                    const mapArea = document.querySelector(`area[data-building="${target}"]`);
                    if (mapArea) mapArea.click();
                }
            } else if (TARGET_MENU_OPTIONS.includes(target)) {
                const menuItem = document.querySelector(`[data-option-id="${target}"], .${target} .name_wrapper`);
                if (menuItem) menuItem.click();
            }

            const openDuration = Utils.getRandom(3000, 7000);
            console.log(`⏱️ [${MODULE_NAME}] Alvo '${target}' aberto. Mantendo visualização por ${(openDuration / 1000).toFixed(1)} segundos...`);
            await Utils.sleep(openDuration);
            await closeCurrentWindow();
        } catch (e) {
            console.error(`[${MODULE_NAME}] Erro durante a execução do alvo ${target}:`, e);
        }
    }

    async function runHumanCycle() {
        if (uw.DeviceCentral.isFarmActive) {
            console.log(`⏱️ [${MODULE_NAME}] Farm ativo detectado. Adormecendo ciclo humano por 30 segundos...`);
            setTimeout(runHumanCycle, 30000);
            return;
        }

        if (Utils.isBlocked()) {
            Utils.sendDiscordAlert("CAPTCHA detectado! Ciclo pausado por segurança. Rechecando em 60s...");
            setTimeout(runHumanCycle, 60000);
            return;
        }

        const allTargets = [...TARGET_BUILDINGS, ...TARGET_MENU_OPTIONS];
        const count = Utils.getRandom(1, 6);
        console.log(`[${MODULE_NAME}] Iniciando ciclo humano com ${count} alvos selecionados...`);

        const shuffled = [...allTargets].sort(() => 0.5 - Math.random());
        const selectedTargets = shuffled.slice(0, count);

        for (const target of selectedTargets) {
            if (uw.DeviceCentral.isFarmActive) break;
            if (Utils.isBlocked()) {
                Utils.sendDiscordAlert("CAPTCHA detectado no meio do loop de alvos!");
                break;
            }
            await openRandomTarget(target);
            
            const intervalBetweenTargets = Utils.getRandom(2000, 4000);
            console.log(`⏱️ [${MODULE_NAME}] Intervalo entre alvos: aguardando ${(intervalBetweenTargets / 1000).toFixed(1)} segundos...`);
            await Utils.sleep(intervalBetweenTargets);
        }

        await ensureIslandView();

        const nextInterval = Utils.getRandom(60000, 780000);
        console.log(`⏱️ [${MODULE_NAME}] Ciclo finalizado. Próxima execução em ${Math.round(nextInterval / 60000)} minutos (${nextInterval}ms).`);
        setTimeout(runHumanCycle, nextInterval);
    }

    // ==========================================
    // MÓDULO INTEGRADO: AUTO-UPGRADE & UNLOCK
    // ==========================================
    function AutoUpgradeHeadless() {
        this.running = false;
        this.init();
    }

    AutoUpgradeHeadless.prototype.sleep = function (ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    };

    AutoUpgradeHeadless.prototype.isCaptchaActive = function () {
        return Utils.isBlocked();
    };

    AutoUpgradeHeadless.prototype.getRandomInterval = function () {
        var BASE_TIME = 10 * 60 * 1000;
        var MAX_DELAY = 2 * 60 * 1000;
        var randomDelay = Math.floor(Math.random() * MAX_DELAY);
        var totalTime = BASE_TIME + randomDelay;
        var totalSeconds = Math.round(totalTime / 1000);
        console.log('[' + UPGRADE_MODULE_NAME + '] Próxima verificação de aldeias em ' + Math.floor(totalSeconds / 60) + 'm ' + (totalSeconds % 60) + 's.');
        return totalTime;
    };

    AutoUpgradeHeadless.prototype.init = function () {
        console.log('%c[' + UPGRADE_MODULE_NAME + '] Módulo de Desbloqueio e Upgrades integrado ao HumanizerCentral.', 'color: #ff9800; font-weight: bold;');
        this.scheduleNextRun(15000);
    };

    AutoUpgradeHeadless.prototype.scheduleNextRun = function (ms) {
        var self = this;
        setTimeout(async function () {
            await self.executeCycle();
        }, ms);
    };

    AutoUpgradeHeadless.prototype.executeCycle = async function () {
        if (this.running) return;

        if (this.isCaptchaActive()) {
            this.scheduleNextRun(30000);
            return;
        }

        this.running = true;

        try {
            // Solicita prioridade máxima de farm à Central unificada (pausa a navegação humana e a fila comum)
            if (uw.DeviceCentral && typeof uw.DeviceCentral.executeFarmPriority === 'function') {
                await uw.DeviceCentral.executeFarmPriority(async () => {
                    console.log('[' + UPGRADE_MODULE_NAME + '] Iniciando gerenciamento de aldeias agrícolas...');
                    await this.manageFarmTowns();
                });
            } else {
                await this.manageFarmTowns();
            }
        } catch (e) {
            console.error('[' + UPGRADE_MODULE_NAME + '] Erro na execução:', e);
        } finally {
            this.running = false;
            this.scheduleNextRun(this.getRandomInterval());
        }
    };

    AutoUpgradeHeadless.prototype.generateList = function () {
        var islands = new Set();
        var townsList = [];

        try {
            var collection = uw.MM.getOnlyCollectionByName('Town');
            if (!collection || !collection.models) return townsList;

            var towns = collection.models;
            for (var i = 0; i < towns.length; i++) {
                var attributes = towns[i].attributes;
                if (!attributes) continue;

                if (attributes.on_small_island || islands.has(attributes.island_id)) {
                    continue;
                }

                islands.add(attributes.island_id);
                townsList.push(attributes.id);
            }
        } catch (e) {
            console.error('[' + UPGRADE_MODULE_NAME + '] Erro em generateList:', e);
        }

        return townsList;
    };

    AutoUpgradeHeadless.prototype.hasEnoughBattlePoints = function () {
        try {
            var pointsElement = document.querySelector('.nui_battlepoints_container .points');
            if (pointsElement) {
                var rawText = pointsElement.innerText.trim();
                var pointsValue = parseInt(rawText, 10);
                if (!isNaN(pointsValue) && pointsValue > 0) {
                    return true;
                }
            }
        } catch (e) {
            console.error('[' + UPGRADE_MODULE_NAME + '] Erro ao ler pontos de combate:', e);
        }
        return false;
    };

    AutoUpgradeHeadless.prototype.manageFarmTowns = async function () {
        var relationCollection = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation');
        var farmCollection = uw.MM.getOnlyCollectionByName('FarmTown');

        if (!relationCollection || !farmCollection) return;

        var relations = relationCollection.models;
        var farmTowns = farmCollection.models;
        var towns = this.generateList();
        var now = Math.floor(Date.now() / 1000);

        for (var i = 0; i < towns.length; i++) {
            if (this.isCaptchaActive()) break;

            var townId = towns[i];
            var town = uw.ITowns.towns[townId];
            if (!town) continue;

            var x = town.getIslandCoordinateX();
            var y = town.getIslandCoordinateY();

            for (var f = 0; f < farmTowns.length; f++) {
                var farm = farmTowns[f];
                if (!farm || !farm.attributes || farm.attributes.island_x != x || farm.attributes.island_y != y) continue;

                var farmTownId = farm.attributes.id;

                var existingRelation = null;
                for (var r = 0; r < relations.length; r++) {
                    var rel = relations[r];
                    if (rel && rel.attributes && rel.attributes.farm_town_id === farmTownId) {
                        existingRelation = rel.attributes;
                        break;
                    }
                }

                if (!existingRelation) {
                    continue;
                }

                // 1. DESBLOQUEIO COM VALIDAÇÃO DE PONTOS
                if (existingRelation.relation_status === 0 || existingRelation.relation_status === null || existingRelation.relation_status === undefined) {
                    if (!this.hasEnoughBattlePoints()) {
                        console.log('[' + UPGRADE_MODULE_NAME + '] Pontos de combate insuficientes para desbloquear a aldeia ' + farmTownId + '. Pulando...');
                        continue;
                    }

                    console.log('[' + UPGRADE_MODULE_NAME + '] Desbloqueando aldeia agrícola ID ' + farmTownId + ' (Relação ID: ' + existingRelation.id + ')...');

                    this.sendUnlockRequest(townId, farmTownId, existingRelation.id);
                    await this.sleep(1500 + Math.random() * 1000);
                    continue;
                }

                // 2. UPGRADE (Até Nível 3) COM VALIDAÇÃO DE PONTOS
                if (existingRelation.relation_status === 1) {
                    var currentStage = existingRelation.expansion_stage || 1;
                    var expansionInProgress = existingRelation.expansion_at && existingRelation.expansion_at > now;

                    if (currentStage < 3 && !expansionInProgress) {
                        if (!this.hasEnoughBattlePoints()) {
                            console.log('[' + UPGRADE_MODULE_NAME + '] Pontos de combate insuficientes para evoluir a aldeia ' + farmTownId + '. Pulando...');
                            continue;
                        }

                        console.log('[' + UPGRADE_MODULE_NAME + '] Atualizando Aldeia ID ' + farmTownId + ' (Nível atual: ' + currentStage + ' -> Alvo: Nível ' + (currentStage + 1) + ')');

                        this.sendUpgradeRequest(townId, farmTownId, existingRelation.id);
                        await this.sleep(1000 + Math.random() * 500);
                    }
                }
            }
        }
    };

    AutoUpgradeHeadless.prototype.sendUnlockRequest = function (townId, farmTownId, relationId) {
        var data = {
            model_url: 'FarmTownPlayerRelation/' + relationId,
            action_name: 'unlock',
            captcha: null,
            arguments: { farm_town_id: farmTownId },
            town_id: townId,
            nl_init: true
        };

        try {
            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false, function (response) {
                console.log('[' + UPGRADE_MODULE_NAME + '] Aldeia agrícola ' + farmTownId + ' desbloqueada com sucesso!');
            });
        } catch (e) {
            console.error('[' + UPGRADE_MODULE_NAME + '] Erro ao desbloquear aldeia ' + farmTownId, e);
        }
    };

    AutoUpgradeHeadless.prototype.sendUpgradeRequest = function (townId, farmTownId, relationId) {
        var data = {
            model_url: 'FarmTownPlayerRelation/' + relationId,
            action_name: 'upgrade',
            captcha: null,
            arguments: { farm_town_id: farmTownId },
            town_id: townId,
            nl_init: true
        };

        try {
            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false, function (response) {
                console.log('[' + UPGRADE_MODULE_NAME + '] Upgrade enviado para a aldeia ' + farmTownId);
            });
        } catch (e) {
            console.error('[' + UPGRADE_MODULE_NAME + '] Erro ao enviar upgrade para aldeia ' + farmTownId, e);
        }
    };

    // Inicialização da Central e do Ciclo Humano + Módulo Auto-Upgrade
    setTimeout(() => {
        if (!uw.Game || !uw.Game.world_id) return;
        console.log(`%c[${MODULE_NAME} v3.7] Central de Fluxo, Humanizador e Auto-Upgrade Integrados!`, "color: #00bcd4; font-weight: bold;");
        
        // Inicia navegação humana
        setTimeout(runHumanCycle, 10000);

        // Inicia gerenciador de aldeias agrícolas / upgrades
        if (!uw.__DEVICE_AUTOUPGRADE_INSTANCE) {
            uw.__DEVICE_AUTOUPGRADE_INSTANCE = new AutoUpgradeHeadless();
        }
    }, 5000);

})();
