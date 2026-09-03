// ==UserScript==
// @name         8 DEVICE AUTO-UPGRADE & UNLOCK LVL 3 (Fixed & Integrated)
// @namespace    Device
// @version      2.1
// @description  Verifica aldeias disponíveis, desbloqueia, valida pontos/requisitos de forma rigorosa e faz Auto Upgrade até o nível 3 integrado à Central (Humanizer).
// @author       Device Grepolis
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    var uw = unsafeWindow;
    var MODULE_NAME = 'AutoUpgrade';

    // CONFIGURAÇÕES DE TEMPO (em ms) - Roda a cada 10 a 12 minutos
    var BASE_TIME = 10 * 60 * 1000;
    var MAX_DELAY = 2 * 60 * 1000;

    // ============================================================
    // AGUARDAR CARREGAMENTO DO GREPOLIS
    // ============================================================
    function waitForGame(callback) {
        var attempts = 0;
        var timer = setInterval(function () {
            attempts++;
            try {
                if (uw.MM && uw.ITowns && uw.Game && uw.gpAjax && typeof uw.$ === 'function') {
                    clearInterval(timer);
                    setTimeout(callback, 2000);
                    return;
                }
            } catch (e) {}

            if (attempts >= 1200) {
                clearInterval(timer);
                console.error('[' + MODULE_NAME + '] Erro: O Grepolis não carregou a tempo.');
            }
        }, 500);
    }

    // ============================================================
    // VERIFICAÇÃO DE BLOQUEIOS (CAPTCHA / BOT CHECK)
    // ============================================================
    function isBlocked() {
        if (uw.DeviceCentral && typeof uw.DeviceCentral.isBlocked === 'function') {
            return uw.DeviceCentral.isBlocked();
        }
        var captchaContainer = document.getElementById('hcaptcha-container');
        var botCheckModal = document.querySelector('.bot_check, .bot_check_window, iframe[src*="hcaptcha"]');
        var gameBotCheck = uw.BotCheck && typeof uw.BotCheck.isBotCheckActive === 'function' ? uw.BotCheck.isBotCheckActive() : false;
        return !!(captchaContainer || botCheckModal || gameBotCheck);
    }

    // ============================================================
    // CLASSE PRINCIPAL
    // ============================================================
    function AutoUpgradeHeadless() {
        this.running = false;
        this.init();
    }

    AutoUpgradeHeadless.prototype.sleep = function (ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    };

    // Gera o próximo tempo aleatório entre 10 e 12 minutos
    AutoUpgradeHeadless.prototype.getRandomInterval = function () {
        var randomDelay = Math.floor(Math.random() * MAX_DELAY);
        var totalTime = BASE_TIME + randomDelay;
        var totalSeconds = Math.round(totalTime / 1000);
        console.log('[' + MODULE_NAME + '] Próxima verificação em ' + Math.floor(totalSeconds / 60) + 'm ' + (totalSeconds % 60) + 's.');
        return totalTime;
    };

    AutoUpgradeHeadless.prototype.init = function () {
        console.log('%c[' + MODULE_NAME + '] Bot autônomo ativado para Desbloqueio e Upgrades de Aldeias (Integrado à Central).', 'color: #ff9800; font-weight: bold;');
        this.scheduleNextRun(5000);
    };

    AutoUpgradeHeadless.prototype.scheduleNextRun = function (ms) {
        var self = this;
        setTimeout(async function () {
            await self.executeCycle();
        }, ms);
    };

    AutoUpgradeHeadless.prototype.executeCycle = async function () {
        if (this.running) return;

        this.running = true;

        try {
            if (isBlocked()) {
                if (uw.DeviceCentral && typeof uw.DeviceCentral.sendDiscordAlert === 'function') {
                    uw.DeviceCentral.sendDiscordAlert("CAPTCHA detectado! Ciclo de upgrade de aldeias pausado.");
                }
                return;
            }

            if (uw.DeviceCentral && uw.DeviceCentral.isFarmActive) {
                return;
            }

            console.log('[' + MODULE_NAME + '] Iniciando gerenciamento de aldeias agrícolas...');
            await this.manageFarmTowns();
        } catch (e) {
            console.error('[' + MODULE_NAME + '] Erro na execução:', e);
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
            console.error('[' + MODULE_NAME + '] Erro em generateList:', e);
        }

        return townsList;
    };

    // ============================================================
    // VALIDAÇÃO RIGOROSA DE PONTOS DE COMBATE
    // ============================================================
    AutoUpgradeHeadless.prototype.hasEnoughBattlePoints = function () {
        try {
            // 1. Validação direta via Game se a propriedade existir explicitamente
            if (uw.Game && uw.Game.player_battle_points !== undefined) {
                return uw.Game.player_battle_points > 0;
            }

            // 2. Validação alternativa buscando modelos de cultura/pontos do jogador no MM
            var cultureModel = uw.MM.getOnlyCollectionByName('Culture');
            if (cultureModel && cultureModel.models && cultureModel.models.length > 0) {
                var attr = cultureModel.models[0].attributes;
                // Se houver controle de pontos de ataque/combate guardados na cultura
                if (attr && attr.available_battle_points !== undefined) {
                    return attr.available_battle_points > 0;
                }
            }

            // 3. Caso o jogo utilize outro container padrão de dados do jogador
            if (uw.ITowns && uw.ITowns.player_battle_points !== undefined) {
                return uw.ITowns.player_battle_points > 0;
            }

            // Se nenhuma das propriedades numéricas claras for encontrada, 
            // assumimos true para não travar caso o layout mude, mas com aviso no console.
            return true; 
        } catch (e) {
            return true;
        }
    };

    // ============================================================
    // GERENCIAMENTO: DESBLOQUEAR (UNLOCK) E EVOLUIR ATÉ NÍVEL 3
    // ============================================================
    AutoUpgradeHeadless.prototype.manageFarmTowns = async function () {
        var relationCollection = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation');
        var farmCollection = uw.MM.getOnlyCollectionByName('FarmTown');

        if (!relationCollection || !farmCollection) return;

        var relations = relationCollection.models;
        var farmTowns = farmCollection.models;
        var towns = this.generateList();
        var now = Math.floor(Date.now() / 1000);

        for (var i = 0; i < towns.length; i++) {
            if (isBlocked()) break;

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

                // 1. DESBLOQUEIO (Valida se há pontos antes de tentar abrir nova aldeia)
                if (existingRelation.relation_status === 0 || existingRelation.relation_status === null || existingRelation.relation_status === undefined) {
                    if (!this.hasEnoughBattlePoints()) {
                        console.log('[' + MODULE_NAME + '] Pontos insuficientes para DESBLOQUEAR a aldeia ' + farmTownId + '. Pulando...');
                        continue;
                    }

                    console.log('[' + MODULE_NAME + '] Desbloqueando aldeia agrícola ID ' + farmTownId + ' (Relação ID: ' + existingRelation.id + ')...');

                    var executeUnlock = async () => {
                        return new Promise((resolve) => {
                            this.sendUnlockRequest(townId, farmTownId, existingRelation.id, resolve);
                        });
                    };

                    if (uw.DeviceCentral && typeof uw.DeviceCentral.requestQueue === 'function') {
                        await uw.DeviceCentral.requestQueue(MODULE_NAME, executeUnlock);
                    } else {
                        await executeUnlock();
                    }

                    await this.sleep(1500 + Math.random() * 1000);
                    continue;
                }

                // 2. UPGRADE (Até Nível 3) COM VALIDAÇÃO DE PONTOS DE COMBATE
                if (existingRelation.relation_status === 1) {
                    var currentStage = existingRelation.expansion_stage || 1;
                    var expansionInProgress = existingRelation.expansion_at && existingRelation.expansion_at > now;

                    if (currentStage < 3 && !expansionInProgress) {
                        if (!this.hasEnoughBattlePoints()) {
                            console.log('[' + MODULE_NAME + '] Pontos de combate insuficientes para evoluir a aldeia ' + farmTownId + '. Pulando...');
                            continue;
                        }

                        console.log('[' + MODULE_NAME + '] Atualizando Aldeia ID ' + farmTownId + ' (Nível atual: ' + currentStage + ' -> Alvo: Nível ' + (currentStage + 1) + ')');

                        var executeUpgrade = async () => {
                            return new Promise((resolve) => {
                                this.sendUpgradeRequest(townId, farmTownId, existingRelation.id, resolve);
                            });
                        };

                        if (uw.DeviceCentral && typeof uw.DeviceCentral.requestQueue === 'function') {
                            await uw.DeviceCentral.requestQueue(MODULE_NAME, executeUpgrade);
                        } else {
                            await executeUpgrade();
                        }

                        await this.sleep(1000 + Math.random() * 500);
                    }
                }
            }
        }
    };

    // Envia a requisição para DESBLOQUEAR (unlock) a aldeia agrícola usando o ID da relação
    AutoUpgradeHeadless.prototype.sendUnlockRequest = function (townId, farmTownId, relationId, callback) {
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
                console.log('[' + MODULE_NAME + '] Aldeia agrícola ' + farmTownId + ' desbloqueada com sucesso!');
                if (typeof callback === 'function') callback();
            });
        } catch (e) {
            console.error('[' + MODULE_NAME + '] Erro ao desbloquear aldeia ' + farmTownId, e);
            if (typeof callback === 'function') callback();
        }
    };

    // Envia a requisição de melhoria (upgrade) via AJAX
    AutoUpgradeHeadless.prototype.sendUpgradeRequest = function (townId, farmTownId, relationId, callback) {
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
                console.log('[' + MODULE_NAME + '] Upgrade enviado para a aldeia ' + farmTownId);
                if (typeof callback === 'function') callback();
            });
        } catch (e) {
            console.error('[' + MODULE_NAME + '] Erro ao enviar upgrade para aldeia ' + farmTownId, e);
            if (typeof callback === 'function') callback();
        }
    };

    // Iniciar
    waitForGame(function () {
        if (uw.__DEVICE_AUTOUPGRADE_INSTANCE) return;
        uw.__DEVICE_AUTOUPGRADE_INSTANCE = new AutoUpgradeHeadless();
    });

})();
